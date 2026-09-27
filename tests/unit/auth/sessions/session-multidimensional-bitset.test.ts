/**
 * @file tests/unit/auth/sessions/session-multidimensional-bitset.test.ts
 * @description Unit tests for dynamic multidimensional Uint32Array permission bitset caching and serialization.
 *
 * Verifies:
 * - Granting bit index > 63 (e.g. bit 70 in third 32-bit word, wordIndex = 2)
 * - That a 64-bit BigInt register cannot represent bit index 70 within a standard 64-bit mask
 * - Serialization into JSON-safe `number[]` (`permBits`)
 * - Persistence into InMemorySessionManager and RedisSessionManager
 * - Rehydration with `Uint32Array.from(permBits)` / `rehydratePermissionBitset`
 * - Precise permission check: `hasPermissionBitIndex(bitset, 70)` is true, while 69 and 71 are false
 * - Atomic revision epoch invalidation: bump via `invalidateRoleBitsetsGlobally()` detects stale session `permRev`
 */

import { describe, expect, it } from "vitest";
import type { ISODateString, User } from "@databases/db-interface";
import { InMemorySessionManager, RedisSessionManager } from "@src/databases/auth/session-manager";
import {
  createPermissionBitset,
  setPermissionBitIndex,
  hasPermissionBitIndex,
  serializePermissionBitset,
  rehydratePermissionBitset,
  getRoleBitsetVersion,
  isPermissionBitsetStale,
  invalidateRoleBitsetsGlobally,
} from "@src/databases/auth/permission-bitmask";
import { createMockUser } from "../../utils/mock-factories";

describe("Session Multidimensional Bitset (Dynamic Uint32Array)", () => {
  it("grants bit 70 in third word, persists as number[], restores to Uint32Array and verifies permission", async () => {
    // 1. Bit 70 is in the third 32-bit word (Word 0: 0..31, Word 1: 32..63, Word 2: 64..95)
    const targetBitIndex = 70;
    const expectedWordIndex = Math.floor(targetBitIndex / 32); // 2
    const expectedBitOffset = targetBitIndex % 32; // 6
    expect(expectedWordIndex).toBe(2);
    expect(expectedBitOffset).toBe(6);

    // 2. Initialize dynamic bitset and set bit 70
    const bitset = createPermissionBitset(4);
    setPermissionBitIndex(bitset, targetBitIndex);

    expect(bitset[0]).toBe(0);
    expect(bitset[1]).toBe(0);
    expect(bitset[2]).toBe(1 << 6); // 64 in the third word
    expect(bitset[3]).toBe(0);

    // 3. Serialize to JSON-safe number[] array
    const serializedPermBits = serializePermissionBitset(bitset);
    expect(Array.isArray(serializedPermBits)).toBe(true);
    expect(serializedPermBits).toEqual([0, 0, 64, 0]);

    // 4. Record current active revision epoch
    const activeEpoch = getRoleBitsetVersion();

    // 5. Persist through SessionManager with metadata
    const manager = new InMemorySessionManager();
    const user: User = createMockUser({ _id: "user-bitset-70", email: "bit70@example.com" });
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString() as ISODateString;

    await manager.set("sess-bit-70", user, futureExp, {
      permBits: serializedPermBits,
      permRev: activeEpoch,
    });

    // 6. Retrieve SessionData and verify JSON persistence integrity
    const sessionData = await manager.getSessionData("sess-bit-70");
    expect(sessionData).not.toBeNull();
    expect(sessionData?.permBits).toEqual([0, 0, 64, 0]);
    expect(sessionData?.permRev).toBe(activeEpoch);

    // 7. Rehydrate back to Uint32Array
    const restoredBitset = rehydratePermissionBitset(sessionData?.permBits);
    expect(restoredBitset).toBeInstanceOf(Uint32Array);
    expect(restoredBitset.length).toBeGreaterThanOrEqual(3);

    // 8. Verify permission evaluation: bit 70 is granted, neighbors are false
    expect(hasPermissionBitIndex(restoredBitset, 70)).toBe(true);
    expect(hasPermissionBitIndex(restoredBitset, 69)).toBe(false);
    expect(hasPermissionBitIndex(restoredBitset, 71)).toBe(false);
    expect(hasPermissionBitIndex(restoredBitset, 0)).toBe(false);

    // 9. Verify that a 64-bit BigInt bitmask cannot represent bit index 70 in standard 64-bit width
    const bitAsBigInt = 1n << BigInt(targetBitIndex);
    const standard64BitMax = (1n << 64n) - 1n;
    expect(bitAsBigInt > standard64BitMax).toBe(true);
  });

  it("synchronizes permBits and permRev in RedisSessionManager with simulated Redis store", async () => {
    // Simulated redis store
    const store = new Map<string, string>();
    const fakeRedisClient = {
      setex: async (key: string, _ttl: number, val: string) => {
        store.set(key, val);
      },
      get: async (key: string) => store.get(key) ?? null,
      del: async (key: string) => store.delete(key),
    } as any;

    const redisManager = new RedisSessionManager(fakeRedisClient);
    const user: User = createMockUser({ _id: "redis-user-bitset" });
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString() as ISODateString;

    const bitset = createPermissionBitset(3);
    setPermissionBitIndex(bitset, 70); // third word

    const permBits = serializePermissionBitset(bitset);
    const permRev = getRoleBitsetVersion();

    await redisManager.set("redis-sess-70", user, futureExp, {
      permBits,
      permRev,
    });

    // Check raw JSON payload stored in simulated Redis
    const rawStored = store.get("redis-sess-70");
    expect(rawStored).toBeDefined();
    const parsed = JSON.parse(rawStored!);
    expect(parsed.permBits).toEqual([0, 0, 64]);
    expect(parsed.permRev).toBe(permRev);

    // Read back through getSessionData
    const sessionData = await redisManager.getSessionData("redis-sess-70");
    expect(sessionData?.permBits).toEqual([0, 0, 64]);
    expect(sessionData?.permRev).toBe(permRev);

    // Verify rehydration from Redis data
    const rehydrated = Uint32Array.from(sessionData!.permBits!);
    expect(hasPermissionBitIndex(rehydrated, 70)).toBe(true);
  });

  it("detects stale session permRev when invalidateRoleBitsetsGlobally increments epoch", () => {
    const baselineVersion = getRoleBitsetVersion();
    expect(isPermissionBitsetStale(baselineVersion)).toBe(false);

    // Bump global revision epoch (cross-worker atomic invalidation)
    invalidateRoleBitsetsGlobally();

    const newVersion = getRoleBitsetVersion();
    expect(newVersion).toBeGreaterThan(baselineVersion);

    // Stale session with baselineVersion must be flagged as stale
    expect(isPermissionBitsetStale(baselineVersion)).toBe(true);
    expect(isPermissionBitsetStale(newVersion)).toBe(false);
  });
});
