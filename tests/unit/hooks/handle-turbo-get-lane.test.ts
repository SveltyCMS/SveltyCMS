/**
 * @file tests/unit/hooks/handle-turbo-get-lane.test.ts
 * @description
 * Unit coverage for Turbo GET short-circuit: warm turbo-auth + responseCache
 * must return TURBO-HIT without calling resolve(); misses fall through.
 *
 * Stabilizes the lane-router + response-cache stack that E2E and integration
 * rely on for authenticated API GET performance.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleTurboGet,
  setTurboAuthContext,
  clearTurboAuthCache,
} from "@src/hooks/handle-turbo-get";
import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { createMockEvent } from "./test-utils";

describe("handleTurboGet + response cache", () => {
  const sessionId = "turbo-session-unit-1";
  const user = {
    _id: "user-turbo-1",
    id: "user-turbo-1",
    role: "admin",
    isAdmin: true,
    email: "turbo@test.local",
  };

  beforeEach(async () => {
    clearTurboAuthCache();
    await responseCache.clearLocal();
  });

  it("falls through to resolve when no session cookie", async () => {
    const resolve = vi.fn(async () => new Response("downstream"));
    const event = createMockEvent("/api/collections/posts", { method: "GET" });
    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("downstream");
  });

  it("falls through when session present but turbo auth is cold", async () => {
    const resolve = vi.fn(async () => new Response("cold"));
    const event = createMockEvent("/api/collections/posts", {
      method: "GET",
      sessionCookie: sessionId,
    });
    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("cold");
  });

  it("serves TURBO-HIT when turbo auth + responseCache are warm", async () => {
    setTurboAuthContext(sessionId, user as any, [], new Uint32Array(0), null);

    const body = JSON.stringify({ success: true, data: [{ _id: "1" }] });
    const etag = generateContentEtag(body);
    const key = buildUserResponseCacheKey("/api/collections/posts", "", user._id);
    responseCache.set(key, { body, etag }, 60_000, null);

    const resolve = vi.fn(async () => new Response("should-not-run"));
    const event = createMockEvent("/api/collections/posts", {
      method: "GET",
      sessionCookie: sessionId,
      user: null,
    });

    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("TURBO-HIT");
    expect(res.headers.get("ETag")).toBe(etag);
    expect(await res.text()).toBe(body);
    // Turbo injects user into locals for downstream consistency if resolve were used
    expect((event.locals as any).user?._id).toBe(user._id);
    expect((event.locals as any).__turboAuth).toBe(true);
  });

  it("does not turbo-cache non-cacheable API prefixes", async () => {
    setTurboAuthContext(sessionId, user as any, [], new Uint32Array(0), null);
    const resolve = vi.fn(async () => new Response("auth-only"));
    const event = createMockEvent("/api/auth/login", {
      method: "GET",
      sessionCookie: sessionId,
    });
    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("auth-only");
  });

  it("skips turbo on POST mutations", async () => {
    setTurboAuthContext(sessionId, user as any, [], new Uint32Array(0), null);
    const resolve = vi.fn(async () => new Response("write"));
    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
    });
    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("write");
  });

  it("reads __Host- session cookie name (E2E/production parity)", async () => {
    setTurboAuthContext(sessionId, user as any, [], new Uint32Array(0), null);
    const body = JSON.stringify({ ok: true });
    const key = buildUserResponseCacheKey("/api/settings/public", "", user._id);
    responseCache.set(key, { body, etag: generateContentEtag(body) }, 60_000, null);

    const resolve = vi.fn(async () => new Response("miss"));
    const event = createMockEvent("/api/settings/public", {
      method: "GET",
      cookies: { [`__Host-${SESSION_COOKIE_NAME}`]: sessionId },
    });
    const res = await handleTurboGet({ event, resolve } as any);
    expect(resolve).not.toHaveBeenCalled();
    expect(res.headers.get("X-Cache")).toBe("TURBO-HIT");
  });
});
