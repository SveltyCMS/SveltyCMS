/**
 * @file tests/integration/api/version.test.ts
 * @description
 * Integration tests for the version endpoints.
 *
 * Routes covered:
 * - `GET /api/system/version` — installed version only (handleVersionRoutes)
 * - `GET /api/system/version/check` — update check against GitHub Releases
 * - `GET /api/version/check` — same handler via the short namespace alias
 * - `GET /api/version-check` — utility alias, backed by the same version service
 *
 * GitHub may be unreachable from the test environment. The service then reports a
 * typed `error` with `updateAvailable: false` and the endpoint still answers 200,
 * so every payload assertion below covers both the success and the error path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();
let authCookie: string;

/** Asserts the documented update-check payload (`UpdateCheckResult`). */
function expectUpdateCheckShape(data: Record<string, unknown>): void {
  expect(typeof data.currentVersion).toBe("string");
  expect(data.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(data.latestVersion === null || typeof data.latestVersion === "string").toBe(true);
  expect(typeof data.updateAvailable).toBe("boolean");
  expect(typeof data.checkedAt).toBe("string");
  expect(Number.isNaN(Date.parse(data.checkedAt as string))).toBe(false);

  if (data.error !== undefined) {
    expect(typeof data.error).toBe("string");
    // A reported failure never claims an update.
    expect(data.updateAvailable).toBe(false);
    expect(data.latestVersion).toBeNull();
  }
}

beforeAll(async () => {
  await waitForServer();
  authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
  await cleanupTestDatabase();
});

describe("Version API - GET /api/system/version", () => {
  it("is a public read of the installed version", async () => {
    // The bare endpoint is in the public exact-route allowlist (hook-utils.ts) and the
    // installed version already ships to every page via publicEnv.PKG_VERSION, so it is
    // deliberately unauthenticated. The GitHub-backed /version/check below is not.
    const response = await safeFetch(`${BASE_URL}/api/system/version`, {
      headers: { Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should return the installed version in the success envelope", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system/version`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.currentVersion).toBe("string");
    expect(body.data.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("Version API - GET /api/system/version/check", () => {
  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system/version/check`, {
      headers: { Origin: BASE_URL },
    });

    expect(response.status).toBe(401);
  });

  it("should return the documented update-check payload", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system/version/check`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expectUpdateCheckShape(body.data);
  });

  it("should report the same installed version as the bare endpoint", async () => {
    const [bare, check] = await Promise.all([
      safeFetch(`${BASE_URL}/api/system/version`, {
        headers: { Cookie: authCookie, Origin: BASE_URL },
      }),
      safeFetch(`${BASE_URL}/api/system/version/check`, {
        headers: { Cookie: authCookie, Origin: BASE_URL },
      }),
    ]);

    expect(bare.status).toBe(200);
    expect(check.status).toBe(200);

    const bareBody = await bare.json();
    const checkBody = await check.json();
    expect(checkBody.data.currentVersion).toBe(bareBody.data.currentVersion);
  });

  it("should reject an unknown version sub-path with 404", async () => {
    const response = await safeFetch(`${BASE_URL}/api/system/version/not-a-route`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("should serve the same payload through the /api/version namespace alias", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version/check`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expectUpdateCheckShape(body.data);
  });
});

describe("Version API - GET /api/version-check (utility namespace)", () => {
  it("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version-check`, {
      headers: { Origin: BASE_URL },
    });

    expect(response.status).toBe(401);
  });

  it("should return the consolidated payload from the shared version service", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version-check`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    // rawResponse: this utility route is not enveloped in `{ success, data }`.
    const body = await response.json();
    expectUpdateCheckShape(body);
  });
});
