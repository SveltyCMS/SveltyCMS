/**
 * @file tests/unit/hooks/response-compression-stash.test.ts
 * @description Variant stash contract: size/cardinality gates, the builder's
 * API guards, and the supersession/staleness guard on the L1 re-set.
 */

import { describe, expect, it } from "vitest";
import {
  buildCompressionVariants,
  scheduleTurboVariantStash,
  shouldStashVariants,
  STASH_MAX_BYTES,
  STASH_MIN_BYTES,
} from "@src/hooks/response-compression-stash";
import { responseCache } from "@src/services/cache/response-cache";
import { hasAsyncZstd, SYNC_MAX_SIZE } from "@src/hooks/handle-compression";

/** Highly compressible JSON, roughly 150 B per row. */
function payload(rows: number): string {
  return JSON.stringify({
    success: true,
    data: Array.from({ length: rows }, (_, i) => ({
      _id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Synthetic row ${i}`,
      body: "lorem ipsum dolor sit amet, consectetur adipiscing elit ".repeat(3),
      status: "published",
    })),
  });
}

const KEY = (suffix: string) => `/api/collections/unit-stash-${suffix}?page=1`;
const TENANT = "unit-stash-tenant";

describe("shouldStashVariants", () => {
  it("gates on the size window", () => {
    expect(shouldStashVariants(STASH_MIN_BYTES, false)).toBe(false);
    expect(shouldStashVariants(STASH_MIN_BYTES + 1, false)).toBe(true);
    expect(shouldStashVariants(STASH_MAX_BYTES + 1, false)).toBe(false);
  });

  it("skips point reads whatever the size", () => {
    expect(shouldStashVariants(64 * 1024, true)).toBe(false);
  });
});

describe("buildCompressionVariants", () => {
  it("builds smaller variants for a compressible body inside every size window", async () => {
    const body = payload(200);
    const size = Buffer.byteLength(body, "utf8");
    expect(size).toBeGreaterThan(STASH_MIN_BYTES);
    expect(size).toBeLessThanOrEqual(SYNC_MAX_SIZE);

    const variants = await buildCompressionVariants(body, size);
    const entries = Object.entries(variants);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, variant] of entries) expect(variant.byteLength).toBeLessThan(size);
    expect(variants.zstd).toBeDefined();
  });

  it("drops the sync-only br/gzip above SYNC_MAX_SIZE but still runs async zstd", async () => {
    const body = payload(1400);
    const size = Buffer.byteLength(body, "utf8");
    expect(size).toBeGreaterThan(SYNC_MAX_SIZE);

    const variants = await buildCompressionVariants(body, size);
    expect(variants.br).toBeUndefined();
    expect(variants.gzip).toBeUndefined();
    if (hasAsyncZstd()) {
      expect(variants.zstd).toBeDefined();
      expect(variants.zstd!.byteLength).toBeLessThan(size);
    }
  });

  it("drops expanded output", async () => {
    // 8 KiB of base64-ish entropy: nothing compresses smaller.
    const noise = Array.from({ length: 8192 }, (_, i) =>
      String.fromCharCode(33 + ((i * 97) % 90)),
    ).join("");
    const body = JSON.stringify({ blob: noise });
    const size = Buffer.byteLength(body, "utf8");
    const variants = await buildCompressionVariants(body, size);
    for (const [, variant] of Object.entries(variants)) {
      expect(variant.byteLength).toBeLessThan(size);
    }
  });
});

describe("scheduleTurboVariantStash", () => {
  it("attaches variants to an existing list entry", async () => {
    const body = payload(250);
    const size = Buffer.byteLength(body, "utf8");
    const key = KEY("hit");
    responseCache.set(key, { body, etag: '"v1"' }, 60_000, TENANT, { skipSharedL1: true });

    await scheduleTurboVariantStash({
      key,
      body,
      etag: '"v1"',
      byteLength: size,
      ttlMs: 60_000,
      tenantId: TENANT,
      setOptions: { skipSharedL1: true },
    });

    const entry = responseCache.get(key, TENANT);
    expect(entry?.compressed && Object.keys(entry.compressed).length).toBeGreaterThan(0);
    expect(entry?.stale).toBe(false);
  });

  it("never overwrites a superseded body", async () => {
    const body = payload(120);
    const size = Buffer.byteLength(body, "utf8");
    const key = KEY("superseded");
    responseCache.set(key, { body: "{}", etag: '"new"' }, 60_000, TENANT, { skipSharedL1: true });

    await scheduleTurboVariantStash({
      key,
      body,
      etag: '"old"',
      byteLength: size,
      ttlMs: 60_000,
      tenantId: TENANT,
      setOptions: { skipSharedL1: true },
    });

    const entry = responseCache.get(key, TENANT);
    expect(entry?.etag).toBe('"new"');
    expect(entry?.compressed).toBeUndefined();
  });

  it("attaches variants to a stale entry without clearing the write's staleness mark", async () => {
    const collection = "unit-stash-stale";
    const key = `/api/collections/${collection}?page=1`;
    const body = payload(250);
    const size = Buffer.byteLength(body, "utf8");
    responseCache.set(key, { body, etag: '"v1"' }, 60_000, TENANT, { skipSharedL1: true });
    responseCache.invalidateLocal(collection, TENANT);
    expect(responseCache.get(key, TENANT)?.stale).toBe(true);

    await scheduleTurboVariantStash({
      key,
      body,
      etag: '"v1"',
      byteLength: size,
      ttlMs: 60_000,
      tenantId: TENANT,
      setOptions: { skipSharedL1: true },
    });

    const entry = responseCache.get(key, TENANT);
    expect(entry?.stale).toBe(true);
    expect(entry?.compressed && Object.keys(entry.compressed).length).toBeGreaterThan(0);
  });

  it("is a no-op below the size gate and for point-read keys", async () => {
    const tiny = '{"ok":true}';
    const tinyKey = KEY("tiny");
    responseCache.set(tinyKey, { body: tiny, etag: '"t"' }, 60_000, TENANT, {
      skipSharedL1: true,
    });
    await scheduleTurboVariantStash({
      key: tinyKey,
      body: tiny,
      etag: '"t"',
      byteLength: Buffer.byteLength(tiny, "utf8"),
      ttlMs: 60_000,
      tenantId: TENANT,
    });
    expect(responseCache.get(tinyKey, TENANT)?.compressed).toBeUndefined();

    const body = payload(250);
    const pointKey = `/api/collections/unit-stash-point/entry-1?page=1`;
    responseCache.set(pointKey, { body, etag: '"p"' }, 60_000, TENANT, { skipSharedL1: true });
    await scheduleTurboVariantStash({
      key: pointKey,
      body,
      etag: '"p"',
      byteLength: Buffer.byteLength(body, "utf8"),
      ttlMs: 60_000,
      tenantId: TENANT,
      skipPointRead: true,
    });
    expect(responseCache.get(pointKey, TENANT)?.compressed).toBeUndefined();
  });
});
