/**
 * @file tests/unit/databases/negative-cache.test.ts
 * @description Whitebox tests for the hybrid Bloom + exact-TTL negative cache.
 *
 * The Bloom filter is only a prefilter: a positive is authoritative only when
 * the bounded exact map still holds a live entry. This is what makes write
 * invalidation and TTL expiry correct without a 1 % false-positive 404 rate.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  NegativeCacheManager,
  type NegativeCacheOptions,
} from "@src/databases/cache/negative-cache";

const managers: NegativeCacheManager[] = [];

function create(options?: NegativeCacheOptions) {
  const manager = new NegativeCacheManager(options);
  managers.push(manager);
  return manager;
}

describe("NegativeCacheManager", () => {
  afterEach(() => {
    for (const manager of managers.splice(0)) manager.stop();
  });

  it("reports a recorded miss as negative until invalidated", () => {
    const cache = create();
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(false);

    cache.recordMiss("tenant:t:doc:1");
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(true);

    cache.invalidate("tenant:t:doc:1");
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(false);
  });

  it("does not treat unrelated keys as negative", () => {
    const cache = create();
    cache.recordMiss("tenant:t:doc:1");
    expect(cache.isNegativeHit("tenant:t:doc:2")).toBe(false);
  });

  it("expires exact entries after the TTL (no stale Bloom-only positives)", async () => {
    const cache = create({ exactTtlMs: 10 });
    cache.recordMiss("tenant:t:doc:1");
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(false);
  });

  it("invalidates by doc tag (write path)", () => {
    const cache = create();
    cache.recordMiss("tenant:t:collection:c:doc-1", ["doc:c:doc-1"]);
    cache.recordMiss("tenant:t:collection:c:doc-2", ["doc:c:doc-2"]);

    cache.invalidateByTags(["doc:c:doc-1"]);

    expect(cache.isNegativeHit("tenant:t:collection:c:doc-1")).toBe(false);
    expect(cache.isNegativeHit("tenant:t:collection:c:doc-2")).toBe(true);
  });

  it("invalidates by prefix (tenant / collection flush)", () => {
    const cache = create();
    cache.recordMiss("tenant:a:collection:c:1");
    cache.recordMiss("tenant:b:collection:c:1");

    cache.invalidateByPrefix("tenant:a:");

    expect(cache.isNegativeHit("tenant:a:collection:c:1")).toBe(false);
    expect(cache.isNegativeHit("tenant:b:collection:c:1")).toBe(true);
  });

  it("bounds the exact map by evicting oldest entries", () => {
    const cache = create({ maxExactEntries: 3 });
    cache.recordMiss("k1");
    cache.recordMiss("k2");
    cache.recordMiss("k3");
    cache.recordMiss("k4");

    expect(cache.isNegativeHit("k1")).toBe(false);
    expect(cache.isNegativeHit("k3")).toBe(true);
    expect(cache.isNegativeHit("k4")).toBe(true);
  });

  it("clears every entry on rotation/reset", () => {
    const cache = create();
    cache.recordMiss("tenant:t:doc:1");
    cache.clear();
    expect(cache.isNegativeHit("tenant:t:doc:1")).toBe(false);
  });
});
