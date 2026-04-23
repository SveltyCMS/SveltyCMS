/**
 * @file tests/integration/api/version.test.ts
 * @description Integration tests for Version Check API endpoints
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

describe("Version Check API - Version Information", () => {
  it("should get version information", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version-check`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("should check for updates", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version-check?checkUpdates=true`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should include current version", async () => {
    const response = await safeFetch(`${BASE_URL}/api/version-check`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.version || data.currentVersion).toBeDefined();
  });
});
