/**
 * @file tests/unit/api/ai-security.test.ts
 * @description Unit tests for AI API security, focusing on tenant isolation and authentication.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as aiChat } from "@src/routes/api/ai/chat/+server";
import { POST as aiEnrich } from "@src/routes/api/ai/enrich/+server";
import { POST as aiGenerateLayout } from "@src/routes/api/ai/generate-layout/+server";
import { aiService } from "@src/services/ai-service";

// Mock AI service
vi.mock("@src/services/ai-service", () => ({
  aiService: {
    chat: vi.fn().mockResolvedValue("AI Response"),
    process: vi.fn().mockResolvedValue("Enriched Text"),
    generateLayoutSpec: vi.fn().mockResolvedValue({ root: "layout", elements: {} }),
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
        request: { json: vi.fn().mockResolvedValue({ message: "Hello" }) },
      } as any;

      const response = await aiChat(event);
      expect(response.status).toBe(401);
    });

    it("should reject if tenantId is missing in multi-tenant mode", async () => {
      const event = {
        locals: { user: mockUser, tenantId: null },
        request: { json: vi.fn().mockResolvedValue({ message: "Hello" }) },
      } as any;

      const response = await aiChat(event);
      expect(response.status).toBe(403);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ message: "Hello" }) },
      } as any;

      const response = await aiChat(event);
      expect(response.status).toBe(200);
      expect(aiService.chat).toHaveBeenCalled();
    });
  });

  describe("AI Enrich (POST /api/ai/enrich)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null },
        request: {
          json: vi.fn().mockResolvedValue({ text: "Some text", action: "summarize" }),
        },
      } as any;

      const response = await aiEnrich(event);
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        request: {
          json: vi.fn().mockResolvedValue({
            text: "Some text",
            action: "summarize",
            language: "en",
          }),
        },
      } as any;

      const response = await aiEnrich(event);
      expect(response.status).toBe(200);
      expect(aiService.process).toHaveBeenCalled();
    });
  });

  describe("AI Generate Layout (POST /api/ai/generate-layout)", () => {
    it("should reject unauthenticated users", async () => {
      const event = {
        locals: { user: null },
        request: {
          json: vi.fn().mockResolvedValue({ prompt: "Design a form" }),
        },
      } as any;

      const response = await aiGenerateLayout(event);
      expect(response.status).toBe(401);
    });

    it("should allow authenticated users with tenantId", async () => {
      const event = {
        locals: { user: mockUser, tenantId: myTenant },
        request: {
          json: vi.fn().mockResolvedValue({ prompt: "Design a form" }),
        },
      } as any;

      const response = await aiGenerateLayout(event);
      expect(response.status).toBe(200);
      expect(aiService.generateLayoutSpec).toHaveBeenCalled();
    });
  });
});
