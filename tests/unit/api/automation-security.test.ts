/**
 * @file tests/unit/api/automation-security.test.ts
 * @description Unit tests for Automation API security, focusing on IDOR and tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getFlows } from "@src/routes/api/automations/+server";
import {
  GET as getFlow,
  PATCH as updateFlow,
  DELETE as deleteFlow,
} from "@src/routes/api/automations/[id]/+server";
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
    it("should only list automations for the current tenant for regular admin", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL("http://localhost/api/automations"),
      } as any;

      await getFlows(event);
      expect(automationService.getFlows).toHaveBeenCalledWith(myTenant);
    });

    it("should allow super-admin to override tenantId via query parameter", async () => {
      const event = {
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        url: new URL(`http://localhost/api/automations?tenantId=${otherTenant}`),
      } as any;

      await getFlows(event);
      expect(automationService.getFlows).toHaveBeenCalledWith(otherTenant);
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        url: new URL(`http://localhost/api/automations?tenantId=${otherTenant}`),
      } as any;

      try {
        await getFlows(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
      expect(automationService.getFlows).not.toHaveBeenCalledWith(otherTenant);
    });
  });

  describe("IDOR Protection for specific Automations ([id])", () => {
    const flowId = "flow-1";

    it("should prevent getting a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { id: flowId },
        locals: { user: mockUser, tenantId: myTenant },
      } as any;

      try {
        await getFlow(event);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
      expect(automationService.getFlow).toHaveBeenCalledWith(flowId, myTenant);
    });

    it("should allow getting if the flow belongs to the current tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue({
        id: flowId,
        tenantId: myTenant,
      } as any);

      const event = {
        params: { id: flowId },
        locals: { user: mockUser, tenantId: myTenant },
      } as any;

      const response = await getFlow(event);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(automationService.getFlow).toHaveBeenCalledWith(flowId, myTenant);
    });

    it("should prevent updating a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { id: flowId },
        locals: { user: mockUser, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ name: "Updated" }) },
      } as any;

      try {
        await updateFlow(event);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
      expect(automationService.saveFlow).not.toHaveBeenCalled();
    });

    it("should prevent deleting a flow that belongs to another tenant", async () => {
      (automationService.getFlow as any).mockResolvedValue(null);

      const event = {
        params: { id: flowId },
        locals: { user: mockUser, tenantId: myTenant },
      } as any;

      try {
        await deleteFlow(event);
      } catch (error: any) {
        expect(error.status).toBe(404);
      }
      expect(automationService.deleteFlow).not.toHaveBeenCalled();
    });
  });
});
