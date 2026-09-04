/**
 * @file tests/unit/api/collection-etag-304.test.ts
 * @description Unit tests for collection weak ETag / HTTP 304 Not Modified path.
 *
 * Features:
 * - tryCollectionNotModified returns 304 + X-Cache: COL-304 on a matching ETag
 * - tryCollectionNotModified returns null (miss) when epoch advances after a write
 * - collectionEtagMatches handles comma-separated If-None-Match lists
 * - export paths (/api/collections/{id}/export) are excluded from ETag negotiation
 */

import { describe, it, expect } from "vitest";
import {
  buildCollectionWeakEtag,
  parseCollectionWeakEtag,
  collectionEtagMatches,
  collectionReprHash,
  tryCollectionNotModified,
  getCollectionIdFromApiPath,
  type CollectionEpochStore,
} from "@src/services/cache/collection-etag";

// ---------------------------------------------------------------------------
// In-process epoch store — no DB, no Redis, process-local Map.
// This is the exact interface the production defaultEpochStore adapts.
// ---------------------------------------------------------------------------
function makeStore(initial: Record<string, number> = {}): CollectionEpochStore {
  const epochs = new Map<string, number>(Object.entries(initial));
  return {
    get: (collection) => epochs.get(collection) ?? 0,
    bump: (collection) => {
      const next = (epochs.get(collection) ?? 0) + 1;
      epochs.set(collection, next);
      return next;
    },
  };
}

// ---------------------------------------------------------------------------
// Helper params factory
// ---------------------------------------------------------------------------
function params(overrides: Partial<Parameters<typeof tryCollectionNotModified>[0]> = {}) {
  return {
    pathname: "/api/collections/posts",
    search: "",
    ifNoneMatch: null,
    tenantId: null,
    userCacheId: "user-abc",
    store: makeStore(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Collection weak ETag — parse / build round-trip", () => {
  it("round-trips a well-formed ETag", () => {
    const tag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 3,
      reprHash: "abcd1234",
    });
    expect(tag).toMatch(/^W\/"cv1\|/);
    const parsed = parseCollectionWeakEtag(tag);
    expect(parsed).toMatchObject({ tenantId: "g", collectionId: "posts", epoch: 3 });
  });

  it("returns null for non-collection ETags", () => {
    expect(parseCollectionWeakEtag('"random-cache-etag"')).toBeNull();
    expect(parseCollectionWeakEtag("")).toBeNull();
  });
});

describe("collectionEtagMatches — comma-separated If-None-Match", () => {
  const tag = buildCollectionWeakEtag({
    tenantId: "g",
    collectionId: "posts",
    epoch: 2,
    reprHash: "h1",
  });

  it("matches exact token", () => {
    expect(collectionEtagMatches(tag, tag)).toBe(true);
  });

  it("matches when the ETag appears in a comma-separated list", () => {
    const list = `"other-etag", ${tag}, "yet-another"`;
    expect(collectionEtagMatches(list, tag)).toBe(true);
  });

  it("does not match a stale token", () => {
    const stale = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 1,
      reprHash: "h1",
    });
    expect(collectionEtagMatches(stale, tag)).toBe(false);
  });
});

describe("tryCollectionNotModified — 304 / miss behaviour", () => {
  it("returns null when If-None-Match is absent", () => {
    expect(tryCollectionNotModified(params({ ifNoneMatch: null }))).toBeNull();
    expect(tryCollectionNotModified(params({ ifNoneMatch: "" }))).toBeNull();
  });

  it("returns null for non-collection ETags (plain response-cache ETags)", () => {
    expect(tryCollectionNotModified(params({ ifNoneMatch: '"abc123"' }))).toBeNull();
  });

  it("returns a 304 Response with X-Cache: COL-304 on ETag match", () => {
    const store = makeStore({ posts: 1 });
    // Build the exact ETag the server would have sent on the previous response.
    const etag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 1,
      reprHash: collectionReprHash("/api/collections/posts", "", "user-abc"),
    });

    const result = tryCollectionNotModified(params({ ifNoneMatch: etag, store }));

    expect(result).not.toBeNull();
    expect(result?.status).toBe(304);
    expect(result?.headers.get("X-Cache")).toBe("COL-304");
    expect(result?.headers.get("ETag")).toBe(etag);
  });

  it("returns null (miss) after epoch advances — client must re-fetch", () => {
    const store = makeStore({ posts: 1 });
    const staleEtag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 1,
      reprHash: collectionReprHash("/api/collections/posts", "", "user-abc"),
    });

    // Simulate a write — bump the epoch.
    store.bump("posts");

    const result = tryCollectionNotModified(params({ ifNoneMatch: staleEtag, store }));
    expect(result).toBeNull();
  });

  it("excludes /api/collections/{id}/export from ETag negotiation", () => {
    expect(getCollectionIdFromApiPath("/api/collections/posts/export")).toBeNull();
  });

  it("excludes bypass=true even with a matching ETag", () => {
    const store = makeStore({ posts: 1 });
    const etag = buildCollectionWeakEtag({
      tenantId: "g",
      collectionId: "posts",
      epoch: 1,
      reprHash: collectionReprHash("/api/collections/posts", "", "user-abc"),
    });
    const result = tryCollectionNotModified(params({ ifNoneMatch: etag, store, bypass: true }));
    expect(result).toBeNull();
  });
});
