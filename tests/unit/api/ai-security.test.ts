/**
 * @file tests/unit/api/ai-security.test.ts
 * @description Unit tests for AI API security, focusing on tenant isolation and authentication.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as dispatcher } from "@src/routes/api/[...path]/+server";
import { aiService } from "@src/services/ai-service";

// Mock AI service
vi.mock("@src/services/ai-service", () => ({
  aiService: {
    chat: vi.fn().mockResolvedValue("AI Response"),
    enrichText: vi.fn().mockResolvedValue("Enriched Text"),
    generateLayoutSpec: vi.fn().mockResolvedValue({ root: "layout", elements: {} }),
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

describe("AI API Security - Authentication and Tenant Isolation", () => {
  const mockUser = { _id: "user1", role: "admin", email: "test@example.com" };
  const myTenant = "tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AI Chat (POST /api/ai/chat)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null },
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
        locals: { user: mockUser, tenantId: null },
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
        locals: { user: mockUser, tenantId: myTenant },
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
        locals: { user: null },
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
        locals: { user: mockUser, tenantId: myTenant },
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
        locals: { user: null },
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
        locals: { user: mockUser, tenantId: myTenant },
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
