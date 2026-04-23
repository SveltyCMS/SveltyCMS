/**
 * @file tests/integration/api/config-sync.test.ts
 * @description Integration tests for Config Sync API endpoints
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

describe("Config Sync API - Configuration Synchronization", () => {
  it("should sync configuration", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config_sync`, {
      headers: { Cookie: authCookie, Origin: BASE_URL },
    });

    expect(response.status).toBe(200);
  });

  it("should require admin authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/config_sync`, {
      headers: { Origin: BASE_URL },
    });
    expect(response.status).toBe(401);
  });
});
