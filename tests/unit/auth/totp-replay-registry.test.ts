/**
 * @file tests/unit/auth/totp-replay-registry.test.ts
 * @description Unit tests for TOTP replay attack prevention registry
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  InMemoryTotpRegistryAdapter,
  UsedTotpCodeRegistry,
  TOTP_REPLAY_WINDOW_MS,
  resetTotpReplayRegistry,
  getTotpReplayRegistry,
} from "@src/databases/auth/totp-replay-registry";

describe("InMemoryTotpRegistryAdapter", () => {
  let adapter: InMemoryTotpRegistryAdapter;

  beforeEach(() => {
    adapter = new InMemoryTotpRegistryAdapter();
  });

  it("should accept a code on first use", async () => {
    const accepted = await adapter.tryInsert("user1", "123456", Date.now() + TOTP_REPLAY_WINDOW_MS);
    expect(accepted).toBe(true);
  });

  it("should reject the same code for the same user (replay)", async () => {
    const expiresAt = Date.now() + TOTP_REPLAY_WINDOW_MS;
    await adapter.tryInsert("user1", "123456", expiresAt);
    const accepted = await adapter.tryInsert("user1", "123456", expiresAt);
    expect(accepted).toBe(false);
  });

  it("should accept the same code for different users", async () => {
    const expiresAt = Date.now() + TOTP_REPLAY_WINDOW_MS;
    await adapter.tryInsert("user1", "123456", expiresAt);
    const accepted = await adapter.tryInsert("user2", "123456", expiresAt);
    expect(accepted).toBe(true);
  });

  it("should accept an expired code as new", async () => {
    // Insert with an already-expired timestamp
    await adapter.tryInsert("user1", "123456", Date.now() - 1);
    const accepted = await adapter.tryInsert("user1", "123456", Date.now() + TOTP_REPLAY_WINDOW_MS);
    expect(accepted).toBe(true);
  });

  it("should clean up expired entries", async () => {
    // Insert expired entries
    await adapter.tryInsert("user1", "111111", Date.now() - 10_000);
    await adapter.tryInsert("user2", "222222", Date.now() + TOTP_REPLAY_WINDOW_MS);
    await adapter.tryInsert("user3", "333333", Date.now() - 5_000);

    await adapter.deleteExpired();

    // Expired codes should be re-usable
    const reused1 = await adapter.tryInsert("user1", "111111", Date.now() + TOTP_REPLAY_WINDOW_MS);
    expect(reused1).toBe(true);

    // Non-expired code should still be blocked
    const reused2 = await adapter.tryInsert("user2", "222222", Date.now() + TOTP_REPLAY_WINDOW_MS);
    expect(reused2).toBe(false);
  });
});

describe("UsedTotpCodeRegistry (facade)", () => {
  let registry: UsedTotpCodeRegistry;

  beforeEach(() => {
    registry = new UsedTotpCodeRegistry(new InMemoryTotpRegistryAdapter());
  });

  it("should accept a new code", async () => {
    const accepted = await registry.consumeCode("user1", "654321");
    expect(accepted).toBe(true);
  });

  it("should reject a replayed code", async () => {
    await registry.consumeCode("user1", "654321");
    const accepted = await registry.consumeCode("user1", "654321");
    expect(accepted).toBe(false);
  });

  it("should fail closed when adapter throws", async () => {
    const brokenAdapter = {
      tryInsert: vi.fn().mockRejectedValue(new Error("DB down")),
      deleteExpired: vi.fn(),
    };
    const brokenRegistry = new UsedTotpCodeRegistry(brokenAdapter);
    const accepted = await brokenRegistry.consumeCode("user1", "999999");
    expect(accepted).toBe(false);
  });

  it("should trigger amortised cleanup after 100 writes", async () => {
    const mockAdapter = {
      tryInsert: vi.fn().mockResolvedValue(true),
      deleteExpired: vi.fn().mockResolvedValue(undefined),
    };
    const reg = new UsedTotpCodeRegistry(mockAdapter);

    // First 99 writes — no cleanup
    for (let i = 0; i < 99; i++) {
      await reg.consumeCode("user", `code${i}`);
    }
    expect(mockAdapter.deleteExpired).not.toHaveBeenCalled();

    // 100th write — triggers cleanup
    await reg.consumeCode("user", "code99");
    expect(mockAdapter.deleteExpired).toHaveBeenCalledTimes(1);
  });
});

describe("getTotpReplayRegistry singleton", () => {
  beforeEach(() => {
    resetTotpReplayRegistry();
  });

  it("should return the same instance on repeated calls", () => {
    const a = getTotpReplayRegistry();
    const b = getTotpReplayRegistry();
    expect(a).toBe(b);
  });

  it("should create a new instance after reset", () => {
    const a = getTotpReplayRegistry();
    resetTotpReplayRegistry();
    const b = getTotpReplayRegistry();
    expect(a).not.toBe(b);
  });
});
