/**
 * @file tests/unit/hooks/api-keys-authentication.test.ts
 * @description Unit tests for API Key Bearer authentication in handleAuthentication middleware.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleAuthentication, clearAllSessionCaches } from "@src/hooks/handle-authentication";
import { dbAdapter } from "@src/databases/db";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";
import { generateApiKey } from "@src/databases/auth/api-keys";

// Mock dependencies
vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

vi.mock("@src/databases/db", () => ({
  auth: {
    validateSession: vi.fn(),
  },
  dbAdapter: {
    auth: {
      getApiKey: vi.fn(),
      updateApiKeyUsage: vi.fn().mockResolvedValue({ success: true }),
    },
  },
  getDb: vi.fn(),
  getDbInitPromise: vi.fn().mockResolvedValue(null),
}));

vi.mock("@src/services/metrics/metrics-service", () => ({
  metricsService: {
    incrementAuthValidations: vi.fn(),
    incrementAuthFailures: vi.fn(),
  },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  SESSION_CACHE_TTL_MS: 86400000,
  cacheService: {
    get: vi.fn().mockResolvedValue(null),
    getSync: vi.fn().mockReturnValue(null),
    setWithCategory: vi.fn().mockResolvedValue(true),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    isNegativeHit: vi.fn().mockReturnValue(false),
    recordMiss: vi.fn(),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
}));

function createMockEvent(pathname: string, authHeader?: string): RequestEvent {
  const url = new URL(pathname, "http://localhost");
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);

  return {
    url,
    request: {
      method: "GET",
      headers,
    },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: {
      user: null,
      tenantId: "t1",
    } as any,
  } as unknown as RequestEvent;
}

describe("handleAuthentication Middleware - API Keys", () => {
  let mockResolve: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches();
    mockResolve = vi.fn(() => Promise.resolve(new Response("OK", { status: 200 })));
  });

  it("should validate a valid API Key", async () => {
    const { full, hash, prefix } = generateApiKey();
    const mockApiKey = {
      _id: "key-123",
      name: "Production Frontend",
      hash,
      prefix,
      userId: "user-123",
      scopes: ["content:read"],
      permissions: ["read:collection:posts"],
      revoked: false,
      usageCount: 0,
      tenantId: "t1",
    };

    const event = createMockEvent("/api/collections/posts", `Bearer ${full}`);
    (dbAdapter.auth.getApiKey as any).mockResolvedValue({
      success: true,
      data: mockApiKey,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    const user = event.locals.user as any;
    expect(user).toBeDefined();
    expect(user?._id).toBe("apikey:key-123");
    expect(user?.tenantId).toBe("t1");
    expect(user?.scopes).toContain("content:read");
    expect(dbAdapter.auth.updateApiKeyUsage).toHaveBeenCalledWith("key-123", undefined, {
      tenantId: "t1",
    });
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should reject a revoked API Key", async () => {
    const { full, hash, prefix } = generateApiKey();
    const mockApiKey = {
      _id: "key-123",
      name: "Revoked Frontend",
      hash,
      prefix,
      userId: "user-123",
      scopes: ["content:read"],
      permissions: ["read:collection:posts"],
      revoked: true,
      usageCount: 10,
      tenantId: "t1",
    };

    const event = createMockEvent("/api/collections/posts", `Bearer ${full}`);
    (dbAdapter.auth.getApiKey as any).mockResolvedValue({
      success: true,
      data: mockApiKey,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should reject an expired API Key", async () => {
    const { full, hash, prefix } = generateApiKey();
    const mockApiKey = {
      _id: "key-123",
      name: "Expired Frontend",
      hash,
      prefix,
      userId: "user-123",
      scopes: ["content:read"],
      permissions: ["read:collection:posts"],
      revoked: false,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      usageCount: 5,
      tenantId: "t1",
    };

    const event = createMockEvent("/api/collections/posts", `Bearer ${full}`);
    (dbAdapter.auth.getApiKey as any).mockResolvedValue({
      success: true,
      data: mockApiKey,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should enforce tenant isolation for API Keys", async () => {
    const { full, hash, prefix } = generateApiKey();
    const mockApiKey = {
      _id: "key-123",
      name: "Wrong Tenant Key",
      hash,
      prefix,
      userId: "user-123",
      scopes: ["content:read"],
      permissions: ["read:collection:posts"],
      revoked: false,
      usageCount: 0,
      tenantId: "wrong-tenant",
    };

    const event = createMockEvent("/api/collections/posts", `Bearer ${full}`);
    event.locals.tenantId = "correct-tenant" as DatabaseId;
    (dbAdapter.auth.getApiKey as any).mockResolvedValue({
      success: true,
      data: mockApiKey,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });
});
