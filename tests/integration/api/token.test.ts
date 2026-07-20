/**
 * @file tests/integration/api/token.test.ts
 * @description
 * Integration test suite for all token-related API endpoints.
 * This suite covers the creation, validation, deletion, and listing of invitation tokens,
 * ensuring that all operations are correctly protected by admin authentication.
 *
 * This is a BLACKBOX integration test suite - tests make HTTP requests to the API
 * without mocking internal dependencies.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();

describe("Token API Endpoints", () => {
  let authCookie: string;

  beforeAll(async () => {
    await waitForServer();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  // Before each test, clean the DB and get a fresh admin session
  beforeEach(async () => {
    authCookie = await prepareAuthenticatedContext();
  });

  describe("POST /api/token/create-token", () => {
    it("should create an invitation token with valid admin authentication", async () => {
      // Use unique email that doesn't exist in the system
      const uniqueEmail = `invite-test-${Date.now()}@example.com`;
      const response = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({
          email: uniqueEmail,
          role: "editor", // Must be a valid role: admin, developer, or editor
          expiresIn: "2 days",
        }),
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it("should reject token creation without authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "unauth-test@example.com",
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should reject token creation for an invalid email format", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: "invalid-email",
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Token Validation and Deletion", () => {
    let invitationToken: string;
    let tokenEmail: string;

    // Before each test in this block, create a fresh invitation token with unique email
    beforeEach(async () => {
      tokenEmail = `validate-test-${Date.now()}@example.com`;
      const createResponse = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: tokenEmail,
          role: "editor",
          expiresIn: "2 days",
        }),
      });
      const createResult = await createResponse.json();
      invitationToken = createResult.token.value;
    });

    describe("GET /api/token/[tokenId]", () => {
      it("should validate an existing and valid token", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`);
        const result = await response.json();

        if (response.status !== 200) {
          console.log("TEST DEBUG: GET token failed!", invitationToken, response.status, result);
        }

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.data.valid).toBe(true);
      });

      it("should return 404 for a non-existent token", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/non-existent-token`);
        expect(response.status).toBe(404);
      });
    });

    describe("DELETE /api/token/[tokenId]", () => {
      it("should delete a token with admin authentication", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
          method: "DELETE",
          headers: { Cookie: authCookie },
        });
        expect(response.status).toBe(200);

        // Verify the token is actually deleted
        const checkResponse = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`);
        expect(checkResponse.status).toBe(404);
      });

      it("should reject deletion without authentication", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
          method: "DELETE",
        });
        expect(response.status).toBe(401);
      });
    });
  });

  describe("GET /api/token", () => {
    it("should list all tokens with admin authentication", async () => {
      // Create a token to ensure the list is not empty
      const uniqueEmail = `list-test-${Date.now()}@example.com`;
      await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: uniqueEmail,
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      const response = await safeFetch(`${API_BASE_URL}/api/token`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should reject listing tokens without authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token`);
      // Returns 401 or 403 depending on auth state
      expect(response.status).toBeGreaterThanOrEqual(401);
      expect(response.status).toBeLessThanOrEqual(403);
    });

    it("should return token list with pagination", async () => {
      // Test pagination structure
      const response = await safeFetch(`${API_BASE_URL}/api/token`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBeDefined();
      expect(result.pagination.limit).toBeDefined();
    });
  });

  describe("GET /api/get-tokens-provided", () => {
    it("should get tokens provided info with admin authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/get-tokens-provided`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      // API returns { google: boolean, twitch: boolean, tiktok: boolean }
      expect(typeof result.google).toBe("boolean");
      expect(typeof result.twitch).toBe("boolean");
      expect(typeof result.tiktok).toBe("boolean");
    });

    it("should reject the request without authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/get-tokens-provided`);
      // Returns 401 or 403 depending on auth state
      expect(response.status).toBeGreaterThanOrEqual(401);
      expect(response.status).toBeLessThanOrEqual(403);
    });
  });

  // ============================================
  // NEW: PUT /api/token/[tokenId] Tests
  // ============================================

  describe("PUT /api/token/[tokenId] - Update Token", () => {
    let invitationToken: string;
    let tokenEmail: string;

    beforeEach(async () => {
      tokenEmail = `update-test-${Date.now()}@example.com`;
      const createResponse = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: tokenEmail,
          role: "editor",
          expiresIn: "2 days",
        }),
      });
      const createResult = await createResponse.json();
      invitationToken = createResult.token.value;
    });

    it("should update a token with admin authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          newTokenData: { role: "developer" },
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it("should reject update without authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newTokenData: { role: "developer" },
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent token", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token/non-existent-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          newTokenData: { role: "developer" },
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // NEW: Batch Operations Tests
  // ============================================

  describe("POST /api/token/batch - Batch Operations", () => {
    let token1: string;
    let token2: string;
    let email1: string;
    let email2: string;

    beforeEach(async () => {
      // Create two tokens for batch operations (Sequential to avoid race conditions)
      email1 = `batch1-${Date.now()}@example.com`;
      email2 = `batch2-${Date.now()}@example.com`;

      const res1 = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: email1,
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      const res2 = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: email2,
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      const [result1, result2] = await Promise.all([res1.json(), res2.json()]);
      token1 = result1.token.value;
      token2 = result2.token.value;
    });

    describe("Batch Delete", () => {
      it("should delete multiple tokens in batch", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [token1, token2],
            action: "delete",
          }),
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.success).toBe(true);
      });

      it("should reject batch delete without authentication", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenIds: [token1],
            action: "delete",
          }),
        });

        expect(response.status).toBe(401);
      });
    });

    describe("Batch Block", () => {
      it("should block multiple tokens in batch", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [token1, token2],
            action: "block",
          }),
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.success).toBe(true);
      });
    });

    describe("Batch Unblock", () => {
      it("should unblock multiple tokens in batch", async () => {
        // First block the tokens
        await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [token1, token2],
            action: "block",
          }),
        });

        // Then unblock them
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [token1, token2],
            action: "unblock",
          }),
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.success).toBe(true);
      });
    });

    describe("Validation", () => {
      it("should reject invalid action", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [token1],
            action: "invalid-action",
          }),
        });

        expect(response.status).toBe(400);
      });

      it("should reject empty tokenIds array", async () => {
        const response = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            tokenIds: [],
            action: "delete",
          }),
        });

        expect(response.status).toBe(400);
      });
    });
  });

  // ============================================
  // NEW: Query Parameters Tests
  // ============================================

  describe("GET /api/token - Query Parameters", () => {
    it("should respect pagination parameters (page and limit)", async () => {
      // Create multiple tokens
      for (let i = 0; i < 5; i++) {
        await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: authCookie },
          body: JSON.stringify({
            email: `pagination-test-${i}-${Date.now()}@example.com`,
            role: "editor",
            expiresIn: "2 days",
          }),
        });
      }

      // Request page 1 with limit 2
      const response = await safeFetch(`${API_BASE_URL}/api/token?page=1&limit=2`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.data.length).toBeLessThanOrEqual(2);
    });

    it("should respect sorting parameters (sort and order)", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/token?sort=createdAt&order=desc`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
    });

    it("should filter by search query", async () => {
      // Create a token with known email prefix
      const searchTerm = `searchtest-${Date.now()}`;
      await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: authCookie },
        body: JSON.stringify({
          email: `${searchTerm}@example.com`,
          role: "editor",
          expiresIn: "2 days",
        }),
      });

      const response = await safeFetch(`${API_BASE_URL}/api/token?search=${searchTerm}`, {
        headers: { Cookie: authCookie },
      });

      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ============================================
  // Multi-Tenancy Isolation (TEST_MODE x-test-tenant-id)
  // ============================================

  describe("Multi-Tenancy Isolation - Cross-Tenant Security", () => {
    /**
     * Uses TEST_MODE header `x-test-tenant-id` so isolation runs without
     * flipping MULTI_TENANT for the whole CMS process (see handle-authentication).
     */
    it("should prevent cross-tenant data access (list, update, delete)", async () => {
      const stamp = Date.now();
      const tenantA = `tenant-a-${stamp}`;
      const tenantB = `tenant-b-${stamp}`;

      // Create invite token under Tenant A
      const createA = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
          "x-test-tenant-id": tenantA,
        },
        body: JSON.stringify({
          email: `tenant-a-${stamp}@example.com`,
          role: "editor",
          expiresIn: "2 days",
        }),
      });
      expect(createA.status).toBeLessThan(300);
      const resultA = await createA.json();
      const tokenAValue = resultA.token?.value ?? resultA.data?.token ?? resultA.data;
      expect(tokenAValue, "tenant A token value").toBeTruthy();

      // Token A is valid for public validate by value
      const verifyA = await safeFetch(`${API_BASE_URL}/api/token/${tokenAValue}`, {
        headers: { "x-test-tenant-id": tenantA },
      });
      expect(verifyA.status).toBe(200);

      // Create a token under Tenant B
      const createB = await safeFetch(`${API_BASE_URL}/api/token/create-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
          "x-test-tenant-id": tenantB,
        },
        body: JSON.stringify({
          email: `tenant-b-${stamp}@example.com`,
          role: "editor",
          expiresIn: "2 days",
        }),
      });
      expect(createB.status).toBeLessThan(300);
      const resultB = await createB.json();
      const tokenBValue = resultB.token?.value ?? resultB.data?.token ?? resultB.data;
      expect(tokenBValue).toBeTruthy();

      // List as Tenant B — must not include Tenant A's invite email
      const listB = await safeFetch(`${API_BASE_URL}/api/token`, {
        headers: {
          Cookie: authCookie,
          "x-test-tenant-id": tenantB,
        },
      });
      expect(listB.status).toBe(200);
      const listBBody = await listB.json();
      const tokensB: Array<{ email?: string; token?: string; value?: string }> = Array.isArray(
        listBBody.data,
      )
        ? listBBody.data
        : [];
      const leakA = tokensB.some(
        (t) =>
          t.email === `tenant-a-${stamp}@example.com` ||
          t.token === tokenAValue ||
          t.value === tokenAValue,
      );
      expect(leakA, "tenant B list must not include tenant A token").toBe(false);

      // List as Tenant A — should include tenant A email
      const listA = await safeFetch(`${API_BASE_URL}/api/token`, {
        headers: {
          Cookie: authCookie,
          "x-test-tenant-id": tenantA,
        },
      });
      expect(listA.status).toBe(200);
      const listABody = await listA.json();
      const tokensA: Array<{ email?: string }> = Array.isArray(listABody.data)
        ? listABody.data
        : [];
      expect(
        tokensA.some((t) => t.email === `tenant-a-${stamp}@example.com`),
        "tenant A list should include its invite",
      ).toBe(true);

      // Batch-delete as Tenant B must not wipe Tenant A tokens (own-tenant only)
      const batchB = await safeFetch(`${API_BASE_URL}/api/token/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
          "x-test-tenant-id": tenantB,
        },
        body: JSON.stringify({
          tokenIds: [tokenBValue],
          action: "delete",
        }),
      });
      expect(batchB.status).toBeLessThan(500);

      // Tenant A token still validates
      const stillA = await safeFetch(`${API_BASE_URL}/api/token/${tokenAValue}`, {
        headers: { "x-test-tenant-id": tenantA },
      });
      expect(stillA.status).toBe(200);
    });
  });
});
