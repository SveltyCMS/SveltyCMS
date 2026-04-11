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
  },
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
  const createMockEvent = (path: string) => {
    return {
      url: new URL(`http://localhost${path}`),
      request: {
        method: "GET",
        headers: new Map(),
      },
      locals: {},
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
});
