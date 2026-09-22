/**
 * @file tests/unit/media/file-exists-cache.test.ts
 * @description Bounds the storage existence-probe cache: an unbounded Map grew
 * with every distinct media path a soak probes. The cache must stay capped while
 * keeping its TTL contract, its negative-cache contract (a missing file is cached
 * too) and its `refresh: true` bypass.
 *
 * Features:
 * - hard entry cap under a many-distinct-paths flood
 * - positive AND negative results are cached
 * - `refresh: true` bypasses the cached value and re-stamps it
 * - TTL expiry restores the miss (tiny TTL via SVELTY_FILE_EXISTS_CACHE_TTL_MS)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FILE_EXISTS_CACHE_MAX = 50;
const FILE_EXISTS_CACHE_TTL_MS = 30;
process.env.SVELTY_FILE_EXISTS_CACHE_MAX = String(FILE_EXISTS_CACHE_MAX);
process.env.SVELTY_FILE_EXISTS_CACHE_TTL_MS = String(FILE_EXISTS_CACHE_TTL_MS);

const storage = vi.hoisted(() => ({
  /** Paths the fake adapter was actually asked about. */
  probes: [] as string[],
  /** Paths that "exist" on the fake backend. */
  present: new Set<string>(),
}));

vi.mock("../../../src/utils/media/storage-adapters", () => ({
  getStorageAdapter: () => ({
    exists: async (rel: string) => {
      storage.probes.push(rel);
      return storage.present.has(rel);
    },
    upload: async (_data: unknown, relPath: string) => `/files/${relPath}`,
    download: async () => Buffer.alloc(0),
    remove: async () => {},
    getUrl: (relPath: string) => `/files/${relPath}`,
    getMetadata: async () => null,
  }),
  getConfig: () => ({}),
}));

const { fileExists, fileExistsCacheSize, resetFileExistsCache } =
  await import("@src/utils/media/media-storage.server");

describe("media fileExists cache", () => {
  beforeEach(() => {
    resetFileExistsCache();
    storage.probes.length = 0;
    storage.present.clear();
  });

  afterEach(() => {
    resetFileExistsCache();
  });

  it("caps the cache under a flood of distinct paths", async () => {
    for (let i = 0; i < 400; i++) {
      await fileExists(`uploads/global/${i}.webp`);
    }

    expect(storage.probes).toHaveLength(400); // every path was probed once
    expect(fileExistsCacheSize()).toBeLessThanOrEqual(FILE_EXISTS_CACHE_MAX);

    // A repeat probe of a recently written path is served from the cache...
    const before = storage.probes.length;
    await fileExists("uploads/global/399.webp");
    expect(storage.probes.length).toBe(before);

    // ...while the oldest path was evicted and is probed again (bounded, not stuck).
    await fileExists("uploads/global/0.webp");
    expect(storage.probes.length).toBe(before + 1);
  });

  it("caches negative results for exactly the TTL window", async () => {
    const rel = "uploads/global/missing.webp";

    expect(await fileExists(rel)).toBe(false); // probe 1 — miss on the backend
    expect(await fileExists(rel)).toBe(false); // cached negative
    expect(storage.probes).toHaveLength(1);

    // lru-cache reads its clock through `performance.now()`, which sinon fake
    // timers cannot advance — use a real (tiny) TTL window instead.
    await new Promise((r) => setTimeout(r, FILE_EXISTS_CACHE_TTL_MS + 15));
    expect(await fileExists(rel)).toBe(false); // TTL elapsed → probed again
    expect(storage.probes).toHaveLength(2);
  });

  it("caches positive results and keeps a fresh write visible via refresh", async () => {
    const rel = "uploads/global/photo.jpg";

    expect(await fileExists(rel)).toBe(false); // negative cached
    storage.present.add(rel);

    // Within the TTL the cached negative still answers (documented staleness).
    expect(await fileExists(rel)).toBe(false);

    // `refresh: true` (the post-write verification path) bypasses and re-stamps.
    expect(await fileExists(rel, { refresh: true })).toBe(true);
    expect(await fileExists(rel)).toBe(true);
    expect(storage.probes).toHaveLength(2);
  });
});
