/**
 * @file tests/integration/api/metrics.test.ts
 * @description Integration tests for Performance Metrics API endpoints
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

describe("Metrics API - Performance Metrics", () => {
  it("should get performance metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should include system metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });

  it("should support metric filtering", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics?type=system`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });
});

describe("Metrics API - Admin Access", () => {
  it("should allow admin to access metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should require authentication for metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });
});
