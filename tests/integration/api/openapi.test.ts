/**
 * @file tests/integration/api/openapi.test.ts
 * @description Black-box integration tests for the dynamic OpenAPI specification.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";

const API_BASE_URL = getApiBaseUrl();

describe("OpenAPI Specification Integration", () => {
  beforeAll(async () => {
    await waitForServer();
  });

  it("should serve a valid OpenAPI 3.1.0 JSON at /api/openapi.json", async () => {
    const response = await safeFetch(`${API_BASE_URL}/api/openapi.json`);
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
    const response = await safeFetch(`${API_BASE_URL}/api/openapi.json`);
    const data = await response.json();

    // In the blog preset, we expect these collections
    const collections = Object.keys(data.paths)
      .filter((path) => path.startsWith("/collections/"))
      .map((path) => path.split("/")[2]);

    expect(collections.length).toBeGreaterThan(0);
  });
});
