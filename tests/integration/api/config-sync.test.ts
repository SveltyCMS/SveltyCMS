/**
 * @file tests/integration/api/config-sync.test.ts
 * @description Integration tests for Config Sync API endpoints
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

describe("Config Sync API - Configuration Synchronization", () => {
  it("should return configuration promotion status", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config/status`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toBeDefined();
    expect(body).toHaveProperty("status");
    expect(["in_sync", "changes_detected"]).toContain(body.status);
    expect(body).toHaveProperty("changes");
    expect(body.changes).toHaveProperty("new");
    expect(body.changes).toHaveProperty("updated");
    expect(body.changes).toHaveProperty("deleted");
    expect(body).toHaveProperty("unmetRequirements");
  });

  it("should keep deprecated config_sync status alias available", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config_sync`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
  });

  it("should require admin authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config/status`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });

  it("should plan and apply configuration promotion", async () => {
    const planResponse = await safeFetch(`${BASE_URL}/api/config/plan`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "merge" }),
    });

    expect(planResponse.status).toBe(200);
    const planBody = await planResponse.json();
    const plan = planBody.data ?? planBody;
    expect(plan).toHaveProperty("planId");

    const response = await safeFetch(`${BASE_URL}/api/config/apply`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId: plan.planId, mode: plan.mode }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("should keep deprecated config_sync import action available", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config_sync`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "import" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
  });
});
