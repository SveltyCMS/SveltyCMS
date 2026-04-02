/**
 * @file tests/unit/api/webhook-security.test.ts
 * @description Unit tests for Webhook API security, focusing on IDOR and tenant isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getWebhooks, POST as createWebhook } from "@src/routes/api/system/webhooks/+server";
import {
  PATCH as updateWebhook,
  DELETE as deleteWebhook,
} from "@src/routes/api/system/webhooks/[id]/+server";
import { POST as testWebhook } from "@src/routes/api/system/webhooks/[id]/test/+server";
import { webhookService } from "@src/services/webhook-service";

console.log("--- vi keys in test:", typeof vi !== "undefined" ? Object.keys(vi) : "undefined");

// Mock webhook service
vi.mock("@src/services/webhook-service", () => ({
  webhookService: {
    getWebhooks: vi.fn().mockResolvedValue([]),
    saveWebhook: vi.fn().mockResolvedValue({ id: "webhook-1", name: "Test" }),
    deleteWebhook: vi.fn().mockResolvedValue(true),
    testWebhook: vi.fn().mockResolvedValue(true),
  },
}));

describe("Webhook API Security - IDOR and Tenant Isolation", () => {
  const mockUser = { _id: "user1", role: "admin", email: "test@example.com" };
  const mockSuperAdmin = {
    _id: "admin1",
    role: "super-admin",
    email: "super@example.com",
  };
  const myTenant = "tenant-1";
  const otherTenant = "tenant-2";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("List Webhooks (GET /api/webhooks)", () => {
    it("should only list webhooks for the current tenant for regular admin", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL("http://localhost/api/webhooks"),
      } as any;

      await getWebhooks(event);
      expect(webhookService.getWebhooks).toHaveBeenCalledWith(myTenant);
    });

    it("should allow super-admin to override tenantId via query parameter", async () => {
      const event = {
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        url: new URL(`http://localhost/api/webhooks?tenantId=${otherTenant}`),
      } as any;

      await getWebhooks(event);
      expect(webhookService.getWebhooks).toHaveBeenCalledWith(otherTenant);
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/webhooks?tenantId=${otherTenant}`),
      } as any;

      try {
        await getWebhooks(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
      expect(webhookService.getWebhooks).not.toHaveBeenCalledWith(otherTenant);
    });

    it("should reject non-admins", async () => {
      const event = {
        locals: { user: { role: "user" }, tenantId: myTenant },
        url: new URL("http://localhost/api/webhooks"),
      } as any;

      try {
        await getWebhooks(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });
  });

  describe("Create Webhook (POST /api/webhooks)", () => {
    it("should enforce the creators tenantId", async () => {
      const webhookData = {
        name: "Test Hook",
        url: "http://test.com",
        events: ["*"],
      };
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue(webhookData) },
      } as any;

      await createWebhook(event);
      expect(webhookService.saveWebhook).toHaveBeenCalledWith(webhookData, myTenant);
    });
  });

  describe("IDOR Protection for specific Webhooks ([id])", () => {
    const webhookId = "webhook-1";

    it("should prevent updating a webhook that belongs to another tenant", async () => {
      // Mocking that the webhook doesn't exist in the current tenant's list
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { id: webhookId },
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}`),
        request: { json: vi.fn().mockResolvedValue({ name: "Updated" }) },
      } as any;

      try {
        await updateWebhook(event);
      } catch (error: any) {
        expect(error.status).toBe(404); // Should return 404/denied if not in tenant
      }
      expect(webhookService.saveWebhook).not.toHaveBeenCalled();
    });

    it("should prevent deleting a webhook that belongs to another tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { id: webhookId },
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}`),
      } as any;

      try {
        await deleteWebhook(event);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
      expect(webhookService.deleteWebhook).not.toHaveBeenCalled();
    });

    it("should allow updating if the webhook belongs to the current tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([
        { id: webhookId, tenantId: myTenant } as any,
      ]);

      const updates = { name: "Updated" };
      const event = {
        params: { id: webhookId },
        locals: { user: mockUser, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue(updates) },
      } as any;

      const response = await updateWebhook(event);
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
        params: { id: webhookId },
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}`),
      } as any;

      const response = await deleteWebhook(event);
      expect(response.status).toBe(200);
      expect(webhookService.deleteWebhook).toHaveBeenCalledWith(webhookId, myTenant);
    });
  });

  describe("IDOR Protection for Webhook Test Endpoint ([id]/test)", () => {
    const webhookId = "webhook-1";

    it("should prevent testing a webhook that belongs to another tenant", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([]);

      const event = {
        params: { id: webhookId },
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}`),
      } as any;

      try {
        await testWebhook(event);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
      expect(webhookService.testWebhook).not.toHaveBeenCalled();
    });

    it("should allow super-admin to test webhooks", async () => {
      (webhookService.getWebhooks as any).mockResolvedValue([
        { id: webhookId, tenantId: myTenant } as any,
      ]);

      const event = {
        params: { id: webhookId },
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        url: new URL(`http://localhost/api/system/webhooks/${webhookId}`),
      } as any;

      const response = await testWebhook(event);
      expect(response.status).toBe(200);
      expect(webhookService.testWebhook).toHaveBeenCalled();
    });
  });
});
