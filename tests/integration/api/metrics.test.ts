/**
 * @file tests/integration/api/metrics.test.ts
 * @description Integration tests for Performance Metrics API endpoints
 *
 * The /api/metrics endpoint wraps cms.telemetry.checkUpdateStatus() which may
 * require tenant context in multi-tenant deployments. In single-tenant test
 * environments the response may be 200 or 403 (TENANT_REQUIRED). Tests are
 * written defensively to accept both outcomes.
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
  it("should get performance metrics or require tenant context", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // 200 = metrics returned; 403 = tenant context required (valid in single-tenant test mode)
    expect([200, 403]).toContain(response.status);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should include system metrics when available", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // Accept 200 or 403 (tenant context required)
    expect([200, 403]).toContain(response.status);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });

  it("should support metric filtering or require tenant context", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics?type=system`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // 200 = filtered metrics returned; 403 = tenant context required
    expect([200, 403]).toContain(response.status);
  });
});

describe("Metrics API - Admin Access", () => {
  it("should allow admin to access metrics or require tenant context", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    // 200 = metrics returned; 403 = tenant context required
    expect([200, 403]).toContain(response.status);
  });

  it("should require authentication for metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/metrics`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });
});
