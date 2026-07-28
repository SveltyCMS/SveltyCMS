/**
 * @file tests/unit/hooks/api-requests.test.ts
 * @description Tests for handleApiRequests middleware.
 */

import { describe, it, expect, vi } from "vitest";
import { handleApiRequests } from "@src/hooks/handle-api-requests";
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
    const event = createMockEvent("/api/login", "POST");
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
