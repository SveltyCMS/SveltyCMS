/**
 * @file tests/unit/api/webhook-security.test.ts
 * @description Unit tests for Webhook API security, focusing on IDOR and tenant isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PATCH as dispatcherPATCH,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";
import { webhookService } from "@src/services/background/webhook-service";
import { createMockUser, createMockSuperAdmin } from "../utils/mock-factories";

// Mock webhook service
vi.mock("@src/services/background/webhook-service", () => ({
  webhookService: {
    getWebhooks: vi.fn().mockResolvedValue([]),
    saveWebhook: vi.fn().mockResolvedValue({ id: "webhook-1", name: "Test" }),
    deleteWebhook: vi.fn().mockResolvedValue(true),
    testWebhook: vi.fn().mockResolvedValue(true),
  },
}));

describe("Webhook API Security - IDOR and Tenant Isolation", () => {
  const mockUser = createMockUser({ _id: "user1", role: "admin" });
  const mockSuperAdmin = createMockSuperAdmin({
    _id: "admin1",
    role: "super-admin",
    email: "super@example.com",
  });
  const myTenant = "tenant-1";
  const otherTenant = "tenant-2";

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("List Webhooks (GET /api/webhooks)", () => {
    it("should only list webhooks for the current tenant for regular admin", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "webhooks" },
        request: { method: "GET", headers: new Headers() },
        url: new URL("http://localhost/api/webhooks"),
      } as any;

      await dispatcherGET(event);
      expect(webhookService.getWebhooks).toHaveBeenCalledWith(myTenant);
    });

    it("should allow super-admin to override tenantId via query parameter", async () => {
      const event = {
        locals: {
          user: mockSuperAdmin,
          tenantId: myTenant,
          __testBypass: true,
        },
        params: { path: "webhooks" },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/webhooks?tenantId=${otherTenant}`),
      } as any;

      await dispatcherGET(event);
      expect(webhookService.getWebhooks).toHaveBeenCalledWith(otherTenant);
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "webhooks" },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/webhooks?tenantId=${otherTenant}`),
      } as any;

      try {
        await dispatcherGET(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
      expect(webhookService.getWebhooks).not.toHaveBeenCalledWith(otherTenant);
    });

    it("should reject non-admins", async () => {
      const event = {
        locals: {
          user: { role: "user" },
          tenantId: myTenant,
          __testBypass: true,
        },
        params: { path: "webhooks" },
        request: { method: "POST", headers: new Headers() },
        url: new URL("http://localhost/api/webhooks"),
      } as any;

      try {
        await dispatcherPOST(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });
  });

  describe("Create Webhook (POST /api/webhooks)", () => {
    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "webhooks" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({
            url: "http://example.com",
            event: "entry:create",
          }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/webhooks"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPOST(event);
      expect(response.status).toBe(201);
      expect(webhookService.saveWebhook).toHaveBeenCalled();
    });
  });

  describe("IDOR Protection for specific Webhooks ([id])", () => {
    const webhookId = "webhook-1";

    it("should prevent updating a webhook that belongs to another tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { path: `webhooks/${webhookId}` },
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        url: new URL(`http://localhost/api/webhooks/${webhookId}`),
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue({ name: "Updated" }),
          headers: new Headers(),
        },
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPATCH(event);
      expect(response.status).toBe(404);
      expect(webhookService.saveWebhook).not.toHaveBeenCalled();
    });

    it("should prevent deleting a webhook that belongs to another tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { path: `webhooks/${webhookId}` },
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        url: new URL(`http://localhost/api/webhooks/${webhookId}`),
        request: { method: "DELETE", headers: new Headers() },
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherDELETE(event);
      expect(response.status).toBe(404);
      expect(webhookService.deleteWebhook).not.toHaveBeenCalled();
    });

    it("should allow updating if the webhook belongs to the current tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([
        { id: webhookId, tenantId: myTenant } as any,
      ]);

      const updates = { name: "Updated" };
      const event = {
        params: { path: `webhooks/${webhookId}` },
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        url: new URL(`http://localhost/api/webhooks/${webhookId}`),
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue(updates),
          headers: new Headers(),
        },
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPATCH(event);
      expect(response.status).toBe(200);
      expect(webhookService.saveWebhook).toHaveBeenCalledWith(
        { ...updates, id: webhookId },
        myTenant,
      );
    });

    it("should allow deleting if the webhook belongs to the current tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([
        { id: webhookId, tenantId: myTenant } as any,
      ]);

      const event = {
        params: { path: `webhooks/${webhookId}` },
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        request: { method: "DELETE", headers: new Headers() },
        url: new URL(`http://localhost/api/webhooks/${webhookId}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherDELETE(event);
      expect(response.status).toBe(200);
      expect(webhookService.deleteWebhook).toHaveBeenCalledWith(webhookId, myTenant);
    });
  });

  describe("IDOR Protection for Webhook Test Endpoint ([id]/test)", () => {
    const webhookId = "webhook-1";

    it("should prevent testing a webhook that belongs to another tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { path: `webhooks/${webhookId}/test` },
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        request: { method: "POST", json: vi.fn(), headers: new Headers() },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}/test`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPOST(event);
      expect(response.status).toBe(404);
      expect(webhookService.testWebhook).not.toHaveBeenCalled();
    });

    it("should allow super-admin to test webhooks", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([
        { id: webhookId, tenantId: myTenant } as any,
      ]);

      const event = {
        params: { path: `webhooks/${webhookId}/test` },
        locals: {
          user: mockSuperAdmin,
          tenantId: myTenant,
          __testBypass: true,
        },
        request: { method: "POST", json: vi.fn(), headers: new Headers() },
        url: new URL(`http://localhost/api/webhooks/${webhookId}/test`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPOST(event);
      expect(response.status).toBe(200);
      expect(webhookService.testWebhook).toHaveBeenCalled();
    });
  });
});
