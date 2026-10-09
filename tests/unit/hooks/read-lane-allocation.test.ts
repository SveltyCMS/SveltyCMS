/**
 * @file tests/unit/hooks/read-lane-allocation.test.ts
 * @description Behavior parity for the allocation trims on the cold point-read
 * path of `handle-collection-read-lane`:
 * - the direct-to-wire point stream serves byte-identical bodies and etags,
 * - `requirePublished` keeps the publication-policy clamp (admin vs editor),
 * - a definitive wire miss short-circuits without a Domain re-query,
 * - inadmissible params still divert to `findById`,
 * - the single-pass path splitter and the trimmed admission branches
 *   (`fields=` compaction, filter/where scan) classify identically.
 *
 * ### Features:
 * - Byte-identity of wire-served responses with the wire body
 * - No per-request allocation assertions (those are implementation details) —
 *   the contract is identical routing, headers, and bytes after the trims.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEvent } from "./test-utils";
import { setTurboAuthContext, clearTurboAuthCache } from "@src/hooks/handle-turbo-get";
import { responseCache, buildUserResponseCacheKey } from "@src/services/cache/response-cache";
import { contentStore } from "@src/stores/content-registry.svelte";
import { setSystemState } from "@src/stores/system/state.svelte.ts";
import { PERMISSION_BITS } from "@src/databases/auth/permission-bitmask";

const { findMock, findByIdMock, wireMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  findByIdMock: vi.fn(),
  wireMock: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { connected: true, crud: { findPointWireStream: wireMock } },
}));

vi.mock("@src/databases/tenant-adapter", () => ({
  applyAdapterTenantContext: () => undefined,
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    constructor() {
      /* adapter ignored */
    }
    collections = {
      find: findMock,
      findById: findByIdMock,
    };
  },
}));

import {
  tryCollectionReadLane,
  isSimpleCollectionRead,
  isWirePlaneAdmissible,
  computeCollectionWireMeta,
} from "@src/hooks/handle-collection-read-lane";

const postsSchema = {
  _id: "posts",
  name: "posts",
  fields: [
    { label: "Title", db_fieldName: "title", type: "string" },
    { label: "Slug", db_fieldName: "slug", type: "string" },
  ],
} as never;

describe("collection read lane — wire stream cold point reads", () => {
  const sessionId = "read-lane-wire-session";
  const user = {
    _id: "user-wire-1",
    id: "user-wire-1",
    role: "admin",
    isAdmin: true,
    email: "wire@test.local",
  };

  beforeEach(async () => {
    clearTurboAuthCache();
    await responseCache.clearLocal();
    findMock.mockReset();
    findByIdMock.mockReset();
    wireMock.mockReset();
    setSystemState("READY");
    contentStore.clear();
    contentStore.setCollections("global", [postsSchema]);
    setTurboAuthContext(sessionId, user as never, [], null, PERMISSION_BITS["collections:read"]);
  });

  function entryEvent(path = "/api/collections/posts/abc") {
    return createMockEvent(path, {
      method: "GET",
      sessionCookie: sessionId,
      user,
    });
  }

  it("serves the direct-to-wire body byte-identically on a cold point read", async () => {
    const wireBody = '{"success":true,"data":{"_id":"abc","title":"wire"}}';
    const wireEtag = '"abc-2026-01-01T00:00:00.000Z"';
    wireMock.mockResolvedValue({ success: true, data: { wireBody, etag: wireEtag } });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const res = await tryCollectionReadLane({ event: entryEvent(), resolve });

    expect(resolve).not.toHaveBeenCalled();
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(res.headers.get("etag")).toBe(wireEtag);
    expect(await res.text()).toBe(wireBody);
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(wireMock).toHaveBeenCalledWith(
      "posts",
      "abc",
      expect.objectContaining({ tenantId: null, requirePublished: false }),
    );

    // The point tier (skipSharedL1) admits on the second sighting — the same
    // contract as the Domain findById path — and then holds the same bytes.
    const second = await tryCollectionReadLane({ event: entryEvent(), resolve });
    expect(second.headers.get("X-Cache")).toBe("MISS");
    expect(await second.text()).toBe(wireBody);
    const key = buildUserResponseCacheKey("/api/collections/posts/abc", "", user._id);
    expect(responseCache.get(key, null)?.body).toBe(wireBody);
  });

  it("clamps requirePublished for non-privileged callers (publication-policy parity)", async () => {
    const editor = {
      _id: "editor-wire-1",
      id: "editor-wire-1",
      role: "editor",
      isAdmin: false,
      email: "ed@test.local",
    };
    setTurboAuthContext(sessionId, editor as never, [], null, PERMISSION_BITS["collections:read"]);
    wireMock.mockResolvedValue({
      success: true,
      data: { wireBody: '{"success":true,"data":{"_id":"abc"}}', etag: '"e"' },
    });
    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/posts/abc", {
      method: "GET",
      sessionCookie: sessionId,
      user: editor,
    });

    const res = await tryCollectionReadLane({ event, resolve });

    expect(await res.text()).toBe('{"success":true,"data":{"_id":"abc"}}');
    expect(wireMock).toHaveBeenCalledWith(
      "posts",
      "abc",
      expect.objectContaining({ requirePublished: true }),
    );
  });

  it("answers a definitive wire miss without re-querying the Domain Plane", async () => {
    wireMock.mockResolvedValue({
      success: false,
      error: { code: "RECORD_NOT_FOUND", message: "Entry not found" },
    });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const res = await tryCollectionReadLane({ event: entryEvent(), resolve });

    // Byte-identity with the Domain fallback envelope for a null row.
    expect(await res.text()).toBe('{"success":true,"data":null}');
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("diverts inadmissible params to the Domain findById", async () => {
    findByIdMock.mockResolvedValue({ success: true, data: { _id: "abc", title: "domain" } });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const res = await tryCollectionReadLane({
      event: entryEvent("/api/collections/posts/abc?populate=author"),
      resolve,
    });

    expect(wireMock).not.toHaveBeenCalled();
    expect(findByIdMock).toHaveBeenCalledWith(
      "posts",
      "abc",
      expect.objectContaining({ skipCacheService: true }),
    );
    expect(res.headers.get("X-Cache")).toBe("MISS");
  });
});

describe("single-pass path splitter parity", () => {
  function event(pathname: string, method = "GET") {
    return createMockEvent(pathname, { method });
  }

  it("classifies list, point, action, and trailing-slash paths identically", () => {
    expect(isSimpleCollectionRead(event("/api/collections/posts"))).toBe(true);
    expect(isSimpleCollectionRead(event("/api/collections/posts/"))).toBe(true);
    expect(isSimpleCollectionRead(event("/api/collections/posts/abc"))).toBe(true);
    expect(isSimpleCollectionRead(event("/api/collections/posts/export"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections/posts/abc/revisions"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections/posts/abc/extra"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections/"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections/posts", "POST"))).toBe(false);
    expect(isSimpleCollectionRead(event("/api/collections/posts", "HEAD"))).toBe(true);
  });
});

describe("admission parity for the trimmed branches", () => {
  const meta = computeCollectionWireMeta(postsSchema, "en")!;

  function event(query: string) {
    return createMockEvent(`/api/collections/posts/abc${query}`, { method: "GET" });
  }

  it("compacts fields= exactly like split/map/filter did", () => {
    const cols = Array.from(meta.publishedFields).join(",");

    expect(isWirePlaneAdmissible(event(`?fields=${cols}`), meta)).toBe(true);
    // Whitespace and empty segments (trailing comma + spaces) still match.
    expect(isWirePlaneAdmissible(event(`?fields= ${cols} , `), meta)).toBe(true);
    expect(isWirePlaneAdmissible(event(`?fields=_id`), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event(`?fields=${cols},bogus`), meta)).toBe(false);
  });

  it("rejects filter/where spellings and unknown params without Array.from", () => {
    expect(isWirePlaneAdmissible(event("?filter[title]=x"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event("?filter.title=x"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event("?filter=x"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event("?where=x"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event("?bogus=1"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(event(""), meta)).toBe(true);
  });
});
