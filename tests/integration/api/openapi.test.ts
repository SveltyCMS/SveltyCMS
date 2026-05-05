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

    // Check for some standard paths that should always exist
    expect(data.paths["/system/health"]).toBeDefined();
    expect(data.paths["/auth/login"]).toBeDefined();
  });

  it("should contain dynamic collection paths in the spec", async () => {
    // 🚀  Await dynamic paths with retry to allow async sync to complete
    let collections: string[] = [];
    for (let attempt = 1; attempt <= 15; attempt++) {
      const response = await safeFetch(`${API_BASE_URL}/api/openapi.json`, {
        headers: { Cookie: adminCookie },
      });
      const data = await response.json();

      collections = Object.keys(data.paths || {})
        .filter((path) => path.startsWith("/collections/"))
        .map((path) => path.split("/")[2]);

      if (collections.length > 0) break;
      console.log(`⏳ Waiting for dynamic collections in OpenAPI (attempt ${attempt}/15)...`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(collections.length).toBeGreaterThan(0);
  });
});
