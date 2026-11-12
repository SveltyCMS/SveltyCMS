/**
 * @file tests/unit/hooks/session-cache-tenant-key.test.ts
 * @description The in-memory session tiers must be keyed by tenant + session id.
 *
 * WHY: the session id is a client-supplied cookie value, so two tenants can
 * present the same string. Keying the LRU (and the negative cache, refresh /
 * rotation / anomaly timers) by the bare id let a request in tenant B read the
 * user snapshot cached for tenant A before the tenant-mismatch check ran. The
 * distributed cache key already carried the tenant; the local tiers now do too.
 *
 * ### Features:
 * - a primed session is invisible to another tenant and to tenant-less callers
 * - invalidation with a tenant leaves other tenants' entries alone
 * - tenant-less invalidation drops the id from every namespace
 * - per-user invalidation still clears the right entry
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@src/databases/db", () => {
  const mockAdapter = {
    auth: { getSessionTokenData: vi.fn(), getUserById: vi.fn() },
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
  getPrivateSettingSync: vi.fn(() => undefined),
  getPublicSettingSync: vi.fn(() => undefined),
}));

vi.mock("$app/environment", () => ({ dev: true, browser: false }));

vi.mock("@src/databases/cache/cache-service", () => ({
  SESSION_CACHE_TTL_MS: 86_400_000,
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

const {
  clearAllSessionCaches,
  invalidateSessionCache,
  invalidateUserSessionCaches,
  primeSessionMemoryCache,
} = await import("@src/hooks/handle-authentication");
const { peekSessionUserSync } = await import("@src/hooks/handle-rate-limit");

const SESSION_ID = "shared-session-id";
/** Tenant ids are branded `DatabaseId` values at the call sites below. */
const TENANT_A = "tenant-a" as never;
const TENANT_B = "tenant-b" as never;

function user(email: string, tenantId: string) {
  return {
    _id: `user-${tenantId}`,
    email,
    username: email,
    role: "editor",
    tenantId,
    isAdmin: false,
    permissions: [],
  } as unknown as Parameters<typeof primeSessionMemoryCache>[1];
}

describe("tenant-keyed in-memory session cache", () => {
  beforeEach(() => {
    clearAllSessionCaches();
  });

  it("does not serve a tenant's session to another tenant with the same id", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);

    expect(peekSessionUserSync(SESSION_ID, TENANT_B)).toBeNull();
    expect(peekSessionUserSync(SESSION_ID, TENANT_A)?.email).toBe("a@example.test");
  });

  it("does not serve a tenant's session to a tenant-less lookup", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);

    expect(peekSessionUserSync(SESSION_ID)).toBeNull();
  });

  it("keeps both tenants' entries independent", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);
    primeSessionMemoryCache(SESSION_ID, user("b@example.test", "tenant-b"), TENANT_B);

    expect(peekSessionUserSync(SESSION_ID, TENANT_A)?.email).toBe("a@example.test");
    expect(peekSessionUserSync(SESSION_ID, TENANT_B)?.email).toBe("b@example.test");
  });

  it("invalidating one tenant leaves the other tenant's entry warm", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);
    primeSessionMemoryCache(SESSION_ID, user("b@example.test", "tenant-b"), TENANT_B);

    invalidateSessionCache(SESSION_ID, TENANT_A);

    expect(peekSessionUserSync(SESSION_ID, TENANT_A)).toBeNull();
    expect(peekSessionUserSync(SESSION_ID, TENANT_B)?.email).toBe("b@example.test");
  });

  it("invalidating without a tenant drops the id from every namespace", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);
    primeSessionMemoryCache(SESSION_ID, user("b@example.test", "tenant-b"), TENANT_B);

    invalidateSessionCache(SESSION_ID);

    expect(peekSessionUserSync(SESSION_ID, TENANT_A)).toBeNull();
    expect(peekSessionUserSync(SESSION_ID, TENANT_B)).toBeNull();
  });

  it("per-user invalidation clears only that user's cache entry", () => {
    primeSessionMemoryCache(SESSION_ID, user("a@example.test", "tenant-a"), TENANT_A);
    primeSessionMemoryCache("other-session", user("b@example.test", "tenant-b"), TENANT_B);

    invalidateUserSessionCaches("user-tenant-a");

    expect(peekSessionUserSync(SESSION_ID, TENANT_A)).toBeNull();
    expect(peekSessionUserSync("other-session", TENANT_B)?.email).toBe("b@example.test");
  });
});
