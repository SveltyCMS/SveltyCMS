/**
 * @file tests/unit/api/ai-security.test.ts
 * @description Unit tests for AI API security, focusing on tenant isolation and authentication.
 *
 * Uses shared createMockRequestEvent + invokeApi (tests/unit/utils/mock-event.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiService } from "@src/services/core/ai-service";
import { createMockUser } from "../utils/mock-factories";
import { invokeApi } from "../utils/mock-event";

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

// Do NOT mock apiHandler — AppError must become a Response (401/400).

describe("AI API Security - Authentication and Tenant Isolation", () => {
  const mockUser = createMockUser({ _id: "user1", role: "admin", isAdmin: true } as any);
  const myTenant = "tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AI Chat (POST /api/ai/chat)", () => {
    it("should reject unauthenticated users", async () => {
      const response = await invokeApi("POST", {
        path: "ai/chat",
        body: { userMessage: "Hello" },
        user: null,
        tenantId: myTenant,
      });
      expect(response.status).toBe(401);
    });

    it("should reject if tenantId is missing in multi-tenant mode", async () => {
      const response = await invokeApi("POST", {
        path: "ai/chat",
        body: { userMessage: "Hello" },
        user: mockUser,
        tenantId: null,
      });
      expect(response.status).toBe(400); // TENANT_MISSING / TENANT_REQUIRED
    });

    it("should allow authenticated users with tenantId", async () => {
      const response = await invokeApi("POST", {
        path: "ai/chat",
        body: { userMessage: "Hello" },
        user: mockUser,
        tenantId: myTenant,
      });
      expect(response.status).toBe(200);
      expect(aiService.chat).toHaveBeenCalled();
    });
  });

  describe("AI Enrich (POST /api/ai/enrich)", () => {
    it("should reject unauthenticated users", async () => {
      const response = await invokeApi("POST", {
        path: "ai/enrich",
        body: { text: "Some text", action: "summarize" },
        user: null,
        tenantId: myTenant,
      });
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const response = await invokeApi("POST", {
        path: "ai/enrich",
        body: {
          text: "Some text",
          action: "summarize",
          language: "en",
        },
        user: mockUser,
        tenantId: myTenant,
      });
      expect(response.status).toBe(200);
      expect(aiService.enrichText).toHaveBeenCalled();
    });
  });

  describe("AI Generate Layout (POST /api/ai/generate-layout)", () => {
    it("should reject unauthenticated users", async () => {
      const response = await invokeApi("POST", {
        path: "ai/generate-layout",
        body: { prompt: "Design a form" },
        user: null,
        tenantId: myTenant,
      });
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const response = await invokeApi("POST", {
        path: "ai/generate-layout",
        body: { prompt: "Design a form" },
        user: mockUser,
        tenantId: myTenant,
      });
      expect(response.status).toBe(200);
      expect(aiService.generateLayoutSpec).toHaveBeenCalled();
    });
  });
});
