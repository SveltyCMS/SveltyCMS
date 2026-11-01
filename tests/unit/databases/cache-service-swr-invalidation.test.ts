/**
 * @file tests/unit/databases/cache-service-swr-invalidation.test.ts
 * @description SWR entries must be invalidatable across the L1/L2 boundary.
 *
 * The collection list and its status facets are cached through
 * `getOrSetSWR(key, …, tags)` and read again by the SSR loader on every
 * `refreshAll()` — i.e. right after a create, an update or a bulk publish. The
 * write lanes invalidate by TAG (`clearByTags(['collection:<id>', …])`), which
 * resolves the victim keys through the `tag:<tenant>:<tag>` index.
 *
 * Regression: the SWR value was written to L2 with a bare `l2.set`, so the L2
 * copy never appeared in that index. A write then cleared L1 only, the next read
 * rehydrated the stale list from L2 and served it for the whole SWR window —
 * "the saved row is missing from the list until the cache expires" and "the
 * status counts do not change".
 *
 * The filename contains `cache-service` so `tests/unit/setup.ts`
 * (`isTestTarget("cache-service")`) disables the global cacheMock and the real
 * `CacheService` + `FakeRedis` run instead.
 */

import { describe, it, expect, afterEach } from "vitest";
import { FakeRedis } from "./fake-redis";

type AnyService = {
  connectL2ForTest: (l2: unknown) => Promise<void>;
  flushL2WritesForTest: () => Promise<void>;
  getOrSetSWR: (
    key: string,
    fetchFn: () => Promise<unknown>,
    ttl: number,
    staleTtl: number,
    tenantId: string | null,
    category: string,
    tags: string[],
  ) => Promise<unknown>;
  clearByTags: (tags: string[], tenantId: string | null) => Promise<void>;
  cleanup: () => Promise<void>;
};

async function freshService(): Promise<AnyService> {
  const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
  const service = new module.CacheService() as AnyService;
  await service.connectL2ForTest(new FakeRedis());
  return service;
}

/** Cache key shape produced by `buildCollectionQueryCacheKey` (collection-service). */
const LIST_KEY =
  "collection:Posts:query:9f2c:page:1:size:10:lang:en:tenant:default:user:u1:edit:none";
const FACETS_KEY = "collection:Posts:facets:default";
/** Tag contract of `CollectionService.getCollectionData` / `getStatusFacets`. */
const LIST_TAGS = ["collection", "collection:Posts"];
/** Tag set a document write clears (post-write.ts `queueInvalidation`). */
const WRITE_CLEARED_TAGS = ["collection:Posts", "count:Posts", "res:graphql"];

const TTL_FRESH_MS = 60_000;
const TTL_STALE_MS = 300_000;

let services: AnyService[] = [];

afterEach(async () => {
  for (const service of services) await service.cleanup().catch(() => {});
  services = [];
});

async function service(): Promise<AnyService> {
  const created = await freshService();
  services.push(created);
  return created;
}

describe("CacheService SWR + L2 invalidation", () => {
  it("does not resurrect an invalidated collection list from L2", async () => {
    const cache = await service();
    const rowsBefore = { entries: [{ _id: "old-1", title: "Old" }], totalItems: 1 };
    const rowsAfter = {
      entries: [
        { _id: "new-1", title: "New" },
        { _id: "old-1", title: "Old" },
      ],
      totalItems: 2,
    };

    expect(
      await cache.getOrSetSWR(
        LIST_KEY,
        async () => rowsBefore,
        TTL_FRESH_MS,
        TTL_STALE_MS,
        "default",
        "collection",
        LIST_TAGS,
      ),
    ).toEqual(rowsBefore);
    // The entry has to be durable in L2 before the write, otherwise this would
    // prove nothing about the read-through path.
    await cache.flushL2WritesForTest();

    // What a create/update/bulk publish does: clear the collection's list tags.
    await cache.clearByTags(WRITE_CLEARED_TAGS, "default");

    const afterWrite = await cache.getOrSetSWR(
      LIST_KEY,
      async () => rowsAfter,
      TTL_FRESH_MS,
      TTL_STALE_MS,
      "default",
      "collection",
      LIST_TAGS,
    );
    expect(afterWrite).toEqual(rowsAfter);
  });

  it("does not resurrect invalidated status facets from L2", async () => {
    const cache = await service();
    expect(
      await cache.getOrSetSWR(
        FACETS_KEY,
        async () => ({ draft: 2, publish: 0 }),
        30_000,
        60_000,
        "default",
        "collection",
        LIST_TAGS,
      ),
    ).toEqual({ draft: 2, publish: 0 });
    await cache.flushL2WritesForTest();

    await cache.clearByTags(WRITE_CLEARED_TAGS, "default");

    expect(
      await cache.getOrSetSWR(
        FACETS_KEY,
        async () => ({ draft: 0, publish: 2 }),
        30_000,
        60_000,
        "default",
        "collection",
        LIST_TAGS,
      ),
    ).toEqual({ draft: 0, publish: 2 });
  });

  it("does not let a buffered SWR write survive a clear issued afterwards", async () => {
    // The race M2's fix introduced: SWR values now reach L2 through the 15 ms
    // write batcher, so a write buffered *just before* a write-path clear can
    // land *after* it and re-create the entry with tag membership and a fresh
    // TTL. `clearByTags` therefore drains the batcher before it reads the tag
    // index — otherwise the stale list came back for another full SWR window.
    const l2 = new FakeRedis();
    const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
    const cache = new module.CacheService() as AnyService & {
      generateKey: (key: string, tenantId: string | null) => string;
    };
    services.push(cache);
    await cache.connectL2ForTest(l2);
    const fullKey = cache.generateKey(LIST_KEY, "default");

    let fetches = 0;
    const rowsBefore = { entries: [{ _id: "old-1", title: "Old" }], totalItems: 1 };
    await cache.getOrSetSWR(
      LIST_KEY,
      async () => {
        fetches += 1;
        return rowsBefore;
      },
      TTL_FRESH_MS,
      TTL_STALE_MS,
      "default",
      "collection",
      LIST_TAGS,
    );
    // Deliberately NOT flushed: the value still sits in the batcher's buffer.
    expect(await l2.get(fullKey)).toBeNull();

    // A create/update lands during that window and clears the list tags.
    await cache.clearByTags(WRITE_CLEARED_TAGS, "default");

    // Whatever the batcher still held would flush here (background timer or
    // shutdown). Nothing may come back from it.
    await cache.flushL2WritesForTest();
    expect(await l2.get(fullKey)).toBeNull();
    expect(await l2.sMembers("tag:default:collection:Posts")).toEqual([]);

    // And the read path refetches instead of serving the resurrected copy.
    const rowsAfter = {
      entries: [
        { _id: "new-1", title: "New" },
        { _id: "old-1", title: "Old" },
      ],
      totalItems: 2,
    };
    const afterWrite = await cache.getOrSetSWR(
      LIST_KEY,
      async () => {
        fetches += 1;
        return rowsAfter;
      },
      TTL_FRESH_MS,
      TTL_STALE_MS,
      "default",
      "collection",
      LIST_TAGS,
    );
    expect(afterWrite).toEqual(rowsAfter);
    expect(fetches).toBe(2);
  });

  it("keeps a write's surgical scope: other collections stay cached", async () => {
    const cache = await service();
    const authorsKey =
      "collection:Authors:query:71ab:page:1:size:10:lang:en:tenant:default:user:u1:edit:none";
    await cache.getOrSetSWR(
      authorsKey,
      async () => ({ entries: ["a1"] }),
      TTL_FRESH_MS,
      TTL_STALE_MS,
      "default",
      "collection",
      ["collection", "collection:Authors"],
    );
    await cache.flushL2WritesForTest();

    await cache.clearByTags(WRITE_CLEARED_TAGS, "default");

    // No refetch: the untargeted collection is still served from cache.
    expect(
      await cache.getOrSetSWR(
        authorsKey,
        async () => ({ entries: ["refetched"] }),
        TTL_FRESH_MS,
        TTL_STALE_MS,
        "default",
        "collection",
        ["collection", "collection:Authors"],
      ),
    ).toEqual({ entries: ["a1"] });
  });
});
