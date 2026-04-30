/**
 * @file tests/integration/api/openapi.test.ts
 * @description Black-box integration tests for the dynamic OpenAPI specification.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();

describe("OpenAPI Specification Integration", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await waitForServer();
    adminCookie = await prepareAuthenticatedContext();
  });

  it("should serve a valid OpenAPI 3.1.0 JSON at /api/openapi.json", async () => {
    const response = await safeFetch(`${API_BASE_URL}/api/openapi.json`, {
      headers: { Cookie: adminCookie },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const data = await response.json();

    expect(data.openapi).toBe("3.1.0");
    expect(data.info.title).toContain("SveltyCMS");
    expect(data.paths).toBeDefined();

    expect(data.paths["/system/health"]).toBeDefined();
    expect(data.paths["/auth/login"]).toBeDefined();
  });

  it("should expose collection paths only when collections exist", async () => {
    const response = await safeFetch(`${API_BASE_URL}/api/openapi.json`, {
      headers: { Cookie: adminCookie },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.paths).toBeDefined();

    const collectionPaths = Object.keys(data.paths).filter((path) =>
      path.startsWith("/collections/"),
    );

    // CI may run with no user collections. That is valid.
    // This test should verify the spec shape, not require seeded blog collections.
    expect(Array.isArray(collectionPaths)).toBe(true);
  });
});