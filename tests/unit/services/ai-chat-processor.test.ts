/**
 * @file tests/unit/services/ai-chat-processor.test.ts
 * @description Unit tests for the pluggable ChatProcessor seam and registry.
 *
 * ### Features:
 * - default processor delegates to `AIService.chat` (lazy import)
 * - message/history bounds are re-applied at the seam
 * - tenant/system prompt context is forwarded
 * - custom processors can be registered and resolved
 * - unknown processor ids fail closed
 * - AbortSignal short-circuits processing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CHAT_PROCESSOR_ID,
  DefaultChatProcessor,
  getChatProcessor,
  registerChatProcessor,
  resetChatProcessors,
  type ChatProcessor,
} from "@src/services/ai/chat-processor";
import { AppError } from "@utils/error-handling";

const { chatMock } = vi.hoisted(() => ({
  chatMock: vi.fn<(...args: unknown[]) => Promise<string>>(),
}));

vi.mock("@src/services/core/ai-service", () => ({
  aiService: { chat: chatMock },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ChatProcessor registry", () => {
  beforeEach(() => {
    resetChatProcessors();
    chatMock.mockReset();
    chatMock.mockResolvedValue("assistant answer");
  });

  afterEach(() => {
    resetChatProcessors();
  });

  it("resolves the default processor without an id", () => {
    const processor = getChatProcessor();
    expect(processor.id).toBe(DEFAULT_CHAT_PROCESSOR_ID);
    expect(processor).toBeInstanceOf(DefaultChatProcessor);
  });

  it("registers and resolves a custom processor by id", async () => {
    const custom: ChatProcessor = {
      id: "custom-agent",
      process: vi.fn().mockResolvedValue({ text: "custom", model: "agent-1" }),
    };

    registerChatProcessor(custom);
    expect(getChatProcessor("custom-agent")).toBe(custom);
    await expect(
      getChatProcessor("custom-agent").process({
        message: "hello",
        history: [],
      }),
    ).resolves.toEqual({ text: "custom", model: "agent-1" });
  });

  it("fails closed for an unknown configured processor id", () => {
    expect(() => getChatProcessor("missing-processor")).toThrowError(AppError);
    try {
      getChatProcessor("missing-processor");
    } catch (err) {
      expect((err as AppError).status).toBe(503);
      expect((err as AppError).code).toBe("CHAT_PROCESSOR_UNAVAILABLE");
    }
  });

  it("restores only the default processor on reset", () => {
    registerChatProcessor({
      id: "temporary",
      process: vi.fn().mockResolvedValue({ text: "temporary" }),
    });
    expect(getChatProcessor("temporary").id).toBe("temporary");

    resetChatProcessors();
    expect(() => getChatProcessor("temporary")).toThrowError(AppError);
    expect(getChatProcessor().id).toBe(DEFAULT_CHAT_PROCESSOR_ID);
  });
});

describe("DefaultChatProcessor", () => {
  beforeEach(() => {
    resetChatProcessors();
    chatMock.mockReset();
    chatMock.mockResolvedValue("assistant answer");
  });

  afterEach(() => {
    resetChatProcessors();
  });

  it("forwards the tenant and system prompt to AIService.chat", async () => {
    await getChatProcessor().process({
      message: "Hello",
      history: [],
      tenantId: "tenant-1",
      systemPrompt: "Answer in JSON",
    });

    expect(chatMock).toHaveBeenCalledWith(
      "Hello",
      [],
      expect.objectContaining({ tenantId: "tenant-1", systemPrompt: "Answer in JSON" }),
    );
  });

  it("re-applies message and history bounds", async () => {
    const history = Array.from({ length: 60 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: index === 59 ? "x".repeat(20_000) : `turn-${index}`,
    }));

    await getChatProcessor().process({
      message: "y".repeat(20_000),
      history,
    });

    const [message, sanitizedHistory] = chatMock.mock.calls[0] as [
      string,
      Array<{ role: string; content: string }>,
    ];
    expect(message).toHaveLength(12_000);
    expect(sanitizedHistory).toHaveLength(40);
    expect(sanitizedHistory.at(-1)?.content).toHaveLength(8_000);
    expect(sanitizedHistory.some((turn) => turn.content === "turn-19")).toBe(false);
  });

  it("rejects a blank message", async () => {
    await expect(getChatProcessor().process({ message: "   ", history: [] })).rejects.toMatchObject(
      { status: 400 },
    );
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("honours an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      getChatProcessor().process({ message: "Hello", history: [] }, controller.signal),
    ).rejects.toMatchObject({ status: 499 });
    expect(chatMock).not.toHaveBeenCalled();
  });
});
