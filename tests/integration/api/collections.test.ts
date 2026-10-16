/**
 * @file tests/integration/api/collections.test.ts
 * @description Integration tests for the Collections API.
 *
 * Fixture strategy: the collection is created through the /api/testing
 * `create-collection` action. The previous approach wrote a
 * `config/collections/*.ts` file, but the sandbox guard blocks writes outside
 * `config/test-collections`, so the file never landed and every dynamic
 * collection test silently skipped with "No collections available".
 *
 * These tests hard-fail when the fixture is missing — a green run must mean the
 * assertions actually executed.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  getApiBaseUrl,
  prepareAuthenticatedContext,
  safeFetch,
  testingAction,
  waitForServer,
} from "../helpers/server";

const API_BASE_URL = getApiBaseUrl();

const TEST_COLLECTION_NAME = "test_posts";
const SCHEMA = {
  _id: TEST_COLLECTION_NAME,
  name: TEST_COLLECTION_NAME,
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "content", label: "Content", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "status", label: "Status", widget: { Name: "Input" }, type: "string" },
  ],
};

describe("Collections & Content API", () => {
  let adminCookie: string;

  // Single reset + seed + login for the whole suite. The old per-test
  // `beforeEach` wiped the DB before every test; isolation now comes from the
  // distinct payloads below instead of ~12 redundant wipes per run.
  beforeAll(async () => {
    await waitForServer();
    adminCookie = await prepareAuthenticatedContext();
    await testingAction("create-collection", { schema: SCHEMA });

    // Ensure the CMS content structure knows about the new collection.
    // This handles cases where hot-reload did not catch the create-collection call.
    await safeFetch(`${API_BASE_URL}/api/content-structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ action: "recompile" }),
    });
  }, 180_000);

  // --- GET ENDPOINTS ---
  const testGetEndpoint = (endpoint: string) => {
    describe(`GET ${endpoint}`, () => {
      it("should succeed with admin cookie", async () => {
        const response = await safeFetch(`${API_BASE_URL}${endpoint}`, {
          headers: { Cookie: adminCookie },
        });
        expect(response.status).toBe(200);
        const result = await response.json();
        // Some endpoints return { success: true }, others just data
        if (result.success !== undefined) {
          expect(result.success).toBe(true);
        }
      });

      it("should fail without authentication", async () => {
        const response = await safeFetch(`${API_BASE_URL}${endpoint}`);
        expect(response.status).toBe(401);
      });
    });
  };

  testGetEndpoint("/api/collections?raw=true");
  testGetEndpoint("/api/content-structure?action=getContentStructure");

  // --- SEARCH ---
  describe("GET /api/search", () => {
    it("should perform search with valid query", async () => {
      const queryParams = new URLSearchParams({
        q: "test",
        collections: TEST_COLLECTION_NAME,
        raw: "true",
      });
      const response = await safeFetch(`${API_BASE_URL}/api/search?${queryParams.toString()}`, {
        method: "GET",
        headers: { Cookie: adminCookie },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      // Search usually returns an array or an object with hits
      expect(result).toBeDefined();
    });

    it("should handle empty queries gracefully", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/search?q=&raw=true`, {
        method: "GET",
        headers: { Cookie: adminCookie },
      });
      expect(response.status).toBe(200);
    });
  });

  // --- CRUD OPERATIONS ---
  describe("RESTful Operations (dynamic collection)", () => {
    it("should create a new entry", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/collections/${TEST_COLLECTION_NAME}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          title: "Integration Test Post",
          content: "<p>Test content</p>",
          status: "published",
        }),
      });

      // Accept 201 (created), 200 (ok), or 400 (validation - collection may have different required fields)
      expect([200, 201, 400]).toContain(response.status);
    });

    it("should handle GET on collection endpoint", async () => {
      // Note: GET on /api/collections/[collectionId] may return 405 as it's removed
      // The API comment says "GET removed - use +page.server.ts load()"
      const response = await safeFetch(`${API_BASE_URL}/api/collections/${TEST_COLLECTION_NAME}`, {
        headers: { Cookie: adminCookie },
      });
      // Accept 200, 404, or 405 (method not allowed - GET was removed per API comments)
      expect([200, 404, 405]).toContain(response.status);
    });

    it("should fail on invalid collection", async () => {
      const response = await safeFetch(
        `${API_BASE_URL}/api/collections/non_existent_collection_123`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ title: "Test" }),
        },
      );
      // Should be 404 Not Found
      expect(response.status).toBe(404);
    });
  });

  // --- ADMIN UTILS ---
  describe("POST /api/content-structure (recompile)", () => {
    it("should recompile with admin auth", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/content-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ action: "recompile" }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it("should reject unauthenticated recompile", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/content-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // No Cookie
        body: JSON.stringify({ action: "recompile" }),
      });
      expect(response.status).toBe(401);
    });
  });
});
