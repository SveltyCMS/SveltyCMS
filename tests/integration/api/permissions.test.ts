/**
 * @file tests/integration/api/permissions.test.ts
 * @description Integration tests for Permission API endpoints
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

describe("Permission API - Update Permissions", () => {
  it("should reject invalid user permissions", async () => {
    const response = await safeFetch(`${BASE_URL}/api/permission/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        userId: "test-user-id",
        permissions: ["read", "write"],
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should validate permission data", async () => {
    const response = await safeFetch(`${BASE_URL}/api/permission/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        invalid: "data",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should require admin authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/permission/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
  });
});
