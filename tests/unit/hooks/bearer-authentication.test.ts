/**
 * @file tests/unit/hooks/bearer-authentication.test.ts
 * @description Unit tests for Bearer token authentication in handleAuthentication middleware.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleAuthentication, clearAllSessionCaches } from "@src/hooks/handle-authentication";
import { dbAdapter } from "@src/databases/db";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";

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
    system: {
      websiteTokens: {
        getByToken: vi.fn(),
      },
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
  cacheService: {
    getSync: vi.fn().mockReturnValue(null),
    setWithCategory: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
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

describe("handleAuthentication Middleware - Bearer Token", () => {
  let mockResolve: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessionCaches();
    mockResolve = vi.fn(() => Promise.resolve(new Response("OK", { status: 200 })));

    // Explicitly set up the mock for each test to avoid Bun stale module issues
    if ((dbAdapter.system.websiteTokens.getByToken as any).mockImplementation) {
      (dbAdapter.system.websiteTokens.getByToken as any).mockImplementation(() =>
        Promise.resolve({ success: false, data: null }),
      );
    }
  });

  it("should validate a valid Bearer token", async () => {
    const mockToken = {
      _id: "token-123",
      name: "Test Token",
      token: "valid-token",
      type: "content-api",
      tenantId: "t1",
      permissions: ["read:collection:posts"],
    };

    const event = createMockEvent("/api/collections/posts", "Bearer valid-token");
    (dbAdapter.system.websiteTokens.getByToken as any).mockResolvedValue({
      success: true,
      data: mockToken,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    const user = event.locals.user as any;
    expect(user).toBeDefined();
    expect(user?._id).toBe("token:token-123");
    expect(user?.tenantId).toBe("t1");
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should handle invalid Bearer token format", async () => {
    const event = createMockEvent("/api/collections/posts", "InvalidTokenFormat");
    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should handle non-existent Bearer token", async () => {
    const event = createMockEvent("/api/collections/posts", "Bearer missing-token");
    (dbAdapter.system.websiteTokens.getByToken as any).mockResolvedValue({
      success: false,
      data: null,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should enforce tenant isolation for Bearer tokens", async () => {
    const mockToken = {
      _id: "token-123",
      name: "Wrong Tenant Token",
      token: "valid-token",
      type: "content-api",
      tenantId: "wrong-tenant",
    };

    const event = createMockEvent("/api/collections/posts", "Bearer valid-token");
    event.locals.tenantId = "correct-tenant" as DatabaseId;
    (dbAdapter.system.websiteTokens.getByToken as any).mockResolvedValue({
      success: true,
      data: mockToken,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    // Middleware should clear user on tenant mismatch
    expect(event.locals.user).toBeNull();
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should handle orphaned tokens by defaulting to current tenant", async () => {
    const mockToken = {
      _id: "token-123",
      name: "Orphaned Token",
      token: "valid-token",
      type: "admin-api",
      tenantId: null,
    };

    const event = createMockEvent("/api/collections/posts", "Bearer valid-token");
    event.locals.tenantId = "t1" as DatabaseId;
    (dbAdapter.system.websiteTokens.getByToken as any).mockResolvedValue({
      success: true,
      data: mockToken,
    });

    await handleAuthentication({ event, resolve: mockResolve });

    const user = event.locals.user as any;
    expect(user).toBeDefined();
    if (user) {
      expect(user.tenantId).toBe("t1");
      expect(user.role).toBe("admin");
    }
  });
});
