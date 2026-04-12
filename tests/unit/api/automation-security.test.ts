/**
 * @file tests/unit/api/automation-security.test.ts
 * @description Unit tests for Automation API security, focusing on IDOR and tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PATCH as dispatcherPATCH,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";
import { automationService } from "@src/services/automation/automation-service";

// Mock automation service
vi.mock("@src/services/automation/automation-service", () => ({
  automationService: {
    getFlows: vi.fn().mockResolvedValue([]),
    getFlow: vi.fn().mockResolvedValue(null),
    saveFlow: vi.fn().mockResolvedValue({ id: "flow-1", name: "Test" }),
    deleteFlow: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock settings service
vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true), // MULTI_TENANT = true
  getPublicSettingSync: vi.fn().mockReturnValue("mediaFolder"),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("@utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Automation API Security - IDOR and Tenant Isolation", () => {
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

  describe("List Automations (GET /api/automations)", () => {
    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        params: { path: "automations" },
        request: { method: "GET", headers: new Headers() },
        url: new URL("http://localhost/api/automations"),
        cookies: { get: vi.fn() },
      } as any;

      await dispatcherGET(event);
      expect(automationService.getFlow).toHaveBeenCalledWith(undefined, myTenant);
    });

    it("should allow super-admin to override tenantId via query parameter", async () => {
      const event = {
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        params: { path: "automations" },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/automations?tenantId=${otherTenant}`),
        cookies: { get: vi.fn() },
      } as any;

      await dispatcherGET(event);
      expect(automationService.getFlow).toHaveBeenCalledWith(undefined, otherTenant);
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        params: { path: "automations" },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/automations?tenantId=${otherTenant}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherGET(event);
      expect(response.status).toBe(403);
      expect(automationService.getFlow).not.toHaveBeenCalledWith(undefined, otherTenant);
    });
  });

  describe("IDOR Protection for specific Automations ([id])", () => {
    const flowId = "flow-1";

    it("should prevent getting a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { path: `automations/${flowId}` },
        locals: { user: mockUser, tenantId: myTenant },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/automations/${flowId}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherGET(event);
      expect(response.status).toBe(404);
      expect(automationService.getFlow).toHaveBeenCalledWith(flowId, myTenant);
    });

    it("should allow getting if the flow belongs to the current tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue({
        id: flowId,
        tenantId: myTenant,
      } as any);

      const event = {
        params: { path: `automations/${flowId}` },
        locals: { user: mockUser, tenantId: myTenant },
        request: { method: "GET", headers: new Headers() },
        url: new URL(`http://localhost/api/automations/${flowId}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherGET(event);
      expect(response.status).toBe(200);
      expect(automationService.getFlow).toHaveBeenCalledWith(flowId, myTenant);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        params: { path: "automations" },
        request: {
          method: "POST",
          json: vi
            .fn()
            .mockResolvedValue({ name: "New Flow", trigger: { type: "on_save" }, actions: [] }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/automations"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPOST(event);
      expect(response.status).toBe(201);
      expect(automationService.saveFlow).toHaveBeenCalled();
    });

    it("should prevent updating a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { path: `automations/${flowId}` },
        locals: { user: mockUser, tenantId: myTenant },
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue({ name: "Updated" }),
          headers: new Headers(),
        },
        url: new URL(`http://localhost/api/automations/${flowId}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherPATCH(event);
      expect(response.status).toBe(404);
      expect(automationService.saveFlow).not.toHaveBeenCalled();
    });

    it("should prevent deleting a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { path: `automations/${flowId}` },
        locals: { user: mockUser, tenantId: myTenant },
        request: { method: "DELETE", headers: new Headers() },
        url: new URL(`http://localhost/api/automations/${flowId}`),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcherDELETE(event);
      expect(response.status).toBe(404);
      expect(automationService.deleteFlow).not.toHaveBeenCalled();
    });
  });
});
