/**
 * @file tests/unit/services/collection-etag.test.ts
 * @description Unit tests for collection-generation weak ETags and DB-free 304s.
 */

import { describe, it, expect } from "vitest";
import {
  buildCollectionWeakEtag,
  collectionEtagMatches,
  collectionReprHash,
  currentCollectionWeakEtag,
  getCollectionIdFromApiPath,
  parseCollectionWeakEtag,
  splitIfNoneMatch,
  tryCollectionNotModified,
  type CollectionEpochStore,
} from "@src/services/cache/collection-etag";

function memoryEpochStore(initial = 0): CollectionEpochStore {
  const map = new Map<string, number>();
  return {
    get(collection, tenantId) {
      return map.get(`${tenantId ?? "g"}:${collection}`) ?? initial;
    },
    bump(collection, tenantId) {
      const key = `${tenantId ?? "g"}:${collection}`;
      const next = (map.get(key) ?? initial) + 1;
      map.set(key, next);
      return next;
    },
  };
}

describe("getCollectionIdFromApiPath", () => {
  it("extracts collection ids from find and entry paths", () => {
    expect(getCollectionIdFromApiPath("/api/collections/posts")).toBe("posts");
    expect(getCollectionIdFromApiPath("/api/collections/posts/abc123")).toBe("posts");
  });

  it("returns null for list, search, revisions, and non-collection paths", () => {
    expect(getCollectionIdFromApiPath("/api/collections")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/collections/list")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/collections/search")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/collections/posts/revisions")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/collections/posts/export")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/collections/posts/abc/revisions")).toBeNull();
    expect(getCollectionIdFromApiPath("/api/content/posts")).toBeNull();
  });
});

describe("collection weak ETag format", () => {
  it("round-trips tenant, collection, epoch, and repr hash", () => {
    const etag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 4,
      reprHash: "deadbeefcafebabe",
    });
    expect(etag.startsWith('W/"cv1|')).toBe(true);
    expect(parseCollectionWeakEtag(etag)).toEqual({
      tenantId: "g",
      collectionId: "posts",
      epoch: 4,
      reprHash: "deadbeefcafebabe",
    });
  });

  it("changes repr hash when query string or user changes", () => {
    const a = collectionReprHash("/api/collections/posts", "?limit=10", "user_1");
    const b = collectionReprHash("/api/collections/posts", "?limit=20", "user_1");
    const c = collectionReprHash("/api/collections/posts", "?limit=10", "user_2");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("matches a token inside a comma-separated If-None-Match list", () => {
    const etag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 1,
      reprHash: "abc",
    });
    expect(splitIfNoneMatch(`${etag}, "other"`)).toContain(etag);
    expect(collectionEtagMatches(`${etag}, "other"`, etag)).toBe(true);
    expect(collectionEtagMatches('"nope"', etag)).toBe(false);
  });
});

describe("HTTP 304 collection ETag", () => {
  function etagFor(
    store: CollectionEpochStore,
    overrides: Partial<{
      collectionId: string;
      tenantId: string | null;
      pathname: string;
      search: string;
      userCacheId: string;
    }> = {},
  ): string {
    return currentCollectionWeakEtag({
      collectionId: "posts",
      tenantId: "tenant_a",
      pathname: "/api/collections/posts",
      search: "?limit=10",
      userCacheId: "u1",
      store,
      ...overrides,
    });
  }

  it("1. returns 304 when epoch and representation match", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    const res = tryCollectionNotModified({
      pathname: "/api/collections/posts",
      search: "?limit=10",
      ifNoneMatch: etag,
      tenantId: "tenant_a",
      userCacheId: "u1",
      store,
    });
    expect(res?.status).toBe(304);
    expect(res?.headers.get("ETag")).toBe(etag);
    expect(res?.headers.get("X-Cache")).toBe("COL-304");
  });

  it("2. matches the validator inside a comma-separated If-None-Match list", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    const res = tryCollectionNotModified({
      pathname: "/api/collections/posts",
      search: "?limit=10",
      ifNoneMatch: `"other", ${etag}`,
      tenantId: "tenant_a",
      userCacheId: "u1",
      store,
    });
    expect(res?.status).toBe(304);
  });

  it("3. misses after a collection epoch bump (write)", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store, { tenantId: null, search: "", userCacheId: "u1" });
    store.bump("posts", null);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "",
        ifNoneMatch: etag,
        tenantId: null,
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });

  it("4. misses when the query string changes", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "?limit=50",
        ifNoneMatch: etag,
        tenantId: "tenant_a",
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });

  it("5. misses when the user cache id changes", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "?limit=10",
        ifNoneMatch: etag,
        tenantId: "tenant_a",
        userCacheId: "u2",
        store,
      }),
    ).toBeNull();
  });

  it("6. misses when the tenant changes", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "?limit=10",
        ifNoneMatch: etag,
        tenantId: "tenant_b",
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });

  it("7. ignores strong content-hash ETags", () => {
    const store = memoryEpochStore(3);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "",
        ifNoneMatch: '"abcdef0123456789"',
        tenantId: null,
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });

  it("8. ignores If-None-Match: *", () => {
    const store = memoryEpochStore(3);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "",
        ifNoneMatch: "*",
        tenantId: null,
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });

  it("9. skips 304 when bypassCache/refresh/nocache is set", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store, { tenantId: null, search: "", userCacheId: "u1" });
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts",
        search: "",
        ifNoneMatch: etag,
        tenantId: null,
        userCacheId: "u1",
        store,
        bypass: true,
      }),
    ).toBeNull();
  });

  it("10. seeds epoch 1 on first read so static collections can revalidate", () => {
    const store = memoryEpochStore(0);
    expect(store.get("posts", null)).toBe(0);
    const etag = etagFor(store, { tenantId: null, search: "", userCacheId: "" });
    expect(parseCollectionWeakEtag(etag)?.epoch).toBe(1);
    expect(store.get("posts", null)).toBe(1);
  });

  it("11. never 304s list/search/export/non-collection paths", () => {
    const store = memoryEpochStore(0);
    const etag = etagFor(store);
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/list",
        search: "",
        ifNoneMatch: etag,
        tenantId: "tenant_a",
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
    expect(
      tryCollectionNotModified({
        pathname: "/api/collections/posts/export",
        search: "",
        ifNoneMatch: etag,
        tenantId: "tenant_a",
        userCacheId: "u1",
        store,
      }),
    ).toBeNull();
  });
});
