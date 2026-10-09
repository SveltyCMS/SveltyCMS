/**
 * @file tests/unit/sdk/read-pipeline-perf.test.ts
 * @description Behavior-parity tests for the Collections READ hot-path
 * optimizations. Every assertion is on an observable output — cache keys,
 * payload shapes, call counts/arguments, reference identity — never on
 * timings.
 *
 * ### Features:
 * - buildFindCacheKey: default/id/status/FNV branches + bypass null
 * - readThroughCache: L1 → sync L2 → async L2 → miss, payload wrapping
 * - request cache: keyspace eviction + O(1) epoch invalidation
 * - resolvePopulatedRelations: L1/L2 probes, in-place compaction order, chunking
 * - decryptReadResult/decryptReadStream: clone vs in-place reference semantics
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/databases/db-interface";
import {
  buildFindCacheKey,
  decryptReadResult,
  decryptReadStream,
  normalizeRelationshipFilter,
  readThroughCache,
  syncQueryHash,
  type BuildFindCacheKeyParams,
} from "@src/services/sdk/namespaces/collections/read-pipeline";
import {
  evictRequestCache,
  getRequestCache,
  hasRequestCache,
  setRequestCache,
} from "@src/services/sdk/namespaces/collections/request-cache";
import { resolvePopulatedRelations } from "@src/services/sdk/namespaces/populate-resolver";
import { cacheService } from "@src/databases/cache/cache-service";

const ENC_CTX = { collectionId: "posts", tenantId: "global" };
const ENCRYPTED_HOT = { _hasEncryptedFields: true, _encryptedFieldNames: ["secret"] };
const TENANT = "t1" as DatabaseId;

function baseParams(overrides: Partial<BuildFindCacheKeyParams> = {}): BuildFindCacheKeyParams {
  return {
    schemaId: "posts",
    tenantId: "t1" as DatabaseId,
    filter: {},
    query: { tenantId: "t1" },
    limit: 50,
    offset: 0,
    sort: undefined,
    decodedCursor: null,
    effectiveFilter: "all",
    skipRequestCache: false,
    bypassCache: false,
    options: {},
    ...overrides,
  };
}

beforeEach(() => {
  evictRequestCache();
  vi.clearAllMocks();
});

afterEach(() => {
  evictRequestCache();
  // Restore the mocked CacheService to its miss-by-default shape so each test
  // starts from the same L2 state.
  vi.mocked(cacheService.getSync).mockReset();
  vi.mocked(cacheService.get).mockReset();
  vi.mocked(cacheService.getMany).mockReset();
});

describe("buildFindCacheKey", () => {
  it("emits the canonical default_50 key for an unconstrained list", () => {
    expect(buildFindCacheKey(baseParams())).toBe("t1:collection:posts:find:default_50");
  });

  it("appends the publication suffix for clamped callers", () => {
    expect(buildFindCacheKey(baseParams({ effectiveFilter: "published" }))).toBe(
      "t1:collection:posts:find:default_50:published",
    );
  });

  it("emits the find:id key for a single-key _id query", () => {
    const key = buildFindCacheKey(baseParams({ filter: { _id: "abc" }, query: { _id: "abc" } }));
    expect(key).toBe("t1:collection:posts:find:id:abc");
  });

  it("interpolates status-only keys with canonical field tokens", () => {
    const key = buildFindCacheKey(
      baseParams({
        query: { tenantId: "t1", status: "publish" },
        effectiveFilter: "published",
        limit: 20,
        offset: 5,
        options: {
          fields: ["a", "b"],
          populate: ["x"],
          sortField: "title",
          sortDirection: "asc",
        },
      }),
    );
    expect(key).toBe("t1:collection:posts:find:published:20:5:title:asc:1:a,1:b:1:x");
  });

  it("defaults sortField/sortDirection to empty/desc in the status-only branch", () => {
    const key = buildFindCacheKey(
      baseParams({
        query: { tenantId: "t1", status: "publish" },
        effectiveFilter: "published",
        options: { fields: "title" },
      }),
    );
    expect(key).toBe("t1:collection:posts:find:published:50:0::desc:title:");
  });

  it("hashes non-trivial filters deterministically", () => {
    const params = baseParams({
      filter: { title: "hello" },
      query: { title: "hello", tenantId: "t1" },
    });
    const a = buildFindCacheKey(params);
    const b = buildFindCacheKey(params);
    expect(a).toBe(b);
    expect(a).toMatch(/^t1:collection:posts:find:[0-9a-z]+$/);
    const other = buildFindCacheKey(
      baseParams({ filter: { title: "world" }, query: { title: "world", tenantId: "t1" } }),
    );
    expect(other).not.toBe(a);
  });

  it("returns null when both caches are bypassed", () => {
    expect(buildFindCacheKey(baseParams({ skipRequestCache: true, bypassCache: true }))).toBeNull();
  });

  it("uses the global tenant prefix without a tenantId", () => {
    const key = buildFindCacheKey(baseParams({ tenantId: null, query: {} }));
    expect(key).toBe("global:collection:posts:find:default_50");
  });
});

describe("syncQueryHash", () => {
  it("is deterministic and stable in format", () => {
    expect(syncQueryHash("q:title=hello;")).toBe(syncQueryHash("q:title=hello;"));
    expect(syncQueryHash("a")).toMatch(/^[0-9a-z]+$/);
    expect(syncQueryHash("a")).not.toBe(syncQueryHash("b"));
  });
});

describe("normalizeRelationshipFilter", () => {
  it("returns arrays and empty filters by identity", () => {
    const arr = [{ a: 1 }];
    expect(normalizeRelationshipFilter(arr)).toBe(arr);
    const empty: Record<string, unknown> = {};
    expect(normalizeRelationshipFilter(empty)).toBe(empty);
    expect(normalizeRelationshipFilter(null)).toBeNull();
  });

  it("rewrites $eq/$ne arrays to $in/$nin without mutating the input", () => {
    const eq = { rel: { $eq: ["a"] } };
    expect(normalizeRelationshipFilter(eq)).toEqual({ rel: { $in: ["a"] } });
    expect(eq).toEqual({ rel: { $eq: ["a"] } });
    const ne = { rel: { $ne: ["a"] } };
    expect(normalizeRelationshipFilter(ne)).toEqual({ rel: { $nin: ["a"] } });
    expect(ne).toEqual({ rel: { $ne: ["a"] } });
  });

  it("leaves plain filters untouched by identity", () => {
    const filter = { title: "x", status: { $in: ["publish"] } };
    expect(normalizeRelationshipFilter(filter)).toBe(filter);
  });
});

describe("readThroughCache", () => {
  const KEY = "t1:collection:posts:find:default_50";

  it("serves an L1 hit without consulting L2", async () => {
    const payload = { success: true, data: [{ _id: "1" }] };
    setRequestCache(KEY, payload);
    const getSync = vi.mocked(cacheService.getSync);
    const get = vi.mocked(cacheService.get);

    const out = await readThroughCache(KEY, TENANT, {
      skipRequestCache: false,
      bypassCache: false,
    });
    expect(out).toEqual({ hit: true, payload });
    expect(getSync).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("reads through the sync L2 layer and re-registers the request cache", async () => {
    const payload = { success: true, data: [] };
    vi.mocked(cacheService.getSync).mockReturnValue(payload);
    const out = await readThroughCache(KEY, TENANT, { skipRequestCache: true, bypassCache: false });
    expect(out).toEqual({ hit: true, payload });
    expect(vi.mocked(cacheService.getSync)).toHaveBeenCalledWith(KEY, "t1");
    expect(getRequestCache(KEY)).toBe(payload);
  });

  it("wraps a bare L2 payload into the { success, data } envelope", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue(null);
    vi.mocked(cacheService.get).mockResolvedValue([{ _id: "1" }]);
    const out = await readThroughCache(KEY, TENANT, {
      skipRequestCache: false,
      bypassCache: false,
    });
    expect(out).toEqual({ hit: true, payload: { success: true, data: [{ _id: "1" }] } });
    expect(getRequestCache(KEY)).toEqual({ success: true, data: [{ _id: "1" }] });
  });

  it("passes an existing envelope through unwrapped", async () => {
    const envelope = { success: false, data: null };
    vi.mocked(cacheService.getSync).mockReturnValue(envelope);
    const out = await readThroughCache(KEY, TENANT, {
      skipRequestCache: false,
      bypassCache: false,
    });
    expect(out).toEqual({ hit: true, payload: envelope });
    expect(out.payload).toBe(envelope);
  });

  it("misses when every layer is empty", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue(null);
    vi.mocked(cacheService.get).mockResolvedValue(null);
    const out = await readThroughCache(KEY, TENANT, {
      skipRequestCache: false,
      bypassCache: false,
    });
    expect(out).toEqual({ hit: false });
    expect(hasRequestCache(KEY)).toBe(false);
  });

  it("bypasses L2 entirely when bypassCache is set", async () => {
    const out = await readThroughCache(KEY, TENANT, { skipRequestCache: false, bypassCache: true });
    expect(out).toEqual({ hit: false });
    expect(vi.mocked(cacheService.getSync)).not.toHaveBeenCalled();
    expect(vi.mocked(cacheService.get)).not.toHaveBeenCalled();
  });

  it("swallows async L2 failures and reports a miss", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue(null);
    vi.mocked(cacheService.get).mockRejectedValueOnce(new Error("l2 down"));
    const out = await readThroughCache(KEY, TENANT, {
      skipRequestCache: false,
      bypassCache: false,
    });
    expect(out).toEqual({ hit: false });
  });
});

describe("request cache epochs", () => {
  const LIST_KEY = "t1:collection:posts:find:default_50";
  const PER_ID_KEY = "custom:request:key"; // no ":find:" — epoch-invalidated only

  it("evicts list keys from the keyspace index and bumps the generation", () => {
    setRequestCache(LIST_KEY, { success: true, data: [] }, "posts", TENANT);
    setRequestCache(PER_ID_KEY, { success: true, data: {} }, "posts", TENANT);
    expect(hasRequestCache(LIST_KEY)).toBe(true);
    expect(hasRequestCache(PER_ID_KEY)).toBe(true);

    evictRequestCache("posts", "t1");
    expect(hasRequestCache(LIST_KEY)).toBe(false);
    // Epoch bump makes the per-id entry stale even though it was never scanned.
    expect(hasRequestCache(PER_ID_KEY)).toBe(false);
    expect(getRequestCache(PER_ID_KEY)).toBeUndefined();
  });

  it("re-seeding after eviction starts a fresh generation", () => {
    setRequestCache(PER_ID_KEY, { success: true, data: {} }, "posts", TENANT);
    evictRequestCache("posts", "t1");
    expect(hasRequestCache(PER_ID_KEY)).toBe(false);

    setRequestCache(PER_ID_KEY, { success: true, data: {} }, "posts", TENANT);
    expect(hasRequestCache(PER_ID_KEY)).toBe(true);
  });

  it("tenant-scoped eviction does not affect other tenants", () => {
    const otherKey = "t2:collection:posts:find:default_50";
    setRequestCache(LIST_KEY, { success: true, data: [] }, "posts", TENANT);
    setRequestCache(otherKey, { success: true, data: [] }, "posts", "t2" as DatabaseId);
    evictRequestCache("posts", "t1");
    expect(hasRequestCache(LIST_KEY)).toBe(false);
    expect(hasRequestCache(otherKey)).toBe(true);
  });

  it("global eviction clears list keys, per-id entries and epochs", () => {
    setRequestCache(LIST_KEY, { success: true, data: [] }, "posts", TENANT);
    setRequestCache(PER_ID_KEY, { success: true, data: {} }, "posts", TENANT);
    evictRequestCache();
    expect(hasRequestCache(LIST_KEY)).toBe(false);
    expect(hasRequestCache(PER_ID_KEY)).toBe(false);
    // A fresh set after global eviction is live again (epochs were reset).
    setRequestCache(PER_ID_KEY, { success: true, data: {} }, "posts", TENANT);
    expect(hasRequestCache(PER_ID_KEY)).toBe(true);
  });
});

describe("resolvePopulatedRelations probes", () => {
  const makeSchema = () => ({
    fields: [
      { name: "author", relation: "authors" },
      { name: "editor", relation: "authors" },
    ],
  });
  const identityName = (id: string) => id;

  it("serves L1-cached relations without a DB query", async () => {
    vi.mocked(cacheService.getSync).mockImplementation((key: string) =>
      key === "t1:collection:authors:a1" ? { success: true, data: { _id: "a1", name: "A" } } : null,
    );
    vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
      keys.map(() => null),
    );

    const findMany = vi.fn().mockResolvedValue({
      success: true,
      data: [{ _id: "a2", name: "B" }],
    });
    const items: Record<string, unknown>[] = [
      { _id: "p1", author: "a1" },
      { _id: "p2", author: "a2" },
    ];
    await resolvePopulatedRelations(
      items,
      makeSchema(),
      ["author"],
      "t1",
      { crud: { findMany } },
      identityName,
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      "authors",
      { _id: { $in: ["a2"] } },
      expect.objectContaining({ limit: 1 }),
    );
    expect(items[0]["_populated_author"]).toEqual({ _id: "a1", name: "A" });
    expect(items[1]["_populated_author"]).toEqual({ _id: "a2", name: "B" });
  });

  it("drops L2 hits in place and preserves id order for the DB batch", async () => {
    vi.mocked(cacheService.getSync).mockImplementation(() => null);
    const getMany = vi
      .mocked(cacheService.getMany)
      .mockImplementation(async (keys: string[]) =>
        keys.map((k) =>
          k.endsWith(":u2") ? { success: true, data: { _id: "u2", name: "B" } } : null,
        ),
      );

    const findMany = vi.fn().mockResolvedValue({
      success: true,
      data: [{ _id: "u1", name: "A" }],
    });
    const items: Record<string, unknown>[] = [{ author: "u1" }, { author: "u2" }, { author: "u3" }];
    await resolvePopulatedRelations(
      items,
      makeSchema(),
      ["author"],
      "t1",
      { crud: { findMany } },
      identityName,
    );

    expect(getMany).toHaveBeenCalledWith(
      ["t1:collection:authors:u1", "t1:collection:authors:u2", "t1:collection:authors:u3"],
      "t1",
    );
    // Only the still-missing ids hit the DB, in original insertion order.
    expect(findMany).toHaveBeenCalledWith(
      "authors",
      { _id: { $in: ["u1", "u3"] } },
      expect.objectContaining({ limit: 2 }),
    );
    expect(items[0]["_populated_author"]).toEqual({ _id: "u1", name: "A" });
    expect(items[1]["_populated_author"]).toEqual({ _id: "u2", name: "B" });
    expect(items[2]["_populated_author"]).toBeNull();
  });

  it("chunks the DB fetch at 500 ids", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue(null);
    vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
      keys.map(() => null),
    );
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [] });

    const items: Record<string, unknown>[] = Array.from({ length: 501 }, (_, i) => ({
      _id: `p${i}`,
      author: `a${i}`,
    }));
    await resolvePopulatedRelations(
      items,
      makeSchema(),
      ["author"],
      "t1",
      { crud: { findMany } },
      identityName,
    );

    expect(findMany).toHaveBeenCalledTimes(2);
    const firstQuery = findMany.mock.calls[0][1] as { _id: { $in: unknown[] } };
    const secondQuery = findMany.mock.calls[1][1] as { _id: { $in: unknown[] } };
    expect(firstQuery._id.$in).toHaveLength(500);
    expect(findMany.mock.calls[0][2]).toMatchObject({ limit: 500 });
    expect(secondQuery._id.$in).toHaveLength(1);
    expect(findMany.mock.calls[1][2]).toMatchObject({ limit: 1 });
  });

  it("attaches every field of a shared target collection from one query", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue(null);
    vi.mocked(cacheService.getMany).mockImplementation(async (keys: string[]) =>
      keys.map(() => null),
    );
    const findMany = vi.fn().mockResolvedValue({
      success: true,
      data: [{ _id: "a1", name: "A" }],
    });
    const items: Record<string, unknown>[] = [{ author: "a1", editor: "a1" }];
    await resolvePopulatedRelations(
      items,
      makeSchema(),
      ["author", "editor"],
      "t1",
      { crud: { findMany } },
      identityName,
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(items[0]["_populated_author"]).toEqual({ _id: "a1", name: "A" });
    expect(items[0]["_populated_editor"]).toEqual({ _id: "a1", name: "A" });
  });
});

describe("decryptReadResult", () => {
  it("returns the result untouched when the schema has no encrypted fields", async () => {
    const result = { success: true, data: [{ _id: "1" }] };
    const hot = { _hasEncryptedFields: false, _encryptedFieldNames: [] };
    expect(await decryptReadResult(result, hot, ENC_CTX)).toBe(result);
  });

  it("clones the envelope data by default, leaving the source intact", async () => {
    const original = { _id: "1", title: "x" };
    const result = { success: true, data: [original] };
    const read = await decryptReadResult(result, ENCRYPTED_HOT, ENC_CTX);
    expect(read).not.toBe(result);
    expect(read.data).not.toBe(result.data);
    expect(read.data[0]).toEqual(original);
    expect(read.data[0]).not.toBe(original);
    expect(result.data[0]).toBe(original);
  });

  it("decrypts in place when clone: false", async () => {
    const result = { success: true, data: [{ _id: "1" }] };
    const read = await decryptReadResult(result, ENCRYPTED_HOT, ENC_CTX, { clone: false });
    expect(read).toBe(result);
    expect(read.data).toBe(result.data);
  });

  it("handles bare arrays and documents without an envelope", async () => {
    const doc = { _id: "1" };
    const read = await decryptReadResult([doc], ENCRYPTED_HOT, ENC_CTX);
    expect(Array.isArray(read)).toBe(true);
    expect(read[0]).toEqual(doc);
    expect(read[0]).not.toBe(doc);

    const single = await decryptReadResult(doc, ENCRYPTED_HOT, ENC_CTX);
    expect(single).toEqual(doc);
    expect(single).not.toBe(doc);
  });

  it("returns null-ish results and null-data envelopes untouched", async () => {
    expect(await decryptReadResult(null, ENCRYPTED_HOT, ENC_CTX)).toBeNull();
    const envelope = { success: true, data: null };
    expect(await decryptReadResult(envelope, ENCRYPTED_HOT, ENC_CTX)).toBe(envelope);
  });
});

describe("decryptReadStream", () => {
  it("yields cloned documents so cached ciphertext stays intact", async () => {
    const sourceDoc = { _id: "1", title: "x" };
    async function* source(): AsyncIterable<unknown> {
      yield sourceDoc;
    }
    const out: unknown[] = [];
    for await (const doc of decryptReadStream(source(), ENCRYPTED_HOT, ENC_CTX)) {
      out.push(doc);
    }
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(sourceDoc);
    expect(out[0]).not.toBe(sourceDoc);
  });
});
