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
  });

  describe("Tenant Isolation", () => {
    it("should reject session from different tenant", async () => {
      const event = {
        ...createMockEvent("/dashboard", "valid-session"),
        locals: { user: null, tenantId: "t2" },
      } as any;
      setupSessionMock({ _id: "user1", email: "test@test.com", role: "editor", tenantId: "t1" });
      const resolve = vi.fn(() => Promise.resolve(new Response("OK")));
      await expect(handleAuthentication({ event, resolve })).rejects.toThrow(/tenant/i);
    });

    it("should allow global admin to access any tenant", async () => {
      const event = {
        ...createMockEvent("/dashboard", "admin-session"),
        locals: { user: null, tenantId: "t2" },
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
