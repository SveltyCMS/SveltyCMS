/**
 * @file tests/unit/utils/native-utils.test.ts
 * @description Comprehensive unit tests for native-utils:
 * - RFC 9562 UUIDv7 generator (timestamp accuracy, bit layout, monotonic sequence ordering)
 * - getUUIDv7Timestamp extraction
 * - High-entropy secure tokens
 * - Deep cloning and timing-safe equality
 */

import { describe, it, expect } from "vitest";
import {
  generateUUID,
  generateUUIDv7,
  getUUIDv7Timestamp,
  generateSecureToken,
  deepClone,
  timingSafeStringEqual,
  fastHash,
  FastLRU,
} from "@src/utils/native-utils";

describe("native-utils — UUIDv7 (RFC 9562)", () => {
  it("generates a valid 36-character dashed UUIDv7 string", () => {
    const id = generateUUIDv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.charAt(14)).toBe("7"); // Version 7
    expect(["8", "9", "a", "b"]).toContain(id.charAt(19)); // Variant 1
  });

  it("generateUUID defaults to UUIDv7", () => {
    const id = generateUUID();
    expect(id.charAt(14)).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id.charAt(19));
  });

  it("encodes the current Unix millisecond timestamp in the top 48 bits", () => {
    const before = Date.now();
    const id = generateUUIDv7();
    const after = Date.now();

    const ts = getUUIDv7Timestamp(id);
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after + 5);
  });

  it("guarantees strict lexicographical monotonicity across sequential calls", () => {
    const count = 1000;
    const ids = Array.from<string>({ length: count });
    for (let i = 0; i < count; i++) {
      ids[i] = generateUUIDv7();
    }

    for (let i = 1; i < count; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  it("getUUIDv7Timestamp returns null for non-v7 strings", () => {
    expect(getUUIDv7Timestamp("550e8400-e29b-41d4-a716-446655440000")).toBeNull(); // v4
    expect(getUUIDv7Timestamp("not-a-uuid")).toBeNull();
    expect(getUUIDv7Timestamp("")).toBeNull();
  });
});

describe("native-utils — generateSecureToken", () => {
  it("generates a high-entropy hex string with default 32 bytes (64 chars)", () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("supports custom byte lengths", () => {
    expect(generateSecureToken(16)).toHaveLength(32);
    expect(generateSecureToken(8)).toHaveLength(16);
  });
});

describe("native-utils — deepClone", () => {
  it("clones nested objects and arrays without mutating source", () => {
    const original = { a: 1, b: [2, 3], c: { d: "hello" } };
    const copy = deepClone(original);

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.b).not.toBe(original.b);
    expect(copy.c).not.toBe(original.c);
  });
});

describe("native-utils — timingSafeStringEqual", () => {
  it("returns true for matching strings", () => {
    expect(timingSafeStringEqual("secret-token-123", "secret-token-123")).toBe(true);
  });

  it("returns false for non-matching strings of same or different lengths", () => {
    expect(timingSafeStringEqual("secret-token-123", "secret-token-456")).toBe(false);
    expect(timingSafeStringEqual("secret-token-123", "short")).toBe(false);
  });
});

describe("native-utils — fastHash", () => {
  it("produces deterministic 16-character hex hash", () => {
    const h1 = fastHash("hello world");
    const h2 = fastHash("hello world");
    expect(h1).toHaveLength(16);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(h1).toBe(h2);
  });

  it("differentiates different input strings", () => {
    expect(fastHash("collection_a")).not.toBe(fastHash("collection_b"));
  });
});

describe("native-utils — FastLRU", () => {
  it("stores and retrieves values with O(1) get/set", () => {
    const cache = new FastLRU<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("evicts least recently used items when max is reached", () => {
    const cache = new FastLRU<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    // Access 'a' to make it most recently used, so 'b' becomes LRU
    cache.get("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false); // 'b' was evicted
    expect(cache.has("c")).toBe(true);
    expect(cache.size).toBe(2);
  });

  it("expires items when TTL passes", async () => {
    const cache = new FastLRU<string, string>({ max: 5, ttl: 20 });
    cache.set("temp", "value");
    expect(cache.get("temp")).toBe("value");

    await new Promise((r) => setTimeout(r, 30));

    expect(cache.get("temp")).toBeUndefined();
    expect(cache.has("temp")).toBe(false);
  });

  it("calls dispose hook on eviction and explicit deletion", () => {
    const disposed: Array<[string, number]> = [];
    const cache = new FastLRU<string, number>({
      max: 2,
      dispose: (val, key) => disposed.push([key, val]),
    });

    cache.set("x", 10);
    cache.set("y", 20);
    cache.set("z", 30); // 'x' evicted

    expect(disposed).toEqual([["x", 10]]);

    cache.delete("y");
    expect(disposed).toEqual([
      ["x", 10],
      ["y", 20],
    ]);

    cache.clear();
    expect(disposed).toEqual([
      ["x", 10],
      ["y", 20],
      ["z", 30],
    ]);
  });
});
