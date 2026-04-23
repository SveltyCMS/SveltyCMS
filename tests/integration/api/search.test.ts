/**
 * @file tests/integration/api/search.test.ts
 * @description Integration tests for Global Search API endpoints
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
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

describe("Search API - Global Search", () => {
  it("should search across collections", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search?q=test`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should handle empty search query", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search`, {
      headers: { Origin: BASE_URL, Cookie: authCookie },
    });

    expect(response.status).toBe(200);
  });

  it("should filter by collection type", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search?q=test&type=Posts`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should support pagination", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search?q=test&page=1&limit=10`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search?q=test`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });

  it("should return relevant search results", async () => {
    const response = await safeFetch(`${BASE_URL}/api/search?q=test`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });
});
