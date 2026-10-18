/**
 * @file tests/unit/hooks/turbo-mfa.test.ts
 * @description Turbo fast paths honor role MFA requirements and API-key scopes.
 *
 * ### Features:
 * - MFA-mandating roles are never served from a turbo context whose AMR lacks a second factor
 * - A session that completed MFA keeps the turbo fast path
 * - A changed browser falls through instead of serving the cached response
 * - API-key scopes gate read/write/delete actions on the DB-hit and cache-hit paths
 * - Cached revoked/expired keys fail closed without a DB fallback
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

const mockPrivateSettings = new Map<string, unknown>();

vi.mock("@src/databases/db", () => {
  const mockAdapter = {
    auth: {
      getSessionTokenData: vi.fn(),
      getUserById: vi.fn(),
      getApiKey: vi.fn(),
    },
  };
  return {
    dbAdapter: mockAdapter,
    auth: { validateSession: vi.fn(), getUserById: vi.fn() },
    getDbInitPromise: vi.fn(() => Promise.resolve()),
    getDb: vi.fn(() => mockAdapter),
    isDbConnected: vi.fn(() => true),
  };
});

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
    clearByTags: vi.fn().mockResolvedValue(undefined),
  },
}));

const {
  handleAuthentication,
  isApiKeyScopeAllowed,
  clearAllSessionCaches,
  primeSessionMemoryCache,
} = await import("@src/hooks/handle-authentication");
const {
  handleTurboGet,
  clearTurboAuthCache,
  getTurboAuthContext,
  rememberTurboSessionSurface,
  setTurboAuthContext,
} = await import("@src/hooks/handle-turbo-get");
const { dbAdapter } = await import("@src/databases/db");
const { cacheService } = await import("@src/databases/cache/cache-service");
const { createMockEvent } = await import("./test-utils");

const MFA_USER = { _id: "user-mfa", email: "mfa@test.local", role: "admin" };
const MFA_ROLE = {
  _id: "admin",
  name: "Administrator",
  isAdmin: true,
  mfaRequired: true,
  permissions: [],
};

function createEvent(
  pathname: string,
  options: {
    method?: string;
    sessionCookie?: string | null;
    userAgent?: string;
    headers?: Record<string, string>;
    tenantId?: string;
  } = {},
): RequestEvent {
  return createMockEvent(pathname, {
    method: options.method ?? "GET",
    sessionCookie: options.sessionCookie ?? null,
    userAgent: options.userAgent,
    headers: options.headers,
    tenantId: options.tenantId,
  });
}

function warmTurbo(sessionId: string, amr?: string[], mfaVerifiedAt?: string): void {
  setTurboAuthContext(
    sessionId,
    MFA_USER as never,
    [MFA_ROLE] as never,
    "tenant-a" as never,
    undefined,
    undefined,
    { amr, mfaVerifiedAt },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSessionCaches();
  clearTurboAuthCache();
  mockPrivateSettings.clear();
  mockPrivateSettings.set("JWT_SECRET_KEY", "unit-test-secret");
  vi.mocked(cacheService.getSync).mockReturnValue(null);
  vi.mocked(cacheService.isNegativeHit).mockReturnValue(false);
  (dbAdapter as any).auth = {
    getSessionTokenData: vi.fn(),
    getUserById: vi.fn(),
    getApiKey: vi.fn(),
  };
});

describe("turbo GET MFA gating", () => {
  it("does not apply the turbo context when the role mandates MFA and AMR has no second factor", async () => {
    warmTurbo("turbo-mfa-missing", ["pwd"]);
    const event = createEvent("/api/collections/posts", { sessionCookie: "turbo-mfa-missing" });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleTurboGet({ event, resolve } as any);

    expect(resolve).toHaveBeenCalledWith(event);
    expect((event.locals as any).__turboAuth).toBeUndefined();
    expect(event.locals.user).toBeNull();
  });

  it("applies the turbo context when the session AMR proves MFA", async () => {
    warmTurbo("turbo-mfa-ok", ["pwd", "mfa"], new Date().toISOString());
    const event = createEvent("/api/collections/posts", { sessionCookie: "turbo-mfa-ok" });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleTurboGet({ event, resolve } as any);

    expect((event.locals as any).__turboAuth).toBe(true);
    expect(event.locals.user?._id).toBe(MFA_USER._id);
  });

  it("falls through when the request browser differs from the session surface", async () => {
    warmTurbo("turbo-risk", ["pwd", "mfa"], new Date().toISOString());
    rememberTurboSessionSurface("turbo-risk", "127.0.0.1", "UA-Stored");
    const event = createEvent("/api/collections/posts", {
      sessionCookie: "turbo-risk",
      userAgent: "UA-Other",
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleTurboGet({ event, resolve } as any);

    expect((event.locals as any).__turboAuth).toBeUndefined();
    expect(event.locals.user).toBeNull();
  });
});

describe("handleAuthentication turbo branches MFA gating", () => {
  it("falls through the safe-method turbo branch when MFA is unmet", async () => {
    warmTurbo("auth-mfa-missing", ["pwd"]);
    const event = createEvent("/api/collections/posts", {
      sessionCookie: "auth-mfa-missing",
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    // The full pipeline (authorization) still sees the AMR and enforces MFA.
    expect((event.locals as any).__turboAuth).toBeUndefined();
    expect((event.locals as any).sessionAmr).toEqual(["pwd"]);
  });

  it("serves the safe-method turbo branch when MFA is satisfied", async () => {
    warmTurbo("auth-mfa-ok", ["pwd", "mfa"], new Date().toISOString());
    const event = createEvent("/api/collections/posts", { sessionCookie: "auth-mfa-ok" });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect((event.locals as any).__turboAuth).toBe(true);
    expect(event.locals.user?._id).toBe(MFA_USER._id);
    expect(dbAdapter.auth.getSessionTokenData).not.toHaveBeenCalled();
  });

  it("falls through the mutation turbo branch when the browser changed", async () => {
    warmTurbo("auth-risk", ["pwd", "mfa"], new Date().toISOString());
    rememberTurboSessionSurface("auth-risk", "127.0.0.1", "UA-Stored");
    const event = createEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: "auth-risk",
      userAgent: "UA-Other",
      headers: { "x-csrf-token": "unit-csrf-token" },
    });
    (event.cookies as any).get = vi.fn((name: string) =>
      name === SESSION_COOKIE_NAME ? "auth-risk" : name === "csrf_token" ? "unit-csrf-token" : null,
    );
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect((event.locals as any).__turboAuth).toBeUndefined();
    expect((event.locals as any).sessionRisk).toBe("step-up");
  });
});

describe("primeSessionMemoryCache AMR write-through", () => {
  it("stores the session AMR on the turbo context", () => {
    const verifiedAt = new Date().toISOString();
    primeSessionMemoryCache(
      "primed-session",
      { _id: "user-primed", role: "admin" } as never,
      null,
      ["pwd", "mfa"],
      verifiedAt,
    );

    const turbo = getTurboAuthContext("primed-session");
    expect(turbo?.amr).toEqual(["pwd", "mfa"]);
    expect(turbo?.mfaVerifiedAt).toBe(verifiedAt);
  });
});

describe("isApiKeyScopeAllowed", () => {
  it("maps read-only scopes to safe methods", () => {
    expect(isApiKeyScopeAllowed(["read"], "GET")).toBe(true);
    expect(isApiKeyScopeAllowed(["read"], "HEAD")).toBe(true);
    expect(isApiKeyScopeAllowed(["read"], "POST")).toBe(false);
    expect(isApiKeyScopeAllowed(["read"], "DELETE")).toBe(false);
  });

  it("maps write scopes to mutations", () => {
    expect(isApiKeyScopeAllowed(["write"], "POST")).toBe(true);
    expect(isApiKeyScopeAllowed(["write"], "PATCH")).toBe(true);
    expect(isApiKeyScopeAllowed(["write"], "GET")).toBe(false);
  });

  it("maps delete scopes to DELETE only", () => {
    expect(isApiKeyScopeAllowed(["delete"], "DELETE")).toBe(true);
    expect(isApiKeyScopeAllowed(["delete"], "GET")).toBe(false);
  });

  it("accepts admin, wildcard, and resource-scoped entries", () => {
    expect(isApiKeyScopeAllowed(["admin"], "GET")).toBe(true);
    expect(isApiKeyScopeAllowed(["admin"], "POST")).toBe(true);
    expect(isApiKeyScopeAllowed(["admin"], "DELETE")).toBe(true);
    expect(isApiKeyScopeAllowed(["*"], "DELETE")).toBe(true);
    expect(isApiKeyScopeAllowed(["content:*"], "POST")).toBe(true);
    expect(isApiKeyScopeAllowed(["content:read"], "POST")).toBe(false);
  });

  it("keeps empty or absent scopes backward compatible", () => {
    expect(isApiKeyScopeAllowed([], "GET")).toBe(true);
    expect(isApiKeyScopeAllowed([], "POST")).toBe(true);
    expect(isApiKeyScopeAllowed(undefined, "DELETE")).toBe(true);
  });
});

describe("API-key scope enforcement on authentication", () => {
  const rawKey = `sck_${"a".repeat(40)}`;

  function apiKeyData(overrides: Record<string, unknown> = {}) {
    return {
      _id: "key-1",
      name: "unit-key",
      permissions: ["collections:read"],
      scopes: ["read"],
      tenantId: undefined,
      revoked: false,
      expiresAt: undefined,
      ...overrides,
    };
  }

  it("authenticates a read-scoped key on GET", async () => {
    (dbAdapter as any).auth.getApiKey = vi
      .fn()
      .mockResolvedValue({ success: true, data: apiKeyData() });
    const event = createEvent("/api/collections/posts", {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect((event.locals.user as any)?.isApiKey).toBe(true);
    expect(resolve).toHaveBeenCalled();
  });

  it("rejects a read-scoped key on POST with API_KEY_SCOPE_DENIED", async () => {
    (dbAdapter as any).auth.getApiKey = vi
      .fn()
      .mockResolvedValue({ success: true, data: apiKeyData() });
    const event = createEvent("/api/collections/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const resolve = vi.fn(async () => new Response("OK"));

    const res = await handleAuthentication({ event, resolve } as any);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "API_KEY_SCOPE_DENIED" });
    expect(event.locals.user).toBeNull();
  });

  it("authenticates a write-scoped key on POST", async () => {
    (dbAdapter as any).auth.getApiKey = vi.fn().mockResolvedValue({
      success: true,
      data: apiKeyData({ scopes: ["write"], permissions: ["collections:write"] }),
    });
    const event = createEvent("/api/collections/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect((event.locals.user as any)?.isApiKey).toBe(true);
  });

  it("rejects a write-scoped key on GET", async () => {
    (dbAdapter as any).auth.getApiKey = vi.fn().mockResolvedValue({
      success: true,
      data: apiKeyData({ scopes: ["write"] }),
    });
    const event = createEvent("/api/collections/posts", {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    const resolve = vi.fn(async () => new Response("OK"));

    const res = await handleAuthentication({ event, resolve } as any);

    expect(res.status).toBe(403);
    expect(event.locals.user).toBeNull();
  });

  it("rejects a cached revoked key without falling back to the database", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue({
      user: { _id: "apikey:key-1", username: "unit-key", permissions: [], scopes: ["read"] },
      tenantId: "tenant-a",
      revoked: true,
    });
    const event = createEvent("/api/collections/posts", {
      headers: { Authorization: `Bearer ${rawKey}` },
      tenantId: "tenant-a",
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect(event.locals.user).toBeNull();
    expect(dbAdapter.auth.getApiKey).not.toHaveBeenCalled();
    expect(cacheService.clearByTags).toHaveBeenCalled();
  });

  it("rejects a cached expired key", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue({
      user: { _id: "apikey:key-2", username: "unit-key", permissions: [], scopes: ["read"] },
      tenantId: "tenant-a",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const event = createEvent("/api/collections/posts", {
      headers: { Authorization: `Bearer ${rawKey}` },
      tenantId: "tenant-a",
    });
    const resolve = vi.fn(async () => new Response("OK"));

    await handleAuthentication({ event, resolve } as any);

    expect(event.locals.user).toBeNull();
    expect(dbAdapter.auth.getApiKey).not.toHaveBeenCalled();
  });

  it("applies scopes on the cache-hit path", async () => {
    vi.mocked(cacheService.getSync).mockReturnValue({
      user: { _id: "apikey:key-3", username: "unit-key", permissions: [], scopes: ["read"] },
      tenantId: "tenant-a",
      revoked: false,
    });
    const event = createEvent("/api/collections/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}` },
      tenantId: "tenant-a",
    });
    const resolve = vi.fn(async () => new Response("OK"));

    const res = await handleAuthentication({ event, resolve } as any);

    expect(res.status).toBe(403);
    expect(event.locals.user).toBeNull();
    expect(dbAdapter.auth.getApiKey).not.toHaveBeenCalled();
  });
});
