/**
 * @file tests/unit/core/response-cache-l1-budget.test.ts
 * @description The L1 byte budgets (`SVELTY_L1_MAX_MB`, `SVELTY_L1_POINT_MAX_MB`)
 * only bound memory if the maintained counters match the stores. The L2-refill
 * paths inserted entries without accounting and the delete paths never
 * decremented, so a tier could sit at its entry cap (2000 × body, ~200 MB for
 * 100 KB list bodies) while the byte budget believed it was empty.
 *
 * These tests drive every mutation path with a 1 MB budget and assert:
 * - the store shrinks below the budget,
 * - the maintained counters equal an exact recount (no drift, either direction),
 * - refill / TTL expiry / surgical invalidation each move the counter by exactly
 *   the entry's own byte cost.
 *
 * Features:
 * - insert-above-budget shrinks the tier (list + point tiers)
 * - L2-refill accounting (the drift that disabled the budget)
 * - delete-path accounting: invalidate, invalidateAll, doc-scoped index drop, expiry
 * - counter == recount after a mixed torture sequence on both tiers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { responseCache, type CachedResponseEntry } from "@src/services/cache/response-cache";
import { cacheService } from "@src/databases/cache/cache-service";

const MB = 1024 * 1024;
/** 8 000 chars → 16 000 bytes as UTF-16 (no buffer attached by `set`). */
const BODY_CHARS = 8_000;
const ENTRY_BYTES = BODY_CHARS * 2;

const LIST_KEY = "/api/collections/posts";
const pointKey = (id: string) => `/api/collections/posts/${id}`;

const mockCache = cacheService as unknown as {
  getSync: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

function entry(seed: string): CachedResponseEntry {
  return { body: seed.repeat(BODY_CHARS / seed.length).slice(0, BODY_CHARS), etag: `"${seed}"` };
}

/** Bytes the cache itself charges for an entry (mirrors the service's accounting). */
function charged(entryObj: CachedResponseEntry): number {
  return (entryObj.body?.length ?? 0) * 2 + (entryObj.buffer?.byteLength ?? 0);
}

beforeEach(() => {
  process.env.SVELTY_L1_MAX_MB = "1";
  process.env.SVELTY_L1_POINT_MAX_MB = "1";
  responseCache.trimLocal();
  mockCache.getSync.mockReturnValue(null);
  mockCache.get.mockResolvedValue(null);
});

afterEach(() => {
  responseCache.trimLocal();
  delete process.env.SVELTY_L1_MAX_MB;
  delete process.env.SVELTY_L1_POINT_MAX_MB;
  vi.restoreAllMocks();
});

describe("ResponseCache L1 byte budget", () => {
  it("evicts list entries once the tier is over budget, and reports an exact recount", () => {
    const inserted = Math.floor((4 * MB) / ENTRY_BYTES); // 4× the 1 MB budget
    for (let i = 0; i < inserted; i++) {
      responseCache.set(`${LIST_KEY}?limit=${i}`, entry("a"), 300_000, "global");
    }

    const stats = responseCache.getL1ByteStats();
    expect(stats.listBudgetBytes).toBe(1 * MB);
    expect(stats.listEntries).toBeLessThan(inserted);
    expect(stats.listBytes).toBeLessThanOrEqual(stats.listBudgetBytes);
    // The counter is the store, not an estimate: any drift would let the budget slip.
    expect(stats.listBytes).toBe(stats.recountListBytes);
  });

  it("bounds the point-read tier with its own budget", () => {
    const inserted = Math.floor((3 * MB) / ENTRY_BYTES);
    // Two passes: the point tier admits on the second touch of an id (a cold random scan
    // must not fill it with entries that are evicted unread — `pointAdmission`), so the
    // budget can only be exercised by ids that were sighted twice.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < inserted; i++) {
        responseCache.set(pointKey(`doc-${i}`), entry("b"), 300_000, "global");
      }
    }

    const stats = responseCache.getL1ByteStats();
    expect(stats.pointBudgetBytes).toBe(1 * MB);
    expect(stats.pointEntries).toBeLessThan(inserted);
    expect(stats.pointEntries).toBeGreaterThan(0);
    expect(stats.pointBytes).toBeLessThanOrEqual(stats.pointBudgetBytes);
    expect(stats.pointBytes).toBe(stats.recountPointBytes);
  });

  it("charges the L2-refill path (the drift that disabled the budget)", () => {
    const refilled = entry("c");
    mockCache.getSync.mockReturnValue(refilled);

    const before = responseCache.getL1ByteStats();
    const hit = responseCache.get(`${LIST_KEY}?limit=10`, "global");
    expect(hit?.body).toBe(refilled.body);

    const after = responseCache.getL1ByteStats();
    expect(after.listEntries).toBe(before.listEntries + 1);
    // Refill attaches the encoded buffer — the charged cost includes it.
    expect(after.listBytes - before.listBytes).toBe(charged(hit!));
    expect(after.listBytes).toBe(after.recountListBytes);

    // Serving the same key again must not double-charge it.
    responseCache.get(`${LIST_KEY}?limit=10`, "global");
    const again = responseCache.getL1ByteStats();
    expect(again.listBytes).toBe(after.listBytes);
    expect(again.listBytes).toBe(again.recountListBytes);
  });

  it("decrements on invalidate, expiry, doc-scoped drop and invalidateAll", () => {
    responseCache.set(LIST_KEY, entry("d"), 300_000, "global");
    // Point admission is 2-touch — a single sighting takes no slot (and the
    // trimLocal hygiene now clears the admission filters between tests), so
    // each point key is seen twice to be admitted.
    responseCache.set(pointKey("doc-1"), entry("e"), 300_000, "global");
    responseCache.set(pointKey("doc-1"), entry("e"), 300_000, "global");
    expect(responseCache.getL1ByteStats().listBytes).toBeGreaterThan(0);
    expect(responseCache.getL1ByteStats().pointBytes).toBeGreaterThan(0);

    // 1. TTL expiry on read (negative ttlMs ⇒ already expired on the next read).
    responseCache.set(`${LIST_KEY}?limit=2`, entry("f"), -1, "global");
    const afterExpirySet = responseCache.getL1ByteStats();
    const expired = responseCache.get(`${LIST_KEY}?limit=2`, "global");
    expect(expired).toBeNull();
    const afterExpiry = responseCache.getL1ByteStats();
    expect(afterExpiry.listBytes).toBe(afterExpirySet.listBytes - ENTRY_BYTES);
    expect(afterExpiry.listBytes).toBe(afterExpiry.recountListBytes);

    // 2. Surgical per-doc invalidation (dropIndexSet on the point tier).
    const pointBefore = responseCache.getL1ByteStats().pointBytes;
    responseCache.invalidateLocal("posts", "global", { entryIds: ["doc-1"] });
    const pointAfter = responseCache.getL1ByteStats();
    expect(pointAfter.pointEntries).toBe(0);
    expect(pointAfter.pointBytes).toBe(pointBefore - ENTRY_BYTES);
    expect(pointAfter.pointBytes).toBe(pointAfter.recountPointBytes);

    // 3. Key invalidation.
    const listBefore = responseCache.getL1ByteStats().listBytes;
    void responseCache.invalidate(LIST_KEY, "global");
    const listAfterKeyInvalidate = responseCache.getL1ByteStats();
    expect(listAfterKeyInvalidate.listBytes).toBe(listBefore - ENTRY_BYTES);
    expect(listAfterKeyInvalidate.listBytes).toBe(listAfterKeyInvalidate.recountListBytes);

    // 4. Tenant-wide purge.
    responseCache.set(LIST_KEY, entry("g"), 300_000, "global");
    responseCache.set(pointKey("doc-2"), entry("h"), 300_000, "global");
    responseCache.set(pointKey("doc-2"), entry("h"), 300_000, "global");
    void responseCache.invalidateAll("global");
    const purged = responseCache.getL1ByteStats();
    expect(purged.listEntries).toBe(0);
    expect(purged.pointEntries).toBe(0);
    expect(purged.listBytes).toBe(0);
    expect(purged.pointBytes).toBe(0);
  });

  it("stays drift-free through a mixed torture sequence on both tiers", () => {
    let refill: CachedResponseEntry | null = null;
    for (let i = 0; i < 60; i++) {
      const key = i % 3 === 0 ? pointKey(`doc-${i}`) : `${LIST_KEY}?page=${i}`;
      responseCache.set(key, entry("i"), 300_000, "global");

      // Alternate between L1 hits, L2 refills, expiry and surgical drops.
      if (i % 5 === 0) {
        refill = entry("j");
        mockCache.getSync.mockReturnValue(refill);
        responseCache.get(`${LIST_KEY}?refill=${i}`, "global");
      }
      if (i % 7 === 0) {
        responseCache.set(`${LIST_KEY}?short=${i}`, entry("k"), -1, "global");
        responseCache.get(`${LIST_KEY}?short=${i}`, "global");
      }
      if (i % 11 === 0) {
        responseCache.invalidateLocal("posts", "global", { entryIds: [`doc-${i}`] });
      }
      if (i % 13 === 0) {
        void responseCache.invalidate(`${LIST_KEY}?page=${i}`, "global");
      }
      if (i % 17 === 0) {
        responseCache.trimLocal();
      }
    }

    const stats = responseCache.getL1ByteStats();
    expect(stats.listBytes).toBe(stats.recountListBytes);
    expect(stats.pointBytes).toBe(stats.recountPointBytes);
    expect(stats.listBytes).toBeLessThanOrEqual(stats.listBudgetBytes);
    expect(stats.pointBytes).toBeLessThanOrEqual(stats.pointBudgetBytes);
  });
});
