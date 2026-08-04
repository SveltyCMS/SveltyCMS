/**
 * @file tests/unit/hooks/authentication.test.ts
 * @description Comprehensive tests for handleAuthentication middleware (session management, rotation, caching)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import type { RequestEvent } from "@sveltejs/kit";

// Mock @src/databases/db — getDb() must return same reference as dbAdapter
vi.mock("@src/databases/db", () => {
  const mockAdapter = {
    auth: {
      getSessionTokenData: vi.fn(),
      getUserById: vi.fn(),
    },
  };
  return {
    dbAdapter: mockAdapter,
    auth: { validateSession: vi.fn(), getUserById: vi.fn() },
    getDbInitPromise: vi.fn(() => Promise.resolve()),
    getDb: vi.fn(() => mockAdapter),
  };
});

const mockPrivateSettings = new Map<string, unknown>();

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => mockPrivateSettings.get(key)),
  getPublicSettingSync: vi.fn(() => undefined),
}));

vi.mock("$app/environment", () => ({ dev: true, browser: false }));
vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn(),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
}));

// Match sibling hook suites: keep the session-cache LRU usable for full-TTL
// tests (the global unit setup lowers SESSION_CACHE_TTL_MS to 1h).
vi.mock("@src/databases/cache/cache-service", () => ({
  SESSION_CACHE_TTL_MS: 86400000,
  cacheService: {
    get: vi.fn().mockResolvedValue(null),
    getSync: vi.fn().mockReturnValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    isNegativeHit: vi.fn().mockReturnValue(false),
    recordMiss: vi.fn(),
    invalidateAll: vi.fn(),
  },
}));

const { handleAuthentication, clearAllSessionCaches } =
  await import("@src/hooks/handle-authentication");
const { dbAdapter } = await import("@src/databases/db");

const futureExpiry = new Date(Date.now() + 86400000).toISOString();

function createMockEvent(
  pathname: string,
  sessionCookie?: string,
  hostname = "localhost",
): RequestEvent {
  const url = new URL(pathname, `http://${hostname}`);
  return {
    url,
    request: new Request(url.toString()),
    cookies: {
      get: vi.fn((name: string) => (name === SESSION_COOKIE_NAME ? sessionCookie : null)),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { user: null, tenantId: null } as any,
    route: { id: pathname },
    params: {},
    getClientAddress: () => "127.0.0.1",
  } as unknown as RequestEvent;
}

function setupSessionMock(userData: Record<string, unknown>) {
  (dbAdapter as any).auth = {
    getSessionTokenData: vi.fn().mockResolvedValue({
      success: true,
      data: { user_id: userData._id, expiresAt: futureExpiry },
    }),
    getUserById: vi.fn().mockResolvedValue({ success: true, data: userData }),
  };
}

function setupInvalidSession() {
  (dbAdapter as any).auth = {
    // success:true + data:null = session row definitively does not exist
    getSessionTokenData: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
}

function setupTransientSession() {
  (dbAdapter as any).auth = {
    // success:false = lookup failed (DB error) — transient, cookie must be kept
    getSessionTokenData: vi.fn().mockResolvedValue({ success: false }),
  };
}

describe("handleAuthentication Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches();
  });

  describe("Public Route Bypass", () => {
    it("should skip authentication for /login", async () => {
      const event = createMockEvent("/login");
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.locals.user).toBeNull();
      expect(resolve).toHaveBeenCalled();
    });

    it("should skip authentication for /api/system/health", async () => {
      const event = createMockEvent("/api/system/health");
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.locals.user).toBeNull();
      expect(resolve).toHaveBeenCalled();
    });
  });

  describe("Session Validation", () => {
    it("should validate session cookie when present", async () => {
      const event = createMockEvent("/dashboard", "valid-session");
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(resolve).toHaveBeenCalled();
    });

    it("should delete invalid session cookie when auth is ready", async () => {
      const event = createMockEvent("/dashboard", "invalid");
      setupInvalidSession();
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.cookies.delete).toHaveBeenCalled();
    });

    it("keeps the session cookie on transient validation failure (DB error)", async () => {
      const event = createMockEvent("/dashboard", "flaky");
      setupTransientSession();
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.cookies.delete).not.toHaveBeenCalled();
      expect(event.locals.user).toBeNull();
    });

    it("revokes a cached session when the user becomes blocked", async () => {
      const userData = {
        _id: "user1",
        email: "test@test.com",
        role: "admin",
        tenantId: "t1",
        blocked: false,
      };
      setupSessionMock(userData);
      const event1 = createMockEvent("/dashboard", "valid-session");
      await handleAuthentication({
        event: event1,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });
      expect(event1.locals.user).not.toBeNull();

      // User gets blocked and the admin action purges the session caches
      // (batchAction → invalidateSessionCache). The next request re-validates
      // against the DB, where the blocked check cuts the session off.
      clearAllSessionCaches();
      (dbAdapter as any).auth.getUserById = vi
        .fn()
        .mockResolvedValue({ success: true, data: { ...userData, blocked: true } });
      const event2 = createMockEvent("/dashboard", "valid-session");
      await handleAuthentication({
        event: event2,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });
      expect(event2.locals.user).toBeNull();
      expect(event2.cookies.delete).toHaveBeenCalled();
    });

    it("coalesces concurrent cold session validations (single-flight)", async () => {
      // Gate the DB lookup so both requests are in flight before it resolves
      let resolveDb: ((v: unknown) => void) | undefined;
      const gate = new Promise<unknown>((r) => (resolveDb = r));
      (dbAdapter as any).auth = {
        getSessionTokenData: vi.fn(() => gate),
        getUserById: vi.fn().mockResolvedValue({
          success: true,
          data: { _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" },
        }),
      };

      const eventA = createMockEvent("/dashboard", "cold-session");
      const eventB = createMockEvent("/dashboard", "cold-session");
      const promiseA = handleAuthentication({
        event: eventA,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });
      const promiseB = handleAuthentication({
        event: eventB,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });

      resolveDb!({ success: true, data: { user_id: "user1", expiresAt: futureExpiry } });
      await Promise.all([promiseA, promiseB]);

      // One DB lookup served both concurrent requests — no deny-and-logout race
      expect((dbAdapter as any).auth.getSessionTokenData).toHaveBeenCalledTimes(1);
      expect(eventA.locals.user).not.toBeNull();
      expect(eventB.locals.user).not.toBeNull();
      expect(eventB.cookies.delete).not.toHaveBeenCalled();
    });

    it("idle timeout signs out a warm session after SESSION_IDLE_HOURS without activity", async () => {
      mockPrivateSettings.set("SESSION_IDLE_HOURS", 12);
      setupSessionMock({
        _id: "user1",
        email: "test@test.com",
        role: "admin",
        tenantId: "t1",
        blocked: false,
      });
      const event1 = createMockEvent("/dashboard", "idle-session");
      await handleAuthentication({
        event: event1,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });
      expect(event1.locals.user).not.toBeNull();

      vi.useFakeTimers();
      try {
        // 13h idle > 12h window (still within the 24h session-cache TTL)
        vi.advanceTimersByTime(13 * 60 * 60 * 1000);
        const event2 = createMockEvent("/dashboard", "idle-session");
        await handleAuthentication({
          event: event2,
          resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
        });
        expect(event2.locals.user).toBeNull();
        expect(event2.cookies.delete).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        mockPrivateSettings.delete("SESSION_IDLE_HOURS");
      }
    });

    it("slides the idle clock on activity (idle timeout does not fire)", async () => {
      mockPrivateSettings.set("SESSION_IDLE_HOURS", 12);
      setupSessionMock({
        _id: "user1",
        email: "test@test.com",
        role: "admin",
        tenantId: "t1",
        blocked: false,
      });
      const event1 = createMockEvent("/dashboard", "active-session");
      await handleAuthentication({
        event: event1,
        resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
      });

      vi.useFakeTimers();
      try {
        vi.advanceTimersByTime(10 * 60 * 60 * 1000); // 10h — under the window
        const event2 = createMockEvent("/dashboard", "active-session");
        await handleAuthentication({
          event: event2,
          resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
        });
        expect(event2.locals.user).not.toBeNull();
        expect(event2.cookies.delete).not.toHaveBeenCalled();

        // Activity slid the clock: another 10h later still within the window
        vi.advanceTimersByTime(10 * 60 * 60 * 1000);
        const event3 = createMockEvent("/dashboard", "active-session");
        await handleAuthentication({
          event: event3,
          resolve: vi.fn(() => Promise.resolve(new Response("OK"))),
        });
        expect(event3.locals.user).not.toBeNull();
      } finally {
        vi.useRealTimers();
        mockPrivateSettings.delete("SESSION_IDLE_HOURS");
      }
    });
  });

  describe("Tenant Isolation", () => {
    it("should reject session from different tenant", async () => {
      // Pre-set request tenant (as multi-tenant middleware would). Isolation does
      // not require MULTI_TENANT flag once both sides have tenantIds.
      const base = createMockEvent("/dashboard", "valid-session");
      const event = {
        ...base,
        locals: { ...base.locals, user: null, tenantId: "t2" },
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "editor", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));

      await expect(handleAuthentication({ event, resolve })).rejects.toThrow(/tenant/i);
      expect(resolve).not.toHaveBeenCalled();
      // Session cookie cleared so the browser cannot keep replaying the mismatch
      expect(event.cookies.delete).toHaveBeenCalled();
    });

    it("should allow global admin to access any tenant", async () => {
      const base = createMockEvent("/dashboard", "admin-session");
      const event = {
        ...base,
        locals: { ...base.locals, user: null, tenantId: "t2" },
      } as any;
      setupSessionMock({
        _id: "admin1",
        email: "admin@test.com",
        role: "admin",
        isAdmin: true,
        tenantId: null,
      });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.locals.user).not.toBeNull();
      expect(resolve).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing session cookie", async () => {
      const event = createMockEvent("/dashboard", undefined);
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(resolve).toHaveBeenCalled();
    });
  });

  describe("Session Fixation Prevention", () => {
    it("should use __Host- prefix for session cookie name in secure mode", async () => {
      const event = {
        ...createMockEvent("/dashboard", "valid-session"),
        url: new URL("/dashboard", "https://localhost"),
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.cookies.set).toHaveBeenCalledWith(
        expect.stringContaining("__Host-"),
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should use non-prefixed cookie name in dev/insecure mode", async () => {
      const event = createMockEvent("/dashboard", "valid-session");
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(event.cookies.set).toHaveBeenCalledWith(
        expect.not.stringContaining("__Host-"),
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should accept __Host- cookie fallback during local/test traffic", async () => {
      const event = {
        ...createMockEvent("/dashboard", `__Host-${SESSION_COOKIE_NAME}=valid-session`),
        cookies: {
          get: vi.fn((name: string) =>
            name === `__Host-${SESSION_COOKIE_NAME}` ? "valid-session" : null,
          ),
          set: vi.fn(),
          delete: vi.fn(),
        },
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(resolve).toHaveBeenCalled();
    });

    it("should accept __Host- cookie on secure connection", async () => {
      const event = {
        ...createMockEvent("/dashboard"),
        url: new URL("/dashboard", "https://localhost"),
        cookies: {
          get: vi.fn((name: string) =>
            name === `__Host-${SESSION_COOKIE_NAME}` ? "valid-session" : null,
          ),
          set: vi.fn(),
          delete: vi.fn(),
        },
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event, resolve });
      expect(resolve).toHaveBeenCalled();
    });

    it("should have distinct cookie names for secure vs insecure", async () => {
      const httpEvent = createMockEvent("/dashboard", "valid");
      const httpsEvent = {
        ...createMockEvent("/dashboard", "valid"),
        url: new URL("/dashboard", "https://localhost"),
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "admin", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await handleAuthentication({ event: httpEvent, resolve });
      const httpCookieName = (httpEvent.cookies.set as any).mock.calls[0]?.[0];
      await handleAuthentication({ event: httpsEvent, resolve });
      const httpsCookieName = (httpsEvent.cookies.set as any).mock.calls[0]?.[0];
      expect(httpCookieName).not.toBe(httpsCookieName);
    });
  });
});

describe("Cookie Path Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches();
    mockPrivateSettings.clear();
  });

  it("should delete cookie with path '/' when COOKIE_PATH is not configured", async () => {
    const event = createMockEvent("/dashboard", "invalid");
    setupInvalidSession();
    const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
    await handleAuthentication({ event, resolve });

    // Cookie deletion uses getCookiePath() which defaults to "/"
    expect(event.cookies.delete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: "/" }),
    );
  });

  it("should delete cookie with configured path when COOKIE_PATH is set", async () => {
    mockPrivateSettings.set("COOKIE_PATH", "/admin");

    const event = createMockEvent("/dashboard", "invalid");
    setupInvalidSession();
    const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
    await handleAuthentication({ event, resolve });

    expect(event.cookies.delete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: "/admin" }),
    );
  });

  it("should delete cookie with path '/' when COOKIE_PATH is an empty string", async () => {
    mockPrivateSettings.set("COOKIE_PATH", "");

    const event = createMockEvent("/dashboard", "invalid");
    setupInvalidSession();
    const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
    await handleAuthentication({ event, resolve });

    expect(event.cookies.delete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: "/" }),
    );
  });

  it("should delete cookie with path '/' when COOKIE_PATH returns null", async () => {
    mockPrivateSettings.set("COOKIE_PATH", null);

    const event = createMockEvent("/dashboard", "invalid");
    setupInvalidSession();
    const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
    await handleAuthentication({ event, resolve });

    expect(event.cookies.delete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: "/" }),
    );
  });
});
