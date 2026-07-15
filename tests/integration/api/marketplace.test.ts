/**
 * @file tests/integration/api/marketplace.test.ts
 * @description Integration tests for Marketplace API endpoints
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

describe("Marketplace API - Widget Marketplace", () => {
  it("should list marketplace widgets", async () => {
    const response = await safeFetch(`${BASE_URL}/api/marketplace`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data) || typeof data === "object").toBe(true);
  });

  it("should search marketplace", async () => {
    const response = await safeFetch(`${BASE_URL}/api/marketplace?search=test`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should filter by category", async () => {
    const response = await safeFetch(`${BASE_URL}/api/marketplace?category=analytics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/marketplace`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });
});
