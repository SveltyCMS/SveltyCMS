/**
 * @file tests/unit/hooks/collection-read-lane.test.ts
 * @description Single-flight miss refill for the warm collection read lane.
 *
 * After a write drops list turbo tags, 8 mixed/soak workers miss the same
 * list key. Without coalescing they each `find()` + `JSON.stringify`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEvent } from "./test-utils";
import { setTurboAuthContext, clearTurboAuthCache } from "@src/hooks/handle-turbo-get";
import { responseCache, buildUserResponseCacheKey } from "@src/services/cache/response-cache";
import type { DatabaseId } from "@src/content/types";

const { findMock, findByIdMock, findPointWireStreamMock, findListWireStreamMock } = vi.hoisted(
  () => ({
    findMock: vi.fn(),
    findByIdMock: vi.fn(),
    findPointWireStreamMock: vi.fn(),
    findListWireStreamMock: vi.fn(),
  }),
);

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    connected: true,
    crud: {
      findPointWireStream: findPointWireStreamMock,
      findListWireStream: findListWireStreamMock,
    },
  },
}));

vi.mock("@src/databases/tenant-adapter", () => ({
  applyAdapterTenantContext: () => undefined,
}));

vi.mock("@src/services/sdk", () => ({
  // The lane now holds one cached `LocalCMS` instance per process instead of
  // building a per-request `getLocals` bridge, so the mock provides the same
  // constructor shape with the two namespace methods the lane consumes.
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
  isWirePlaneAdmissible,
  computeCollectionWireMeta,
} from "@src/hooks/handle-collection-read-lane";
import { setSystemState } from "@src/stores/system/state.svelte.ts";
import { contentStore } from "@src/stores/content-registry.svelte";
import { PERMISSION_BITS } from "@src/databases/auth/permission-bitmask";

describe("collection read lane single-flight", () => {
  const sessionId = "read-lane-coalesce-session";
  const user = {
    _id: "user-read-lane-1",
    id: "user-read-lane-1",
    role: "admin",
    isAdmin: true,
    email: "lane@test.local",
  };

  beforeEach(async () => {
    clearTurboAuthCache();
    await responseCache.clearLocal();
    findMock.mockReset();
    findByIdMock.mockReset();
    findPointWireStreamMock.mockReset();
    findListWireStreamMock.mockReset();
    setTurboAuthContext(sessionId, user as never, [], null);
    // The lane re-applies the `handle-system-state` readiness decision itself
    // (`lane-state-gate`), so every test here must run in an operational state.
    // The non-operational side of that gate is covered in fast-lane-policy.test.ts.
    setSystemState("READY");
  });

  function listEvent() {
    return createMockEvent("/api/collections/BenchmarkStable?limit=100", {
      method: "GET",
      sessionCookie: sessionId,
      user,
    });
  }

  it("coalesces concurrent list misses into one find + stringify", async () => {
    let releaseFind: ((value: unknown) => void) | undefined;
    findMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFind = resolve;
        }),
    );

    const resolve = vi.fn(async () => new Response("pipeline"));
    const pending = Array.from({ length: 8 }, () =>
      tryCollectionReadLane({ event: listEvent(), resolve }),
    );

    await vi.waitFor(() => {
      expect(findMock).toHaveBeenCalledTimes(1);
    });

    releaseFind!({
      success: true,
      data: [{ _id: "1", title: "coalesced" }],
    });

    const results = await Promise.all(pending);
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
    // Exactly one rebuild (the leader); the 7 coalesced waiters are served the
    // shared body and are labelled as hits. Every response carries a header.
    const cacheHeaders = results.map((res) => res.headers.get("X-Cache"));
    expect(cacheHeaders.filter((h) => h === "MISS")).toHaveLength(1);
    expect(cacheHeaders.filter((h) => h === "TURBO-HIT")).toHaveLength(7);
    const bodies = await Promise.all(results.map((res) => res.text()));
    for (const body of bodies) {
      expect(body).toContain("coalesced");
    }
  });

  it("does not coalesce distinct list query strings", async () => {
    findMock.mockResolvedValue({ success: true, data: [] });
    const resolve = vi.fn(async () => new Response("pipeline"));

    await Promise.all([
      tryCollectionReadLane({
        event: createMockEvent("/api/collections/BenchmarkStable?limit=10", {
          method: "GET",
          sessionCookie: sessionId,
          user,
        }),
        resolve,
      }),
      tryCollectionReadLane({
        event: createMockEvent("/api/collections/BenchmarkStable?limit=100", {
          method: "GET",
          sessionCookie: sessionId,
          user,
        }),
        resolve,
      }),
    ]);

    expect(findMock).toHaveBeenCalledTimes(2);
  });

  it("serves L1 on the next list GET after the leader fills turbo", async () => {
    findMock.mockResolvedValue({
      success: true,
      data: [{ _id: "1", title: "cached" }],
    });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const first = await tryCollectionReadLane({ event: listEvent(), resolve });
    expect(first.headers.get("etag")).toBeTruthy();
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(findMock).toHaveBeenCalledTimes(1);

    const key = buildUserResponseCacheKey(
      "/api/collections/BenchmarkStable",
      "?limit=100",
      user._id,
    );
    expect(responseCache.get(key, null)?.body).toContain("cached");

    const second = await tryCollectionReadLane({ event: listEvent(), resolve });
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(second.headers.get("X-Cache")).toBe("TURBO-HIT");
    expect(await second.text()).toContain("cached");
  });

  it("serves stale list bytes after a write without starting find()", async () => {
    findMock.mockResolvedValue({
      success: true,
      data: [{ _id: "1", title: "cached" }],
    });
    const resolve = vi.fn(async () => new Response("pipeline"));
    await tryCollectionReadLane({ event: listEvent(), resolve });
    expect(findMock).toHaveBeenCalledTimes(1);

    const key = buildUserResponseCacheKey(
      "/api/collections/BenchmarkStable",
      "?limit=100",
      user._id,
    );

    responseCache.invalidateLocal("BenchmarkStable", null, { entryIds: ["1"] });
    expect(responseCache.get(key, null)?.stale).toBe(true);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => tryCollectionReadLane({ event: listEvent(), resolve })),
    );
    const bodies = await Promise.all(results.map((res) => res.text()));
    for (const body of bodies) {
      expect(body).toContain("cached");
    }
    for (const res of results) {
      expect(res.headers.get("X-Cache")).toBe("TURBO-HIT");
    }
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(responseCache.get(key, null)?.stale).toBe(true);
  });

  it("streams list directly to wire when admissible and bypasses cms.collections.find", async () => {
    contentStore.setCollections("global", [
      {
        _id: "BenchmarkStable",
        name: "BenchmarkStable",
        label: "BenchmarkStable",
        fields: [{ label: "Title", db_fieldName: "title" }],
      } as never,
    ]);

    findListWireStreamMock.mockResolvedValue({
      success: true,
      data: {
        wireBody: '[{"_id":"w1","title":"wire-item"}]',
        etag: '"list-100-50-0"',
      },
    });

    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/BenchmarkStable?limit=50", {
      method: "GET",
      sessionCookie: sessionId,
      user,
    });

    const res = await tryCollectionReadLane({ event, resolve });
    expect(res.headers.get("X-Cache")).toBe("MISS");
    const body = await res.text();
    expect(body).toContain('"wire-item"');
    expect(body).toContain('"meta":{"_collection":{"id":"BenchmarkStable"');
    expect(findListWireStreamMock).toHaveBeenCalledTimes(1);
    expect(findMock).not.toHaveBeenCalled();
    contentStore.clear();
  });

  it("labels a point-read rebuild as MISS, admits on the repeat, then serves TURBO-HIT", async () => {
    findByIdMock.mockResolvedValue({ success: true, data: { _id: "abc", title: "point" } });
    const resolve = vi.fn(async () => new Response("pipeline"));
    const entryEvent = () =>
      createMockEvent("/api/collections/BenchmarkStable/abc", {
        method: "GET",
        sessionCookie: sessionId,
        user,
      });

    // Random point-reads never repeat a URL, so this rebuild path is what the
    // mixed-cycle diagnostic sees — it must still label itself.
    const first = await tryCollectionReadLane({ event: entryEvent(), resolve });
    expect(first.headers.get("X-Cache")).toBe("MISS");

    // Second sighting of the id: still a rebuild (nothing was cached on the first touch —
    // the point tier admits on the second, so a cold random scan costs no cache
    // bookkeeping) and the entry is admitted here.
    const second = await tryCollectionReadLane({ event: entryEvent(), resolve });
    expect(second.headers.get("X-Cache")).toBe("MISS");

    const third = await tryCollectionReadLane({ event: entryEvent(), resolve });
    expect(third.headers.get("X-Cache")).toBe("TURBO-HIT");
    expect(findByIdMock).toHaveBeenCalledTimes(2);
    // The lane caches the HTTP response itself, so it must tell the namespace to
    // skip its own L2 entry (prefix map + doc tag index for every random id).
    expect(findByIdMock).toHaveBeenCalledWith(
      "BenchmarkStable",
      "abc",
      expect.objectContaining({ skipCacheService: true }),
    );
  });

  it("trims the point-read payload through the shared helper (byte-identity contract)", async () => {
    findByIdMock.mockResolvedValue({
      success: true,
      data: {
        _id: "abc",
        status: "published",
        tenantId: "global",
        isDeleted: false,
        createdAt: "2026-09-24T08:00:00.000Z",
        updatedAt: "2026-09-24T09:00:00.000Z",
        collection: null,
        locale: null,
        publishedAt: "2026-01-01T00:00:00.000Z",
        slug: "point-slug",
        title: "point",
        _collection: { id: "BenchmarkStable", name: "BenchmarkStable", label: "BenchmarkStable" },
      },
    });
    const resolve = vi.fn(async () => new Response("pipeline"));
    const entryEvent = () =>
      createMockEvent("/api/collections/BenchmarkStable/abc", {
        method: "GET",
        sessionCookie: sessionId,
        user,
      });

    const res = await tryCollectionReadLane({ event: entryEvent(), resolve });
    const body = await res.text();
    const payload = JSON.parse(body) as { data: Record<string, unknown> };

    // System columns + SDK meta are gone from the HTTP representation.
    expect(payload.data._collection).toBeUndefined();
    expect(payload.data.tenantId).toBeUndefined();
    expect(payload.data.isDeleted).toBeUndefined();
    expect(payload.data.createdAt).toBeUndefined();
    expect(payload.data.updatedAt).toBeUndefined();
    expect(payload.data.collection).toBeUndefined(); // null mirror column
    expect(payload.data.locale).toBeUndefined(); // null mirror column
    // Document content survives — including non-null mirror columns.
    expect(payload.data._id).toBe("abc");
    expect(payload.data.status).toBe("published");
    expect(payload.data.slug).toBe("point-slug");
    expect(payload.data.title).toBe("point");
    expect(payload.data.publishedAt).toBe("2026-01-01T00:00:00.000Z");
    // The point etag still reads _id + updatedAt off the RAW row (trimmed out
    // of the body, but the validator must survive).
    expect(res.headers.get("etag")).toBe('"abc-2026-09-24T09:00:00.000Z"');

    // The L1 point tier holds the trimmed bytes — a TURBO-HIT serves the same
    // payload as the MISS rebuild. The 2-touch admission admits on the second
    // sighting (see `pointAdmission` in response-cache), so read once more.
    const second = await tryCollectionReadLane({ event: entryEvent(), resolve });
    expect(second.headers.get("X-Cache")).toBe("MISS");
    const key = buildUserResponseCacheKey("/api/collections/BenchmarkStable/abc", "", user._id);
    expect(responseCache.get(key, null)?.body).toBe(await second.text());
  });

  it("leaves list rows untrimmed — the trim is point-read only", async () => {
    findMock.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "1",
          title: "cached",
          _collection: { id: "BenchmarkStable", name: "BenchmarkStable", label: "BenchmarkStable" },
        },
      ],
    });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const res = await tryCollectionReadLane({ event: listEvent(), resolve });
    const body = await res.text();
    expect(body).toContain("_collection");
    expect(body).toContain("BenchmarkStable");
  });

  it("scopes the L1 entry to the per-request tenant, not the session tenant", async () => {
    vi.stubEnv("TEST_MODE", "true");
    // Session was resolved for tenant A; the request explicitly targets tenant B.
    setTurboAuthContext(sessionId, user as never, [], "tenant-a" as DatabaseId);
    findMock.mockResolvedValue({ success: true, data: [{ _id: "1", title: "scoped" }] });
    const resolve = vi.fn(async () => new Response("pipeline"));

    const event = createMockEvent("/api/collections/BenchmarkStable?limit=100", {
      method: "GET",
      sessionCookie: sessionId,
      user,
      headers: { "x-test-tenant-id": "tenant-b" },
    });

    await tryCollectionReadLane({ event, resolve });

    const key = buildUserResponseCacheKey(
      "/api/collections/BenchmarkStable",
      "?limit=100",
      user._id,
    );
    expect(responseCache.get(key, "tenant-b")?.body).toContain("scoped");
    expect(responseCache.get(key, "tenant-a")).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("isWirePlaneAdmissible (Strict Admission Predicate)", () => {
  const dummySchema = {
    _id: "posts",
    name: "posts",
    fields: [
      { db_fieldName: "title", type: "string" },
      { db_fieldName: "slug", type: "string" },
      { db_fieldName: "secretNotes", type: "string", permissions: { visibility: "private" } },
    ],
    translations: [{ languageTag: "en", isDefault: true, translationName: "English" }],
  } as any;

  it("fails closed when collectionMeta is omitted or null", () => {
    const event = createMockEvent("/api/collections/posts/post-1", { method: "GET" });
    expect(isWirePlaneAdmissible(event, null)).toBe(false);
    expect(isWirePlaneAdmissible(event, undefined)).toBe(false);
  });

  it("computes collection wire meta correctly from schema", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en");
    expect(meta).not.toBeNull();
    expect(meta?.collectionId).toBe("posts");
    expect(meta?.defaultLocale).toBe("en");
    expect(meta?.hasAfterReadHooks).toBe(false);
    // Should include system fields + public fields, but exclude private field secretNotes
    expect(meta?.publishedFields.has("_id")).toBe(true);
    expect(meta?.publishedFields.has("title")).toBe(true);
    expect(meta?.publishedFields.has("slug")).toBe(true);
    expect(meta?.publishedFields.has("secretNotes")).toBe(false);

    // If schema has afterRead hook:
    const hookedSchema = { ...dummySchema, hooks: { afterRead: vi.fn() } };
    const hookedMeta = computeCollectionWireMeta(hookedSchema, "en");
    expect(hookedMeta?.hasAfterReadHooks).toBe(true);
  });

  it("admits valid public point-read without drafts or expansions", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en");
    const event = createMockEvent("/api/collections/posts/post-1", { method: "GET" });
    expect(isWirePlaneAdmissible(event, meta)).toBe(true);
  });

  it("rejects draft or preview query parameters and cookies", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en");

    // draft query param
    const draftEvent = createMockEvent("/api/collections/posts/post-1?draft=true", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(draftEvent, meta)).toBe(false);

    // status=draft
    const statusDraftEvent = createMockEvent("/api/collections/posts/post-1?status=draft", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(statusDraftEvent, meta)).toBe(false);

    // status=review
    const statusReviewEvent = createMockEvent("/api/collections/posts/post-1?status=review", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(statusReviewEvent, meta)).toBe(false);

    // preview query param
    const previewEvent = createMockEvent("/api/collections/posts/post-1?preview=true", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(previewEvent, meta)).toBe(false);

    // preview cookie
    const cookieEvent = createMockEvent("/api/collections/posts/post-1", {
      method: "GET",
      cookies: { preview_mode: "true" } as any,
    });
    expect(isWirePlaneAdmissible(cookieEvent, meta)).toBe(false);
  });

  it("rejects relational populate and mutating hooks", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en");
    const populateEvent = createMockEvent("/api/collections/posts/post-1?populate=author", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(populateEvent, meta)).toBe(false);

    const mutatingMeta = { ...meta!, hasAfterReadHooks: true };
    const standardEvent = createMockEvent("/api/collections/posts/post-1", { method: "GET" });
    expect(isWirePlaneAdmissible(standardEvent, mutatingMeta)).toBe(false);
  });

  it("handles locale parameter alignment correctly", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en");

    // No locale param -> admissible
    const noLocaleEvent = createMockEvent("/api/collections/posts/post-1", { method: "GET" });
    expect(isWirePlaneAdmissible(noLocaleEvent, meta)).toBe(true);

    // Locale matching collection default ("en") -> admissible
    const matchLocaleEvent = createMockEvent("/api/collections/posts/post-1?locale=en", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(matchLocaleEvent, meta)).toBe(true);

    // Locale differing from default ("de") -> rejected to Domain plane
    const mismatchLocaleEvent = createMockEvent("/api/collections/posts/post-1?locale=de", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(mismatchLocaleEvent, meta)).toBe(false);
  });

  it("admits fields param only if it equals the compiled published projection", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en")!;
    const publishedCols = Array.from(meta.publishedFields).join(",");

    // Exact match -> admissible
    const exactFieldsEvent = createMockEvent(
      `/api/collections/posts/post-1?fields=${publishedCols}`,
      {
        method: "GET",
      },
    );
    expect(isWirePlaneAdmissible(exactFieldsEvent, meta)).toBe(true);

    // Partial subset -> rejected to Domain plane
    const subsetFieldsEvent = createMockEvent("/api/collections/posts/post-1?fields=_id,title", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(subsetFieldsEvent, meta)).toBe(false);

    // Extraneous field -> rejected to Domain plane
    const extraFieldsEvent = createMockEvent(
      `/api/collections/posts/post-1?fields=${publishedCols},bogus`,
      {
        method: "GET",
      },
    );
    expect(isWirePlaneAdmissible(extraFieldsEvent, meta)).toBe(false);
  });

  it("enforces list-wire predicate constraints (compiled default limit, no custom filter)", () => {
    const meta = computeCollectionWireMeta(dummySchema, "en")!;

    // Standard list, no params -> admissible
    const defaultListEvent = createMockEvent("/api/collections/posts", { method: "GET" });
    expect(isWirePlaneAdmissible(defaultListEvent, meta)).toBe(true);

    // Custom filter -> rejected (list wire does not yet support dynamic filter compilation)
    const filteredListEvent = createMockEvent("/api/collections/posts?filter[title]=test", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(filteredListEvent, meta)).toBe(false);

    // Any sort -> rejected while no compiled default order exists (fail closed)
    const sortedListEvent = createMockEvent("/api/collections/posts?sort=title:asc", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(sortedListEvent, meta)).toBe(false);
    const defaultOrderListEvent = createMockEvent("/api/collections/posts?sort=createdAt:desc", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(defaultOrderListEvent, meta)).toBe(false);

    // Valid limits up to MAX_PAGE_SIZE are admissible; invalid ones fail closed
    const limitListEvent = createMockEvent("/api/collections/posts?limit=50", { method: "GET" });
    expect(isWirePlaneAdmissible(limitListEvent, meta)).toBe(true);
    const otherLimitEvent = createMockEvent("/api/collections/posts?limit=25", { method: "GET" });
    expect(isWirePlaneAdmissible(otherLimitEvent, meta)).toBe(true);
    const invalidLimitEvent = createMockEvent("/api/collections/posts?limit=0", { method: "GET" });
    expect(isWirePlaneAdmissible(invalidLimitEvent, meta)).toBe(false);

    // Keyset/cursor are not served by a compiled statement yet -> fail closed
    const keysetListEvent = createMockEvent("/api/collections/posts?keyset=true", {
      method: "GET",
    });
    expect(isWirePlaneAdmissible(keysetListEvent, meta)).toBe(false);
    const cursorListEvent = createMockEvent("/api/collections/posts?cursor=abc", { method: "GET" });
    expect(isWirePlaneAdmissible(cursorListEvent, meta)).toBe(false);

    // Pagination page > 1 -> rejected
    const pageListEvent = createMockEvent("/api/collections/posts?page=2", { method: "GET" });
    expect(isWirePlaneAdmissible(pageListEvent, meta)).toBe(false);
  });

  it("accepts both spellings of a compiled default sort and rejects every other order", () => {
    const meta = {
      ...computeCollectionWireMeta(dummySchema, "en")!,
      defaultSort: "createdAt:desc",
    };
    const sort = (value: string) =>
      createMockEvent(`/api/collections/posts?sort=${value}`, { method: "GET" });

    expect(isWirePlaneAdmissible(sort("createdAt:desc"), meta)).toBe(true);
    expect(isWirePlaneAdmissible(sort("-createdAt"), meta)).toBe(true);
    expect(isWirePlaneAdmissible(sort("title:asc"), meta)).toBe(false);
    expect(isWirePlaneAdmissible(sort("+createdAt"), meta)).toBe(false);
  });
});

describe("collection read lane private-field gate", () => {
  const sessionId = "read-lane-private-session";
  const editor = {
    _id: "editor-private-1",
    id: "editor-private-1",
    role: "editor",
    isAdmin: false,
    email: "editor@test.local",
  };

  beforeEach(async () => {
    clearTurboAuthCache();
    await responseCache.clearLocal();
    findByIdMock.mockReset();
    setSystemState("READY");
    contentStore.clear();
    contentStore.setCollections("global", [
      {
        _id: "posts",
        name: "posts",
        fields: [
          { label: "Title", db_fieldName: "title" },
          {
            label: "Secret",
            db_fieldName: "secretNotes",
            permissions: { visibility: "private", readRoles: [], writeRoles: [] },
          },
        ],
      } as never,
    ]);
    setTurboAuthContext(sessionId, editor as never, [], null, PERMISSION_BITS["collections:read"]);
  });

  it("does not serve a private field from the lane to a non-admin", async () => {
    findByIdMock.mockResolvedValue({
      success: true,
      data: { _id: "post-1", title: "Hello", secretNotes: "payroll" },
    });
    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/posts/post-1", {
      method: "GET",
      sessionCookie: sessionId,
      user: editor,
    });

    const res = await tryCollectionReadLane({ event, resolve });

    expect(await res.text()).toBe("pipeline");
    expect(resolve).toHaveBeenCalledOnce();
    expect(findByIdMock).not.toHaveBeenCalled();
    contentStore.clear();
  });
});

describe("collection read lane threat scan", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    setSystemState("READY");
  });

  it("rejects a SQL payload before any cache or database read", async () => {
    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/posts/post-1?q=union%20select%201", {
      method: "GET",
    });

    const res = await tryCollectionReadLane({ event, resolve });

    expect(res.status).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("returns an empty response to a non-local scanner user-agent", async () => {
    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/posts/post-1", {
      method: "GET",
      hostname: "cms.example",
      userAgent: "sqlmap/1.7",
    });

    const res = await tryCollectionReadLane({ event, resolve });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("0");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(await res.text()).toBe("");
    expect(resolve).not.toHaveBeenCalled();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("does not treat a scanner user-agent on localhost as a bot", async () => {
    const resolve = vi.fn(async () => new Response("pipeline"));
    const event = createMockEvent("/api/collections/posts/post-1", {
      method: "GET",
      hostname: "localhost",
      userAgent: "sqlmap/1.7",
    });

    const res = await tryCollectionReadLane({ event, resolve });

    expect(await res.text()).toBe("pipeline");
    expect(resolve).toHaveBeenCalledOnce();
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
