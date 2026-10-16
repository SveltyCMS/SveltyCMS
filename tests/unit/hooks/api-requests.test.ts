/**
 * @file tests/unit/hooks/api-requests.test.ts
 * @description Tests for handleApiRequests middleware.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequests, serveCachedEntry } from "@src/hooks/handle-api-requests";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: { validateSession: vi.fn() },
    collection: { getModel: vi.fn() },
  },
  getDb: vi.fn().mockReturnValue({
    auth: { validateSession: vi.fn() },
    collection: { getModel: vi.fn() },
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clearByPattern: vi.fn(),
  },
  getSessionCacheTTL: vi.fn(() => 3600),
  getUserPermCacheTTL: vi.fn(() => 60),
  getApiCacheTTL: vi.fn(() => 300),
}));

const etagMocks = vi.hoisted(() => ({
  tryCollectionNotModified: vi.fn(),
}));

vi.mock("@src/services/cache/collection-etag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/services/cache/collection-etag")>();
  return {
    ...actual,
    tryCollectionNotModified: etagMocks.tryCollectionNotModified,
  };
});

import { cacheService } from "@src/databases/cache/cache-service";
import { createMockEvent } from "./test-utils";

beforeEach(() => {
  etagMocks.tryCollectionNotModified.mockReset().mockReturnValue(null);
  vi.mocked(cacheService.get).mockReset();
  vi.mocked(cacheService.set).mockReset();
  vi.mocked(cacheService.delete).mockReset();
  vi.mocked(cacheService.clearByPattern).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("API Requests Hook Unit Tests", () => {
  const createMockEvent = (path: string, method = "GET", user: any = null) => {
    return {
      url: new URL(`http://localhost${path}`),
      request: {
        method,
        headers: new Map(),
      },
      locals: { user },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should pass through non-api routes", async () => {
    const event = createMockEvent("/admin");
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handleApiRequests({ event, resolve } as any);
    expect(resolve).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toBe("ok");
  });

  it("passes through public API routes (health)", async () => {
    const event = createMockEvent("/api/system/health");
    const resolve = vi.fn().mockResolvedValue(new Response("healthy"));

    const response = await handleApiRequests({ event, resolve } as any);
    expect(resolve).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toBe("healthy");
  });

  it("passes through login API routes", async () => {
    const event = createMockEvent("/api/auth/login", "POST");
    const resolve = vi.fn().mockResolvedValue(new Response("logged in"));

    const response = await handleApiRequests({ event, resolve } as any);
    expect(resolve).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toBe("logged in");
  });

  it("passes through public setup routes", async () => {
    const event = createMockEvent("/api/setup", "POST");
    const resolve = vi.fn().mockResolvedValue(new Response("setup"));

    const response = await handleApiRequests({ event, resolve } as any);
    expect(resolve).toHaveBeenCalled();
    const text = await response.text();
    expect(text).toBe("setup");
  });
});

describe("serveCachedEntry content-length (compression size-gate contract)", () => {
  /**
   * 🚀 Regression guard: `handleCompression` size-gates on `content-length`.
   * The cached entry carries the ORIGINAL body's length, so the served response
   * must declare the length of the body it actually sends — dropping the header
   * instead (the previous behaviour) made every cache hit "unknown size", which
   * skips the <1 KiB skip-gate AND the buffered sync tier and lands the response
   * in the streaming tier: a fresh zlib/zstd transform per request.
   */
  const request = () => new Request("http://localhost/api/system/version");

  it("declares the byte length of the re-serialized body, not the cached value", async () => {
    const cached = {
      data: { success: true, data: { version: "1.0.0" } },
      headers: { "content-type": "application/json", "content-length": "99999" },
    };
    const res = serveCachedEntry(cached, request());
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(Buffer.byteLength(body, "utf8")));
    expect(res.headers.get("content-length")).not.toBe("99999");
  });

  it("keeps content-length out of the 304 branch (no body is sent)", () => {
    const res = serveCachedEntry(
      { headers: { etag: '"abc"' } },
      new Request("http://localhost/api/system/version", {
        headers: { "if-none-match": '"abc"' },
      }),
    );
    expect(res.status).toBe(304);
    expect(res.headers.get("content-length")).toBeNull();
  });
});

describe("serveCachedEntry conditional and compression branches", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api/x", { headers });

  it("matches a comma-separated if-none-match list for a 304", () => {
    const res = serveCachedEntry(
      { headers: { etag: '"abc"' } },
      req({ "if-none-match": '"def", "abc"' }),
    );
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"abc"');
  });

  it("reads an ETag header key case-insensitively", () => {
    const res = serveCachedEntry({ headers: { ETag: '"abc"' } }, req({ "if-none-match": '"abc"' }));
    expect(res.status).toBe(304);
  });

  it("serves a smaller pre-compressed variant", async () => {
    const cached = {
      body: "x".repeat(100),
      compressed: { gzip: "tiny" },
      headers: { "content-type": "application/json" },
    };
    const res = serveCachedEntry(cached, req({ "accept-encoding": "gzip" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("x-cache")).toBe("HIT");
    expect(res.headers.get("content-length")).toBeNull();
    expect(await res.text()).toBe("tiny");
  });

  it("refuses a compressed variant that is larger than the original", async () => {
    const cached = {
      body: "abcd",
      compressed: { gzip: "this-is-much-larger-than-four-bytes" },
      headers: { "content-type": "application/json" },
    };
    const res = serveCachedEntry(cached, req({ "accept-encoding": "gzip" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toBe("abcd");
  });

  it("uses the buffer length as the original size for negotiation", () => {
    const cached = {
      buffer: Buffer.alloc(100),
      compressed: { gzip: "tiny" },
      headers: { "content-type": "application/json" },
    };
    const res = serveCachedEntry(cached, req({ "accept-encoding": "gzip" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("x-original-size")).toBe("100");
  });

  it("omits content-length for a bodyless entry", () => {
    const res = serveCachedEntry(
      { data: undefined, headers: { "content-type": "application/json" } },
      req({}),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBeNull();
  });
});

describe("handleApiRequests middleware paths", () => {
  const admin = { _id: "u-admin", role: "admin", isAdmin: true };

  it("short-circuits when locals.__testBypass is set", async () => {
    const event = createMockEvent("/api/collections/Articles", { method: "GET", user: admin });
    (event.locals as unknown as Record<string, unknown>).__testBypass = true;
    const resolve = vi.fn().mockResolvedValue(new Response("bypassed"));
    const res = await handleApiRequests({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(await res.text()).toBe("bypassed");
  });

  it("returns 401 when no user is authenticated", async () => {
    const event = createMockEvent("/api/collections/Articles", { method: "GET" });
    const res = await handleApiRequests({ event, resolve: vi.fn() });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns 400 for an invalid api path", async () => {
    const event = createMockEvent("/api//", { method: "GET", user: admin });
    const res = await handleApiRequests({ event, resolve: vi.fn() });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_PATH" });
  });

  it("returns 403 when the role lacks endpoint permission", async () => {
    const event = createMockEvent("/api/collections/Articles", {
      method: "GET",
      user: { _id: "u-viewer", role: "viewer" },
    });
    const res = await handleApiRequests({ event, resolve: vi.fn() });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 401 for an anonymous user denied access", async () => {
    const event = createMockEvent("/api/collections/Articles", {
      method: "GET",
      user: { _id: "anon-1", role: "guest", isAnonymous: true },
    });
    const res = await handleApiRequests({ event, resolve: vi.fn() });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("serves a cached GET response without resolving", async () => {
    const event = createMockEvent("/api/collections/Articles", { method: "GET", user: admin });
    vi.mocked(cacheService.get).mockResolvedValue({
      data: { items: [] },
      body: '{"success":true,"data":{"items":[]}}',
      headers: { "content-type": "application/json" },
    } as never);
    const resolve = vi.fn();
    const res = await handleApiRequests({ event, resolve });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-cache")).toBe("HIT");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("falls through to resolve when the cache read fails", async () => {
    const event = createMockEvent("/api/collections/Articles", { method: "GET", user: admin });
    vi.mocked(cacheService.get).mockRejectedValue(new Error("redis down"));
    const resolve = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await handleApiRequests({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(res.status).toBe(200);
  });

  it("labels a graphql GET as a cache bypass", async () => {
    const event = createMockEvent("/api/graphql", { method: "GET", user: admin });
    const resolve = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await handleApiRequests({ event, resolve });
    expect(res.headers.get("x-cache")).toBe("BYPASS");
  });

  it("returns a collection-level 304 without resolving", async () => {
    const event = createMockEvent("/api/collections/Articles", { method: "GET", user: admin });
    etagMocks.tryCollectionNotModified.mockReturnValue(
      new Response(null, { status: 304, headers: { "x-cache": "COL-304" } }),
    );
    const resolve = vi.fn();
    const res = await handleApiRequests({ event, resolve });
    expect(res.status).toBe(304);
    expect(res.headers.get("x-cache")).toBe("COL-304");
    expect(resolve).not.toHaveBeenCalled();
  });
});
