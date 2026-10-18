/**
 * @file tests/unit/services/ai-chat-memory.test.ts
 * @description Unit tests for tenant-scoped, bounded ChatMemory.
 *
 * ### Features:
 * - tenant + conversation key isolation
 * - 40-turn / 8,000-char-per-turn / 32,000-char-total window
 * - conversation-id validation and MULTI_TENANT tenant requirement
 * - reset clears the in-process mirror and the cache (L1/L2)
 * - stable conversation-id derivation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import {
  CHAT_MEMORY_TTL_SECONDS,
  ChatMemory,
  createConversationId,
  isValidConversationId,
  MAX_CHAT_MEMORY_TOTAL_CHARS,
  MAX_CHAT_MEMORY_TURN_CHARS,
  MAX_CHAT_MEMORY_TURNS,
} from "@src/services/ai/chat-memory";

const { isMultiTenantMock } = vi.hoisted(() => ({
  isMultiTenantMock: vi.fn<() => boolean>(() => false),
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: isMultiTenantMock,
}));

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  isMultiTenantMock.mockReturnValue(false);
  vi.mocked(cacheService.get).mockImplementation(
    async (key: string) => (store.get(key) as never) ?? null,
  );
  vi.mocked(cacheService.set).mockImplementation(async (key: string, value: unknown) => {
    store.set(key, value);
  });
  vi.mocked(cacheService.delete).mockImplementation(async (key: string) => {
    store.delete(key);
    return true;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChatMemory", () => {
  it("scopes turns by tenant and conversation", async () => {
    const memory = new ChatMemory();

    await memory.append("tenant-a", "conv-1", { role: "user", content: "hello" });
    await memory.append("tenant-b", "conv-1", { role: "user", content: "other" });

    expect(await memory.get("tenant-a", "conv-1")).toMatchObject([
      { role: "user", content: "hello" },
    ]);
    expect(await memory.get("tenant-b", "conv-1")).toMatchObject([
      { role: "user", content: "other" },
    ]);
    expect(await memory.get("tenant-a", "conv-2")).toEqual([]);
  });

  it("writes the explicit tenant-scoped key with a 24h TTL", async () => {
    const memory = new ChatMemory();
    await memory.append("tenant-a", "conv-1", { role: "user", content: "hello" });

    expect(cacheService.set).toHaveBeenCalledWith(
      "ai:chat:memory:tenant-a:conv-1",
      expect.any(Array),
      CHAT_MEMORY_TTL_SECONDS,
    );
  });

  it("keeps only the most recent 40 turns", async () => {
    const memory = new ChatMemory();

    for (let index = 0; index < MAX_CHAT_MEMORY_TURNS + 5; index++) {
      await memory.append("tenant-a", "conv-1", {
        role: index % 2 === 0 ? "user" : "assistant",
        content: `turn-${index}`,
      });
    }

    const turns = await memory.get("tenant-a", "conv-1");
    expect(turns).toHaveLength(MAX_CHAT_MEMORY_TURNS);
    expect(turns[0].content).toBe("turn-5");
    expect(turns.at(-1)?.content).toBe(`turn-${MAX_CHAT_MEMORY_TURNS + 4}`);
  });

  it("caps a single turn at 8,000 characters", async () => {
    const memory = new ChatMemory();
    const turns = await memory.append("tenant-a", "conv-1", {
      role: "user",
      content: "x".repeat(20_000),
    });

    expect(turns).toHaveLength(1);
    expect(turns[0].content).toHaveLength(MAX_CHAT_MEMORY_TURN_CHARS);
  });

  it("drops oldest whole turns when the total budget is exceeded", async () => {
    const memory = new ChatMemory();

    for (let index = 0; index < 10; index++) {
      await memory.append("tenant-a", "conv-1", {
        role: index % 2 === 0 ? "user" : "assistant",
        content: String.fromCharCode(65 + index).repeat(MAX_CHAT_MEMORY_TURN_CHARS),
      });
    }

    const turns = await memory.get("tenant-a", "conv-1");
    expect(turns).toHaveLength(MAX_CHAT_MEMORY_TOTAL_CHARS / MAX_CHAT_MEMORY_TURN_CHARS);
    expect(turns[0].content.startsWith("G")).toBe(true);
    // Every retained turn is whole — never a partial turn.
    expect(turns.every((turn) => turn.content.length === MAX_CHAT_MEMORY_TURN_CHARS)).toBe(true);
  });

  it("rejects malformed conversation ids", async () => {
    const memory = new ChatMemory();
    await expect(
      memory.append("tenant-a", "not a valid id!", { role: "user", content: "hello" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(memory.get("tenant-a", "../escape")).rejects.toMatchObject({ status: 400 });
  });

  it("requires a tenant when MULTI_TENANT is enabled", async () => {
    isMultiTenantMock.mockReturnValue(true);
    const memory = new ChatMemory();

    await expect(
      memory.append(null, "conv-1", { role: "user", content: "hello" }),
    ).rejects.toMatchObject({ status: 400, code: "TENANT_REQUIRED" });
  });

  it("uses the global scope in single-tenant mode", async () => {
    const memory = new ChatMemory();
    await memory.append(null, "conv-1", { role: "user", content: "hello" });

    expect(cacheService.set).toHaveBeenCalledWith(
      "ai:chat:memory:global:conv-1",
      expect.any(Array),
      CHAT_MEMORY_TTL_SECONDS,
    );
  });

  it("reset clears the mirror and the cache entry", async () => {
    const memory = new ChatMemory();
    await memory.append("tenant-a", "conv-1", { role: "user", content: "hello" });

    await memory.reset("tenant-a", "conv-1");

    expect(cacheService.delete).toHaveBeenCalledWith("ai:chat:memory:tenant-a:conv-1");
    expect(await memory.get("tenant-a", "conv-1")).toEqual([]);
  });
});

describe("conversation ids", () => {
  it("validates the allowed grammar", () => {
    expect(isValidConversationId("user-abc_123")).toBe(true);
    expect(isValidConversationId("a".repeat(128))).toBe(true);
    expect(isValidConversationId("a".repeat(129))).toBe(false);
    expect(isValidConversationId("bad:id")).toBe(false);
  });

  it("derives a stable, grammar-safe id for authenticated users", () => {
    const id = createConversationId("user@example.com");
    expect(id).toBe("user-user-example-com");
    expect(isValidConversationId(id)).toBe(true);
    expect(createConversationId("abc")).toBe(createConversationId("abc"));
  });

  it("generates a random id for anonymous callers", () => {
    const first = createConversationId(null);
    const second = createConversationId(null);
    expect(first).not.toBe(second);
    expect(isValidConversationId(first)).toBe(true);
  });
});
