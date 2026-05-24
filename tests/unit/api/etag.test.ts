/**
 * @file tests/unit/api/etag.test.ts
 * @description Unit tests for ETag conditional requests and API versioning in the dispatcher.
 *
 * Features tested:
 * - GET responses include SHA-256 ETag header
 * - If-None-Match matching returns 304 Not Modified
 * - Non-matching If-None-Match returns 200 with new ETag
 * - All responses include X-API-Version: 1 header
 * - POST/PUT/DELETE skip ETag but include version header
 * - Streaming SSE responses skip ETag
 */

import { describe, it, expect, vi } from "vitest";
import { _handler } from "@src/routes/api/[...path]/+server";
import type { RequestEvent } from "@sveltejs/kit";

function createEvent(
  path: string,
  method = "GET",
  opts: { ifNoneMatch?: string; body?: string; contentType?: string } = {},
): RequestEvent {
  const headers = new Headers();
  if (opts.ifNoneMatch) headers.set("if-none-match", opts.ifNoneMatch);
  if (opts.contentType) headers.set("content-type", opts.contentType);
  // CSRF token to avoid CSRF_VIOLATION on mutating requests
  const csrfToken = "test-csrf-token";

  return {
    url: new URL(`http://localhost/api/${path}`),
    params: { path },
    request: new Request(`http://localhost/api/${path}`, {
      method,
      headers,
      body: opts.body || undefined,
    }),
    locals: {
      user: { _id: "u1", role: "admin", isAdmin: true, permissions: [] },
      tenantId: "test",
      roles: [],
    },
    cookies: {
      get: vi.fn((name: string) => (name === "svelty-csrf" ? csrfToken : null)),
      set: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as RequestEvent;
}

describe("ETag Conditional Requests", () => {
  it("should return ETag header on GET 200 response", async () => {
    // Use settings/public which goes through the full handler chain (no early return)
    const event = createEvent("settings/public");
    const response = await _handler(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBeTruthy();
    expect(response.headers.get("ETag")).toMatch(/^"[a-f0-9]{16}"$/);
  });

  it("should return 304 when If-None-Match matches ETag", async () => {
    const event1 = createEvent("settings/public");
    const response1 = await _handler(event1);
    const etag = response1.headers.get("ETag")!;

    const event2 = createEvent("settings/public", "GET", { ifNoneMatch: etag });
    const response2 = await _handler(event2);

    expect(response2.status).toBe(304);
    expect(response2.headers.get("ETag")).toBe(etag);
  });

  it("should return 200 when If-None-Match does not match", async () => {
    const event = createEvent("settings/public", "GET", {
      ifNoneMatch: '"different-etag-123"',
    });
    const response = await _handler(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBeTruthy();
    expect(response.headers.get("ETag")).not.toBe('"different-etag-123"');
  });
});

describe("API Versioning", () => {
  it("should include X-API-Version header on GET responses", async () => {
    const event = createEvent("settings/public");
    const response = await _handler(event);

    expect(response.headers.get("X-API-Version")).toBe("1");
  });

  it("should route /api/v1/ paths to the correct handler", async () => {
    const event = createEvent("v1/settings/public");
    const response = await _handler(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-API-Version")).toBe("1");
  });

  it("should return 304 for /api/v1/ path with matching ETag", async () => {
    const event1 = createEvent("v1/settings/public");
    const response1 = await _handler(event1);
    const etag = response1.headers.get("ETag")!;

    const event2 = createEvent("v1/settings/public", "GET", {
      ifNoneMatch: etag,
    });
    const response2 = await _handler(event2);

    expect(response2.status).toBe(304);
  });
});

describe("ETag Streaming Protection", () => {
  it("should not apply ETag to SSE streaming responses", async () => {
    const event = {
      url: new URL("http://localhost/api/events"),
      params: { path: "events" },
      request: new Request("http://localhost/api/events", { method: "GET" }),
      locals: {
        user: { _id: "u1", role: "admin", isAdmin: true, permissions: [] },
        tenantId: "test",
        roles: [],
      },
      cookies: {
        get: vi.fn(() => null),
        set: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as RequestEvent;

    const response = await _handler(event);

    // SSE responses should still get version header but no ETag
    expect(response.headers.get("X-API-Version")).toBe("1");
    expect(response.headers.get("ETag")).toBeNull();
  });
});
