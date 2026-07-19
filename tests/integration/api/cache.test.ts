/**
 * @file tests/integration/api/cache.test.ts
 * @description Integration tests for Cache API endpoints
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
  await waitForServer();
  authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
  await cleanupTestDatabase();
});

describe("Cache API - Clear Cache", () => {
  it("should clear cache", async () => {
    const response = await safeFetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
    });

    expect(response.status).toBe(200);
  });

  it("should support selective cache clearing", async () => {
    const response = await safeFetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        type: "collections",
      }),
    });

    expect(response.status).toBe(200);
  });

  it("should require admin authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
    });

    expect(response.status).toBe(401);
  });

  it("should return cache clear results", async () => {
    const response = await safeFetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success || data.cleared).toBeDefined();
  });
});
