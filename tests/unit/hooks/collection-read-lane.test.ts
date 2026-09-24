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

const { findMock, findByIdMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { connected: true },
}));

vi.mock("@src/databases/tenant-adapter", () => ({
  applyAdapterTenantContext: () => undefined,
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: {
    getLocals: () => ({
      collections: {
        find: findMock,
        findById: findByIdMock,
      },
    }),
  },
}));

import { tryCollectionReadLane } from "@src/hooks/handle-collection-read-lane";
import { setSystemState } from "@src/stores/system/state.svelte.ts";

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
