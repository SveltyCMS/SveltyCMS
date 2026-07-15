/**
 * @file tests/unit/api/ai-security.test.ts
 * @description Unit tests for AI API security, focusing on tenant isolation and authentication.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as dispatcher } from "@src/routes/api/[...path]/+server";
import { aiService } from "@src/services/core/ai-service";
import { createMockUser } from "../utils/mock-factories";

// Mock AI service
vi.mock("@src/services/core/ai-service", () => ({
  aiService: {
    chat: vi.fn().mockResolvedValue("AI Response"),
    enrichText: vi.fn().mockResolvedValue("Enriched Text"),
    generateLayoutSpec: vi.fn().mockResolvedValue({ root: "layout", elements: {} }),
  },
}));

// Mock tenant utils
vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(true),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

// Mock settings service
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true),
  getPublicSettingSync: vi.fn().mockReturnValue("mediaFolder"),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("AI API Security - Authentication and Tenant Isolation", () => {
  const mockUser = createMockUser({ _id: "user1", role: "admin" });
  const myTenant = "tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AI Chat (POST /api/ai/chat)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null, __testBypass: true },
        params: { path: "ai/chat" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ userMessage: "Hello" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/chat"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(401);
    });

    it("should reject if tenantId is missing in multi-tenant mode", async () => {
      const event = {
        locals: { user: mockUser, tenantId: null, __testBypass: true },
        params: { path: "ai/chat" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ userMessage: "Hello" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/chat"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(400); // Dispatcher throws 400 for TENANT_MISSING
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "ai/chat" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ userMessage: "Hello" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/chat"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(200);
      expect(aiService.chat).toHaveBeenCalled();
    });
  });

  describe("AI Enrich (POST /api/ai/enrich)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null, __testBypass: true },
        params: { path: "ai/enrich" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ text: "Some text", action: "summarize" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/enrich"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "ai/enrich" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({
            text: "Some text",
            action: "summarize",
            language: "en",
          }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/enrich"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(200);
      expect(aiService.enrichText).toHaveBeenCalled();
    });
  });

  describe("AI Generate Layout (POST /api/ai/generate-layout)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null, __testBypass: true },
        params: { path: "ai/generate-layout" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ prompt: "Design a form" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/generate-layout"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant, __testBypass: true },
        params: { path: "ai/generate-layout" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ prompt: "Design a form" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/ai/generate-layout"),
        cookies: { get: vi.fn() },
      } as any;

      const response = await dispatcher(event);
      expect(response.status).toBe(200);
      expect(aiService.generateLayoutSpec).toHaveBeenCalled();
    });
  });
});
