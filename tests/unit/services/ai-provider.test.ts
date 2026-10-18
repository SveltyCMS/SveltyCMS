/**
 * @file tests/unit/services/ai-provider.test.ts
 * @description Contract tests for the typed AiProvider interface port.
 *
 * Verifies that a conforming AI provider implementation satisfies the
 * generate, chat, and embed contracts without vendor coupling.
 */

import { describe, expect, it } from "vitest";
import type {
  AiProvider,
  AiGenerateOptions,
  AiGenerateResult,
  AiChatOptions,
  AiChatResult,
} from "@src/services/ai/ai-provider";

class MockAiProvider implements AiProvider {
  readonly id = "mock-provider";
  readonly name = "Mock AI Provider";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    return {
      text: `Echo: ${prompt}`,
      model: options?.model ?? "mock-model-v1",
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }

  async chat(options: AiChatOptions): Promise<AiChatResult> {
    const last = options.messages[options.messages.length - 1];
    return {
      message: {
        role: "assistant",
        content: `Reply to: ${last?.content ?? ""}`,
      },
      model: options.model ?? "mock-model-v1",
      usage: { inputTokens: 15, outputTokens: 25 },
    };
  }

  async embed(text: string): Promise<{ embedding: number[]; model: string }> {
    return {
      embedding: Array(8).fill(text.length),
      model: "mock-embed-v1",
    };
  }
}

describe("AiProvider Port Contract", () => {
  it("implements health check", async () => {
    const provider: AiProvider = new MockAiProvider();
    expect(await provider.isAvailable()).toBe(true);
    expect(provider.id).toBe("mock-provider");
  });

  it("handles single-prompt text generation", async () => {
    const provider: AiProvider = new MockAiProvider();
    const result = await provider.generate("Hello SveltyCMS", { model: "fast-model" });

    expect(result.text).toBe("Echo: Hello SveltyCMS");
    expect(result.model).toBe("fast-model");
    expect(result.usage?.inputTokens).toBe(10);
  });

  it("handles multi-turn chat completions", async () => {
    const provider: AiProvider = new MockAiProvider();
    const result = await provider.chat({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "How do I configure a collection?" },
      ],
    });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Reply to: How do I configure a collection?");
    expect(result.usage?.outputTokens).toBe(25);
  });

  it("handles optional embedding generation", async () => {
    const provider: AiProvider = new MockAiProvider();
    expect(provider.embed).toBeDefined();
    const result = await provider.embed!("test string");
    expect(result.embedding).toHaveLength(8);
    expect(result.embedding[0]).toBe("test string".length);
  });
});
