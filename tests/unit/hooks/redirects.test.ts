/**
 * @file tests/unit/hooks/redirects.test.ts
 * @description
 * Whitebox coverage for the hardened redirect middleware. Exercises the full
 * resolution pipeline (fast-path skip, cache hit/miss, tenant-scoped materialized
 * view lookup, negative caching, stampede coalescing) plus the 404-recording
 * branches and the open-redirect guard.
 *
 * Features tested:
 * - Fast-path bypass for API / cms / static / internal routes
 * - Redirect hit from the MV, from a warm positive cache, and the miss/fallthrough
 * - Negative-cache short-circuit (no DB round-trip on a warm negative entry)
 * - DB lookup skipped while the system is booting or the DB is disconnected
 * - 404 recording for unmatched non-allowed roots, missing locale-prefixed
 *   collections, and downstream 404 responses
 * - Open-redirect guard blocks foreign origins; same-origin absolutes pass
 * - invalidateRedirectCache clears the per-tenant "redirect:" pattern
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRedirects, invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { createMockEvent, mockResolve } from "./test-utils";

/**
 * Hoisted control surface — `vi.mock` factories run before imports, so per-test
 * inputs and call recording live here instead of relying on mock `.mockReturn*`.
 */
const redirects = vi.hoisted(() => ({
  isStatic: false,
  systemReady: true,
  dbConnected: true,
  tenantFromHostname: null as string | null,
  findManyResult: { success: true, data: [] as any[] },
  cacheGetSyncResult: null as any,
  cacheGetResult: null as any,
  collectionExists: null as any,
  findManyCalls: [] as any[][],
  cacheSetCalls: [] as any[][],
  clearPatternCalls: [] as any[][],
}));

vi.mock("@src/databases/db", () => {
  const findMany = vi.fn(async (...args: any[]) => {
    redirects.findManyCalls.push(args);
    return redirects.findManyResult;
  });
  const adapter = { crud: { findMany } };
  return {
    getDb: vi.fn(() => adapter),
    isDbConnected: vi.fn(() => redirects.dbConnected),
  };
});

vi.mock("@src/stores/system/state.svelte.ts", () => ({
  isSystemReady: vi.fn(() => redirects.systemReady),
}));

vi.mock("@utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@utils/tenant", () => ({
  getTenantIdFromHostname: vi.fn(() => redirects.tenantFromHostname),
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getSync: vi.fn(() => redirects.cacheGetSyncResult),
    get: vi.fn(async () => redirects.cacheGetResult),
    set: vi.fn(async (...args: any[]) => {
      redirects.cacheSetCalls.push(args);
    }),
    clearByPattern: vi.fn(async (...args: any[]) => {
      redirects.clearPatternCalls.push(args);
    }),
  },
}));

vi.mock("@src/databases/cache/types", () => ({
  CacheCategory: { API: "api" },
}));

vi.mock("@utils/hook-utils", () => ({
  getRequestFlags: vi.fn(() => ({
    isStatic: redirects.isStatic,
    isApi: false,
    isBootstrap: false,
    isPublic: false,
    isTestMode: false,
  })),
}));

vi.mock("@src/paraglide/runtime", () => ({
  locales: ["en", "de"],
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    initialize: vi.fn(async () => {}),
    getCollection: vi.fn(() => redirects.collectionExists),
  },
}));

/** Internal timer key — cleared so `record404()`'s scheduleFlush never leaks. */
const TIMER_KEY = Symbol.for("svelty.redirects.timer");

describe("handleRedirects", () => {
  beforeEach(() => {
    mockResolve.mockClear();
    mockResolve.mockImplementation(async () => new Response("OK", { status: 200 }));

    redirects.isStatic = false;
    redirects.systemReady = true;
    redirects.dbConnected = true;
    redirects.tenantFromHostname = null;
    redirects.findManyResult = { success: true, data: [] };
    redirects.cacheGetSyncResult = null;
    redirects.cacheGetResult = null;
    redirects.collectionExists = null;
    redirects.findManyCalls = [];
    redirects.cacheSetCalls = [];
    redirects.clearPatternCalls = [];
  });

  afterEach(() => {
    const timer = (globalThis as any)[TIMER_KEY];
    if (timer) {
      clearTimeout(timer);
      (globalThis as any)[TIMER_KEY] = null;
    }
  });

  describe("fast-path bypass", () => {
    it("falls through for API routes without a cache or DB lookup", async () => {
      const event = createMockEvent("/api/collections/posts");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.findManyCalls).toHaveLength(0);
      expect(redirects.cacheSetCalls).toHaveLength(0);
    });

    it("falls through for dotted asset paths", async () => {
      const event = createMockEvent("/assets/app.js");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.findManyCalls).toHaveLength(0);
    });

    it("falls through when the request is flagged static", async () => {
      redirects.isStatic = true;
      const event = createMockEvent("/some-page");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.findManyCalls).toHaveLength(0);
      expect(redirects.cacheSetCalls).toHaveLength(0);
    });
  });

  describe("redirect resolution", () => {
    it("applies a materialized-view match and caches it positively", async () => {
      redirects.findManyResult = {
        success: true,
        data: [{ source: "/old-page", target: "/new-page", type: 301, active: true }],
      };

      const event = createMockEvent("/old-page");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("/new-page");
      expect(mockResolve).not.toHaveBeenCalled();
      expect(redirects.findManyCalls).toHaveLength(1);
      expect(redirects.cacheSetCalls).toHaveLength(1);
      expect(redirects.cacheSetCalls[0][0]).toBe("redirect:/old-page");
      expect(redirects.cacheSetCalls[0][1]).toMatchObject({ target: "/new-page" });
    });

    it("serves a warm positive cache entry without touching the DB", async () => {
      redirects.cacheGetSyncResult = { target: "/cached", type: 302 };
      redirects.findManyResult = {
        success: true,
        data: [{ target: "/should-not-be-read", type: 301 }],
      };

      const event = createMockEvent("/cached-page");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/cached");
      expect(mockResolve).not.toHaveBeenCalled();
      expect(redirects.findManyCalls).toHaveLength(0);
      expect(redirects.cacheSetCalls).toHaveLength(0);
    });

    it("defaults to a 301 when the redirect entry has no type", async () => {
      redirects.findManyResult = {
        success: true,
        data: [{ source: "/default-type", target: "/target" }],
      };

      const event = createMockEvent("/default-type");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("/target");
    });

    it("allows a same-origin absolute target", async () => {
      redirects.findManyResult = {
        success: true,
        data: [{ source: "/origin", target: "http://localhost/new-path", type: 301 }],
      };

      const event = createMockEvent("/origin", { protocol: "http:", hostname: "localhost" });
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("http://localhost/new-path");
    });

    it("blocks an open redirect to a foreign origin", async () => {
      redirects.findManyResult = {
        success: true,
        data: [{ source: "/legit", target: "https://evil.example.com/phish", type: 301 }],
      };

      const event = createMockEvent("/legit");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(404);
      expect(response.headers.get("X-Robots-Tag")).toBe("none");
    });

    it("falls through on a miss and caches a negative entry", async () => {
      const event = createMockEvent("/no-redirect");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.cacheSetCalls).toHaveLength(1);
      expect(redirects.cacheSetCalls[0][0]).toBe("redirect:/no-redirect");
      expect(redirects.cacheSetCalls[0][1]).toEqual({ isNegative: true });
    });

    it("skips the DB lookup on a warm negative cache entry", async () => {
      redirects.cacheGetSyncResult = { isNegative: true };
      redirects.findManyResult = {
        success: true,
        data: [{ target: "/should-not-be-read", type: 301 }],
      };

      const event = createMockEvent("/negative-cached");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.findManyCalls).toHaveLength(0);
      expect(redirects.cacheSetCalls).toHaveLength(0);
    });

    it("skips the DB lookup while the system is booting or the DB is disconnected", async () => {
      redirects.systemReady = false;
      redirects.dbConnected = false;

      const event = createMockEvent("/cold-boot");
      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
      expect(redirects.findManyCalls).toHaveLength(0);
      expect(redirects.cacheSetCalls).toHaveLength(0);
    });
  });

  describe("404 recording", () => {
    it("returns 404 for an unmatched non-allowed root without resolving", async () => {
      const event = createMockEvent("/totally-unknown");
      (event as any).route = null;

      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(404);
      expect(response.headers.get("X-Robots-Tag")).toBe("none");
      expect(await response.text()).toBe("Not Found");
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it("falls through for an allowed root when no route matched", async () => {
      const event = createMockEvent("/login");
      (event as any).route = null;

      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
    });

    it("returns 404 when a locale-prefixed collection path does not exist", async () => {
      redirects.collectionExists = null;
      const event = createMockEvent("/en/missing-collection");
      (event as any).route = null;

      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(404);
      expect(response.headers.get("X-Robots-Tag")).toBe("none");
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it("falls through when a locale-prefixed collection path exists", async () => {
      redirects.collectionExists = { _id: "posts" };
      const event = createMockEvent("/en/posts");
      (event as any).route = null;

      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(response.status).toBe(200);
    });

    it("passes through a downstream 404 response", async () => {
      mockResolve.mockResolvedValueOnce(new Response("gone", { status: 404 }));
      const event = createMockEvent("/missing-resource");

      const response = await handleRedirects({ event, resolve: mockResolve });

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("gone");
      expect(mockResolve).toHaveBeenCalledWith(event);
    });
  });
});

describe("invalidateRedirectCache", () => {
  it("clears the per-tenant redirect pattern", () => {
    invalidateRedirectCache("tenant-x");
    expect(redirects.clearPatternCalls).toHaveLength(1);
    expect(redirects.clearPatternCalls[0]).toEqual(["redirect:", "tenant-x"]);
  });
});
