/**
 * @file tests/unit/api/ai-chat.test.ts
 * @description API tests for the chat memory window, processor seam, reset route, and moderation.
 *
 * ### Features:
 * - `/api/ai/chat` merges bounded memory with client history and records both turns
 * - the configured processor is resolved through the seam (never a raw SDK)
 * - `/api/ai/chat/reset` resets only the caller's tenant + conversation id
 * - the `/api/system/ai/chat` alias reaches the same handler
 * - blocked/unavailable moderation suppresses AI text
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeApi } from "../utils/mock-event";

const {
  appendMock,
  emitMock,
  getMemoryMock,
  getSettingMock,
  moderateMock,
  processMock,
  resetMemoryMock,
} = vi.hoisted(() => ({
  appendMock: vi.fn().mockResolvedValue([]),
  emitMock: vi.fn(),
  getMemoryMock: vi.fn().mockResolvedValue([]),
  getSettingMock: vi.fn().mockResolvedValue(undefined),
  moderateMock: vi.fn().mockResolvedValue({ allowed: true }),
  processMock: vi.fn().mockResolvedValue({ text: "AI answer" }),
  resetMemoryMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@src/services/ai/chat-memory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/services/ai/chat-memory")>();
  return {
    ...actual,
    chatMemory: {
      get: getMemoryMock,
      append: appendMock,
      reset: resetMemoryMock,
    },
  };
});

vi.mock("@src/services/ai/chat-processor", () => ({
  getChatProcessor: vi.fn(() => ({ id: "test-processor", process: processMock })),
  DEFAULT_CHAT_PROCESSOR_ID: "default",
}));

vi.mock("@src/services/ai/moderation", () => ({
  moderateAiText: moderateMock,
}));

vi.mock("@src/services/core/ai-service", () => ({
  aiService: {
    chat: vi.fn(),
    enrichText: vi.fn(),
    generateLayoutSpec: vi.fn(),
  },
}));

vi.mock("@src/services/background/automation/event-bus", () => ({
  eventBus: { emit: emitMock, on: vi.fn(), off: vi.fn() },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSetting: vi.fn().mockResolvedValue(undefined),
  getPrivateSettingSync: vi.fn().mockReturnValue(undefined),
  getPublicSetting: vi.fn().mockResolvedValue(undefined),
  getPublicSettingSync: vi.fn().mockReturnValue(undefined),
  getUntypedSetting: getSettingMock,
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(true),
  resetMultiTenantCache: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const user = { _id: "u1", username: "Admin", email: "admin@example.com", isAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
  getMemoryMock.mockResolvedValue([
    { role: "user", content: "remembered question", at: "2026-10-18T00:00:00.000Z" },
  ]);
  appendMock.mockResolvedValue([]);
  processMock.mockResolvedValue({ text: "AI answer" });
  moderateMock.mockResolvedValue({ allowed: true });
  getSettingMock.mockResolvedValue(undefined);
});

function emittedAiResponses() {
  return emitMock.mock.calls.filter(([event]) => event === "ai:response");
}

describe("POST /api/ai/chat", () => {
  it("merges bounded memory with client history and records both turns", async () => {
    const response = await invokeApi("POST", {
      path: "ai/chat",
      user,
      tenantId: "tenant-1",
      body: {
        userMessage: "new question",
        conversationId: "conv-1",
        history: [{ role: "user", content: "client history" }],
      },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(processMock).toHaveBeenCalledTimes(1));

    const request = processMock.mock.calls[0][0] as {
      message: string;
      history: Array<{ role: string; content: string }>;
      tenantId: string;
      userId: string;
      conversationId: string;
    };

    expect(request.message).toBe("new question");
    expect(request.conversationId).toBe("conv-1");
    expect(request.tenantId).toBe("tenant-1");
    expect(request.userId).toBe("u1");
    expect(request.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "remembered question" }),
        expect.objectContaining({ content: "client history" }),
      ]),
    );
    // The current message is supplied separately, never duplicated in history.
    expect(request.history.some((turn) => turn.content === "new question")).toBe(false);

    expect(appendMock).toHaveBeenNthCalledWith(1, "tenant-1", "conv-1", {
      role: "user",
      content: "new question",
    });
    expect(appendMock).toHaveBeenNthCalledWith(2, "tenant-1", "conv-1", {
      role: "assistant",
      content: "AI answer",
    });

    await vi.waitFor(() => expect(emittedAiResponses()).toHaveLength(1));
    expect(emittedAiResponses()[0][1]).toMatchObject({
      data: { text: "AI answer", done: true },
    });
  });

  it("uses the configured processor id from private settings", async () => {
    getSettingMock.mockResolvedValue("custom-processor");

    await invokeApi("POST", {
      path: "ai/chat",
      user,
      tenantId: "tenant-1",
      body: { userMessage: "hello", conversationId: "conv-1" },
    });

    await vi.waitFor(() => expect(processMock).toHaveBeenCalled());
    const processorModule = await import("@src/services/ai/chat-processor");
    expect(vi.mocked(processorModule.getChatProcessor)).toHaveBeenCalledWith("custom-processor");
  });

  it("suppresses output when moderation flags the response", async () => {
    moderateMock.mockResolvedValue({ allowed: false, reason: "moderation_flagged" });

    await invokeApi("POST", {
      path: "ai/chat",
      user,
      tenantId: "tenant-1",
      body: { userMessage: "blocked", conversationId: "conv-1" },
    });

    await vi.waitFor(() => expect(emittedAiResponses()).toHaveLength(1));
    expect(emittedAiResponses()[0][1]).toMatchObject({
      data: { text: "", done: true, error: "MODERATION_BLOCKED" },
    });
    // Only the user turn is stored; no assistant turn is persisted.
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when moderation is unavailable", async () => {
    moderateMock.mockRejectedValue(
      Object.assign(new Error("provider down"), {
        status: 503,
        code: "MODERATION_UNAVAILABLE",
      }),
    );

    await invokeApi("POST", {
      path: "ai/chat",
      user,
      tenantId: "tenant-1",
      body: { userMessage: "hello", conversationId: "conv-1" },
    });

    await vi.waitFor(() => expect(emittedAiResponses()).toHaveLength(1));
    expect(emittedAiResponses()[0][1]).toMatchObject({
      data: { text: "", done: true, error: "MODERATION_UNAVAILABLE" },
    });
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed conversationId", async () => {
    const response = await invokeApi("POST", {
      path: "ai/chat",
      user,
      tenantId: "tenant-1",
      body: { userMessage: "hello", conversationId: "bad id!" },
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/ai/chat/reset", () => {
  it("resets only the caller's tenant + conversation", async () => {
    const response = await invokeApi("POST", {
      path: "ai/chat/reset",
      user,
      tenantId: "tenant-1",
      body: { conversationId: "conv-9" },
    });

    expect(response.status).toBe(200);
    expect(resetMemoryMock).toHaveBeenCalledWith("tenant-1", "conv-9");
  });

  it("requires authentication", async () => {
    const response = await invokeApi("POST", {
      path: "ai/chat/reset",
      user: null,
      tenantId: "tenant-1",
      body: { conversationId: "conv-9" },
    });

    expect(response.status).toBe(401);
    expect(resetMemoryMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation id instead of touching cache", async () => {
    const response = await invokeApi("POST", {
      path: "ai/chat/reset",
      user,
      tenantId: "tenant-1",
      body: { conversationId: "../other-tenant" },
    });

    expect(response.status).toBe(400);
    expect(resetMemoryMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/system/ai/chat alias", () => {
  it("reaches the AI chat handler", async () => {
    const response = await invokeApi("POST", {
      path: "system/ai/chat",
      user,
      tenantId: "tenant-1",
      body: { userMessage: "hello", conversationId: "conv-1" },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(processMock).toHaveBeenCalledTimes(1));
  });
});
