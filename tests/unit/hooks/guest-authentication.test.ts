/**
 * @file tests/unit/hooks/guest-authentication.test.ts
 * @description Unit tests for Ephemeral Guest Authentication in handleAuthentication middleware.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleAuthentication } from "@src/hooks/handle-authentication";
import type { RequestEvent } from "@sveltejs/kit";

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
    auth: {},
  },
  getDb: vi.fn(),
  getDbInitPromise: vi.fn().mockResolvedValue(null),
}));

vi.mock("@src/services/observability/metrics-service", () => ({
  metricsService: {
    incrementAuthValidations: vi.fn(),
    incrementAuthFailures: vi.fn(),
  },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getSync: vi.fn().mockReturnValue(null),
    set: vi.fn().mockResolvedValue(true),
    setWithCategory: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockImplementation((key) => {
    if (key === "MULTI_TENANT") return false;
    if (key === "DEMO") return false;
    return null;
  }),
}));

function createMockEvent(
  pathname: string,
  method: string = "GET",
  authHeader?: string,
): RequestEvent {
  const url = new URL(pathname, "http://localhost");
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);

  return {
    url,
    request: {
      method,
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

describe("handleAuthentication Middleware - Guest/Anonymous Authentication", () => {
  let mockResolve: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve = vi.fn(() => Promise.resolve(new Response("OK", { status: 200 })));
  });

  it("should inject guest user for a public collections query", async () => {
    const event = createMockEvent("/api/collections/posts", "GET");

    await handleAuthentication({ event, resolve: mockResolve });

    const user = event.locals.user as any;
    expect(user).toBeDefined();
    expect(user?._id).toBe("anonymous");
    expect(user?.role).toBe("guest");
    expect(user?.isAnonymous).toBe(true);
    expect(user?.permissions).toContain("collections:read");
    expect(mockResolve).toHaveBeenCalled();
  });

  it("should inject guest user for a public graphql query using POST", async () => {
    const event = createMockEvent("/api/graphql", "POST");

    await handleAuthentication({ event, resolve: mockResolve });

    const user = event.locals.user as any;
    expect(user).toBeDefined();
    expect(user?._id).toBe("anonymous");
    expect(user?.role).toBe("guest");
    expect(user?.permissions).toContain("graphql:read");
  });

  it("should NOT inject guest user for a public graphql query using DELETE", async () => {
    const event = createMockEvent("/api/graphql", "DELETE");

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
  });

  it("should NOT inject guest user for a non-public config route", async () => {
    const event = createMockEvent("/config/collectionbuilder", "GET");

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
  });

  it("should NOT inject guest user for mutations on collections (POST /api/collections)", async () => {
    const event = createMockEvent("/api/collections/posts", "POST");

    await handleAuthentication({ event, resolve: mockResolve });

    expect(event.locals.user).toBeNull();
  });
});
