/**
 * @file tests/unit/core/response-cache-read-after-write.test.ts
 * @description M2 residual regression: a list/GraphQL body must never be
 * resurrected from the shared L2 after a write.
 *
 * The response cache indexes L1 list keys in `listIndex`/`graphqlIndex` so a
 * write can drop them from L1 *and* from `cacheService` (`res:<key>`). Two
 * states escape that index:
 *
 * - the key was never admitted to L1 (capacity-gated admission at 2000 entries),
 * - the key was FIFO-evicted from L1 (`enforceL1Capacity` unindexes it).
 *
 * In both cases the `res:<key>` L2 copy survives, so a plain `get()` refilled
 * the superseded body and served it for the rest of the TTL (the reported M2
 * symptom: created rows missing, trashed rows still listed, published rows
 * still DRAFT). The fence is the collection generation captured at write time:
 * the write path bumps the epoch before invalidating, and a refill whose `gen`
 * no longer matches is dropped instead of served.
 *
 * Features:
 * - L2 `res:<key>` delete is asserted for every indexed list key (a)
 * - L2-only (admission-rejected / FIFO-evicted) list and GraphQL bodies are
 *   rejected and deleted on the next read (b)
 * - an already-admitted L1 list/GraphQL body is rejected (and unindexed) once
 *   the epoch moves — the cross-node case, where only the epoch propagates
 * - fresh-generation refills and re-sets still hit (no read-lane regression)
 * - point-read L1 bodies carry no `gen` and are never fenced
 * - collection-scoped eviction + tenant isolation (c)
 */

import { beforeEach, describe, expect, it, type Mock } from "vitest";
import {
  buildGraphQLResponseCacheKey,
  buildUserResponseCacheKey,
  responseCache,
  type CachedResponseEntry,
} from "@src/services/cache/response-cache";
import { parseCacheControlStalePolicy } from "@src/services/cache/stale-window";
import { cacheService } from "@src/databases/cache/cache-service";

const cache = cacheService as unknown as {
  getSync: Mock;
  get: Mock;
  set: Mock;
  delete: Mock;
  getCollectionEpoch: Mock<(scope: string, tenantId?: string | null) => number>;
  bumpCollectionEpoch: Mock<(scope: string, tenantId?: string | null) => number>;
};

/**
 * Live collection generations. Mirrors the real service's process-local map so
 * `invalidateLocal`'s synthetic GraphQL bump is observable without the test
 * poking the value the code under test is supposed to set.
 */
let epochs: Map<string, number>;

/** The exact object handed to `cacheService.set` — i.e. the shared L2 body. */
function lastL2Entry(): CachedResponseEntry {
  const call = cache.set.mock.calls.at(-1);
  if (!call) throw new Error("expected a shared L2 write");
  return call[1] as CachedResponseEntry;
}

const listKey = (collection: string, search: string, user = "u1") =>
  buildUserResponseCacheKey(`/api/collections/${collection}`, search, user);

beforeEach(() => {
  epochs = new Map();
  responseCache.trimLocal();
  cache.getSync.mockReset().mockReturnValue(null);
  cache.get.mockReset().mockResolvedValue(null);
  cache.set.mockReset().mockResolvedValue(undefined);
  cache.delete.mockReset().mockResolvedValue(true);
  cache.getCollectionEpoch
    .mockReset()
    .mockImplementation((scope: string) => epochs.get(scope) ?? 0);
  cache.bumpCollectionEpoch.mockReset().mockImplementation((scope: string) => {
    const next = (epochs.get(scope) ?? 0) + 1;
    epochs.set(scope, next);
    return next;
  });
});

describe("Response cache read-after-write consistency (M2 residual)", () => {
  it("deletes the shared L2 copy of every indexed list key (a)", () => {
    const tenant = "m2-a";
    const page1 = listKey("posts", "?limit=10");
    const page2 = listKey("posts", "?limit=20");

    responseCache.set(page1, { body: '{"v":1}', etag: '"1"' }, 60_000, tenant);
    responseCache.set(page2, { body: '{"v":2}', etag: '"2"' }, 60_000, tenant);
    cache.delete.mockClear();

    responseCache.invalidateLocal("posts", tenant);

    expect(cache.delete).toHaveBeenCalledWith(`res:${page1}`, tenant);
    expect(cache.delete).toHaveBeenCalledWith(`res:${page2}`, tenant);
    // Tenant scoping must be passed through verbatim, never widened to default.
    for (const call of cache.delete.mock.calls) expect(call[1]).toBe(tenant);
  });

  it("refuses to refill a superseded list body left only in shared L2 (b)", () => {
    const tenant = "m2-b";
    const key = listKey("posts", "?limit=10");

    responseCache.set(key, { body: '{"v":1}', etag: '"1"' }, 60_000, tenant);
    const l2Entry = lastL2Entry();
    expect(l2Entry.gen).toBe(0);

    // L1 loses the slot but the shared L2 copy survives — the exact state left
    // by capacity-gated admission (no slot ever taken) and by FIFO eviction
    // (`enforceL1Capacity` unindexes without touching L2).
    responseCache.trimLocal();
    cache.delete.mockClear();

    // Write path: the caller bumps, then invalidates (handle-api-requests /
    // post-write). The key is no longer indexed, so the invalidation cannot
    // delete it from L2 — the epoch fence has to.
    cache.bumpCollectionEpoch("posts", tenant);
    responseCache.invalidateLocal("posts", tenant);
    expect(cache.delete).not.toHaveBeenCalledWith(`res:${key}`, tenant);

    // The next read sees only the superseded L2 body and must not serve it.
    cache.getSync.mockReturnValue(l2Entry);
    expect(responseCache.get(key, tenant)).toBeNull();
    expect(cache.delete).toHaveBeenCalledWith(`res:${key}`, tenant);

    // It was dropped, so a later read cannot resurrect it either.
    cache.getSync.mockReturnValue(null);
    expect(responseCache.get(key, tenant)).toBeNull();
  });

  it("still refills a body written after the write (no L1 refill regression)", () => {
    const tenant = "m2-b-fresh";
    const key = listKey("posts", "?limit=10");

    cache.bumpCollectionEpoch("posts", tenant);
    responseCache.set(key, { body: '{"v":2}', etag: '"2"' }, 60_000, tenant);
    const l2Entry = lastL2Entry();
    expect(l2Entry.gen).toBe(1);
    responseCache.trimLocal();

    cache.getSync.mockReturnValue(l2Entry);
    expect(responseCache.get(key, tenant)?.body).toBe('{"v":2}');
    expect(cache.delete).not.toHaveBeenCalledWith(`res:${key}`, tenant);
  });

  it("rejects an already-admitted L1 list body once the epoch moves (peer bump)", async () => {
    const tenant = "m2-l1-peer";
    const key = listKey("posts", "?limit=10");

    responseCache.set(key, { body: '{"v":1}', etag: '"1"' }, 60_000, tenant);
    expect(lastL2Entry().gen).toBe(0);
    expect(responseCache.get(key, tenant)?.body).toBe('{"v":1}');
    const resident = responseCache.getL1ByteStats().listEntries;

    // A write on another node: only the epoch propagates here. The peer's
    // `invalidateLocal` cannot reach this process's L1 slot, so the epoch fence
    // is the only thing that can reject the body — and it must drop it rather
    // than merely skip it.
    cache.bumpCollectionEpoch("posts", tenant);
    expect(responseCache.get(key, tenant)).toBeNull();
    expect(responseCache.getL1ByteStats().listEntries).toBe(resident - 1);
    // Dropped means dropped: the next read cannot find it either (L2 is empty).
    expect(responseCache.get(key, tenant)).toBeNull();
    // `getAsync()` starts from the same L1 lookup, so it inherits the fence.
    expect(await responseCache.getAsync(key, tenant)).toBeNull();

    // The lookup continues into L2, which re-checks the same fence and serves a
    // body stamped in the new generation.
    const fresh: CachedResponseEntry = {
      body: '{"v":2}',
      etag: '"2"',
      gen: 1,
      expiresAt: Date.now() + 60_000,
    };
    cache.getSync.mockReturnValue(fresh);
    expect(responseCache.get(key, tenant)?.body).toBe('{"v":2}');

    // A body written after the bump is stamped with the live generation and hits.
    responseCache.set(key, { body: '{"v":3}', etag: '"3"' }, 60_000, tenant);
    expect(lastL2Entry().gen).toBe(1);
    expect(responseCache.get(key, tenant)?.body).toBe('{"v":3}');
  });

  it("rejects an already-admitted L1 GraphQL body when its collection or synthetic scope moves", () => {
    const tenant = "m2-l1-gql";
    const postsKey = buildGraphQLResponseCacheKey("query { posts { id } }", {}, "all", "u1");
    const authorsKey = buildGraphQLResponseCacheKey("query { authors { id } }", {}, "all", "u1");
    const multiKey = buildGraphQLResponseCacheKey(
      "query { posts { id } authors { id } }",
      {},
      "all",
      "u1",
    );

    responseCache.set(postsKey, { body: '{"data":["v1"]}', etag: '"g1"' }, 60_000, tenant);
    responseCache.set(authorsKey, { body: '{"data":["a1"]}', etag: '"ga1"' }, 60_000, tenant);
    responseCache.set(multiKey, { body: '{"data":["m1"]}', etag: '"gm1"' }, 60_000, tenant);
    expect(responseCache.get(postsKey, tenant)?.body).toBe('{"data":["v1"]}');
    expect(responseCache.get(authorsKey, tenant)?.body).toBe('{"data":["a1"]}');
    expect(responseCache.get(multiKey, tenant)?.body).toBe('{"data":["m1"]}');
    const resident = responseCache.getL1ByteStats().listEntries;

    // Single-collection GraphQL queries are scoped to their collection epoch so
    // writing to `posts` rejects `posts` without evicting unrelated `authors`.
    cache.bumpCollectionEpoch("posts", tenant);

    expect(responseCache.get(postsKey, tenant)).toBeNull();
    expect(responseCache.get(authorsKey, tenant)?.body).toBe('{"data":["a1"]}');
    expect(responseCache.getL1ByteStats().listEntries).toBe(resident - 1);

    // Multi-collection GraphQL queries fall back to the shared synthetic `__graphql__` scope.
    cache.bumpCollectionEpoch("__graphql__", tenant);
    expect(responseCache.get(multiKey, tenant)).toBeNull();

    responseCache.set(postsKey, { body: '{"data":["v2"]}', etag: '"g2"' }, 60_000, tenant);
    expect(responseCache.get(postsKey, tenant)?.body).toBe('{"data":["v2"]}');
  });

  it("leaves already-admitted point-read L1 hits outside the epoch fence", () => {
    const tenant = "m2-l1-point";
    const point = buildUserResponseCacheKey("/api/collections/posts/p-1", "", "u1");

    // 2-touch admission: the first sighting only records the id.
    responseCache.set(point, { body: '{"id":"p1"}', etag: '"p1"' }, 60_000, tenant);
    responseCache.set(point, { body: '{"id":"p1"}', etag: '"p1"' }, 60_000, tenant);
    expect(responseCache.get(point, tenant)?.body).toBe('{"id":"p1"}');
    const resident = responseCache.getL1ByteStats().pointEntries;

    cache.bumpCollectionEpoch("posts", tenant);
    expect(epochs.get("posts")).toBe(1);

    // Point bodies are never stamped (`gen === undefined`), so the hit path skips
    // the epoch lookup entirely and keeps serving them.
    expect(responseCache.get(point, tenant)?.body).toBe('{"id":"p1"}');
    expect(responseCache.get(point, tenant, true)?.body).toBe('{"id":"p1"}');
    expect(responseCache.getL1ByteStats().pointEntries).toBe(resident);
  });

  it("fences a multi-collection GraphQL body in L2 after any write while keeping other single-collection GraphQL intact", () => {
    const tenant = "m2-gql";
    const multiKey = buildGraphQLResponseCacheKey(
      "query { posts { id } authors { id } }",
      {},
      "all",
      "u1",
    );
    const authorsKey = buildGraphQLResponseCacheKey("query { authors { id } }", {}, "all", "u1");

    responseCache.set(multiKey, { body: '{"data":[]}', etag: '"gm"' }, 60_000, tenant);
    const l2Entry = lastL2Entry();
    expect(l2Entry.gen).toBe(0);

    responseCache.trimLocal();
    responseCache.set(authorsKey, { body: '{"data":["a1"]}', etag: '"ga"' }, 60_000, tenant);
    cache.delete.mockClear();

    // Writing `posts` bumps the synthetic `__graphql__` epoch for multi-collection
    // queries left in L2, while single-collection `authors` remains cached.
    responseCache.invalidateLocal("posts", tenant);
    expect(epochs.get("__graphql__")).toBe(1);
    expect(cache.delete).not.toHaveBeenCalledWith(`res:${authorsKey}`, tenant);
    expect(responseCache.get(authorsKey, tenant)?.body).toBe('{"data":["a1"]}');

    cache.getSync.mockReturnValue(l2Entry);
    expect(responseCache.get(multiKey, tenant)).toBeNull();
    expect(cache.delete).toHaveBeenCalledWith(`res:${multiKey}`, tenant);
  });

  it("keeps strict M2 misses by default and serves bounded stale only on explicit Cache-Control opt-in", () => {
    const tenant = "m2-opt-in-swr";
    const key = listKey("posts", "?limit=5");

    responseCache.set(key, { body: '{"v":1}', etag: '"1"' }, 60_000, tenant);
    responseCache.invalidateLocal("posts", tenant);

    // Strict read-after-write default: invalidated entry returns null.
    expect(responseCache.get(key, tenant)).toBeNull();

    // `no-cache` and `no-store` stay strict even when SWR is also present.
    expect(
      responseCache.get(key, tenant, false, {
        stalePolicy: parseCacheControlStalePolicy("no-cache, stale-while-revalidate=30"),
      }),
    ).toBeNull();

    // Explicit `stale-while-revalidate` opt-in serves the bounded stale snapshot.
    const staleHit = responseCache.get(key, tenant, false, {
      stalePolicy: parseCacheControlStalePolicy("max-age=60, stale-while-revalidate=30"),
    });
    expect(staleHit?.stale).toBe(true);
    expect(staleHit?.body).toBe('{"v":1}');
  });

  it("patches resident pointL1 entries lazily in place while evicting projected or nested-object updates", () => {
    const tenant = "m2-point-patch";
    const id = "post-42";
    const fullKey = buildUserResponseCacheKey(`/api/collections/posts/${id}`, "", "u1");
    const projectedKey = buildUserResponseCacheKey(
      `/api/collections/posts/${id}`,
      "?fields=_id,title",
      "u1",
    );
    const fullEntry: CachedResponseEntry = {
      body: '{"success":true,"data":{"_id":"post-42","title":"Old","views":10,"status":"published"}}',
      etag: '"post-42-1"',
    };
    const projectedEntry: CachedResponseEntry = {
      body: '{"success":true,"data":{"_id":"post-42","title":"Old"}}',
      etag: '"post-42-proj"',
    };

    // 2-touch admission for both full and projected point keys.
    responseCache.set(fullKey, fullEntry, 60_000, tenant);
    responseCache.set(fullKey, fullEntry, 60_000, tenant);
    responseCache.set(projectedKey, projectedEntry, 60_000, tenant);
    responseCache.set(projectedKey, projectedEntry, 60_000, tenant);

    const beforeStats = responseCache.getL1ByteStats();
    expect(beforeStats.pointEntries).toBe(2);
    expect(beforeStats.pointBytes).toBe(beforeStats.recountPointBytes);

    // Consecutive plain patches coalesce in pendingPatch without evicting fullKey,
    // while projectedKey is evicted so partial-field projection stays accurate.
    responseCache.invalidateLocal("posts", tenant, {
      entryIds: [id],
      entryPatches: {
        [id]: {
          patch: { views: 11, updatedAt: "2026-11-15T10:00:00.000Z" },
          updatedAt: "2026-11-15T10:00:00.000Z",
        },
      },
    });
    responseCache.invalidateLocal("posts", tenant, {
      entryIds: [id],
      entryPatches: {
        [id]: { patch: { views: 12, title: "New" }, updatedAt: "2026-11-15T10:00:00.000Z" },
      },
    });

    expect(responseCache.get(projectedKey, tenant, true)).toBeNull();
    const patchedHit = responseCache.getPoint(fullKey, tenant);
    expect(patchedHit).not.toBeNull();
    expect(patchedHit?.etag).not.toBe('"post-42-1"');
    const parsed = JSON.parse(patchedHit!.body);
    expect(parsed).toEqual({
      success: true,
      data: {
        _id: "post-42",
        title: "New",
        views: 12,
        status: "published",
      },
    });
    const afterStats = responseCache.getL1ByteStats();
    expect(afterStats.pointBytes).toBe(afterStats.recountPointBytes);

    // Nested plain objects fall back to eviction because SQL json_patch may deep-merge.
    responseCache.invalidateLocal("posts", tenant, {
      entryIds: [id],
      entryPatches: {
        [id]: { patch: { seo: { title: "OnlyTitle" } }, updatedAt: "2026-11-15T10:00:01.000Z" },
      },
    });
    expect(responseCache.getPoint(fullKey, tenant)).toBeNull();
    expect(responseCache.getL1ByteStats().pointEntries).toBe(0);
    expect(responseCache.getL1ByteStats().pointBytes).toBe(0);
  });

  it("scopes eviction to the written collection and tenant (c)", () => {
    const tenantA = "m2-c-a";
    const tenantB = "m2-c-b";
    const postsA = listKey("posts", "?limit=10");
    const authorsA = listKey("authors", "?limit=10");
    const postsB = listKey("posts", "?limit=10");

    responseCache.set(postsA, { body: '{"posts":"a"}', etag: '"pa"' }, 60_000, tenantA);
    responseCache.set(authorsA, { body: '{"authors":1}', etag: '"au"' }, 60_000, tenantA);
    responseCache.set(postsB, { body: '{"posts":"b"}', etag: '"pb"' }, 60_000, tenantB);
    cache.delete.mockClear();

    responseCache.invalidateLocal("posts", tenantA);

    expect(cache.delete).toHaveBeenCalledWith(`res:${postsA}`, tenantA);
    expect(cache.delete).not.toHaveBeenCalledWith(`res:${authorsA}`, tenantA);
    expect(cache.delete).not.toHaveBeenCalledWith(`res:${postsB}`, tenantB);

    // Sibling collection and the other tenant keep their L1 hits.
    expect(responseCache.get(authorsA, tenantA)?.body).toBe('{"authors":1}');
    expect(responseCache.get(postsB, tenantB)?.body).toBe('{"posts":"b"}');
  });
});
