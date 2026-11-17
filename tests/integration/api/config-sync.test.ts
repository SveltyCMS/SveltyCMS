/**
 * @file tests/integration/api/config-sync.test.ts
 * @description Integration tests for Config Sync API endpoints
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
  await waitForServer();
  authCookie = await prepareAuthenticatedContext();
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

  it("should export configuration snapshot and list it via GET /api/config/exports", async () => {
    const exportRes = await safeFetch(`${BASE_URL}/api/config/export`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(exportRes.status).toBe(200);
    const exportBody = await exportRes.json();
    const dirPath = exportBody.data?.dirPath ?? exportBody.dirPath;
    expect(typeof dirPath).toBe("string");
    expect(dirPath.length).toBeGreaterThan(0);

    const listRes = await safeFetch(`${BASE_URL}/api/config/exports`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const snapshots = listBody.data?.exports ?? listBody.exports ?? [];
    expect(Array.isArray(snapshots)).toBe(true);
    expect(snapshots.some((s: { dirPath?: string }) => s.dirPath === dirPath)).toBe(true);
  });

  it("should return supported config resources via GET /api/config/resources", async () => {
    const res = await safeFetch(`${BASE_URL}/api/config/resources`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const resources = body.data?.resources ?? body.resources ?? [];
    expect(resources.some((r: { type: string }) => r.type === "collections")).toBe(true);
  });

  it("should require confirmation flag when applying a destructive replace plan", async () => {
    const planRes = await safeFetch(`${BASE_URL}/api/config/plan`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "replace" }),
    });
    expect(planRes.status).toBe(200);
    const planBody = await planRes.json();
    const plan = planBody.data ?? planBody;
    expect(plan.requiresConfirmation).toBe(true);

    const unconfirmed = await safeFetch(`${BASE_URL}/api/config/apply`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId: plan.planId, mode: "replace" }),
    });
    expect(unconfirmed.status).toBe(400);

    const confirmed = await safeFetch(`${BASE_URL}/api/config/apply`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId: plan.planId, mode: "replace", confirmed: true }),
    });
    expect(confirmed.status).toBe(200);
  });

  it("should reject unknown planId on POST /api/config/apply", async () => {
    const res = await safeFetch(`${BASE_URL}/api/config/apply`, {
      method: "POST",
      headers: {
        Cookie: authCookie,
        Origin: BASE_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId: "missing-plan-id", mode: "merge" }),
    });
    expect(res.status).toBe(400);
  });
});
