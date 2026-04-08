/**
 * @file tests/integration/sdk/local-cms.test.ts
 * @description SDK-layer integration tests for LocalCMS via the Testing Bridge.
 * Verifies core domain logic bypassing the HTTP handlers.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import { initializeTestEnvironment, testFixtures } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

describe("LocalCMS SDK Integration (via Bridge)", () => {
  beforeAll(async () => {
    await initializeTestEnvironment();
  });

  /**
   * Helper to perform an SDK call via the testing bridge
   */
  async function sdkCall(method: string, args: any[] = []) {
    const response = await safeFetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-secret": TEST_API_SECRET,
      },
      body: JSON.stringify({
        action: "sdk-call",
        method,
        args,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`SDK Bridge call failed: ${result.error || response.statusText}`);
    }
    return result.data;
  }

  describe("Auth Namespace", () => {
    it("should create a user directly via SDK bridge", async () => {
      const uniqueEmail = `sdk_bridge_${Date.now()}@test.com`;

      const result = await sdkCall("db.auth.createUser", [
        {
          ...testFixtures.users.admin,
          email: uniqueEmail,
          role: "editor",
          tenantId: null,
          isRegistered: true,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.data.email).toBe(uniqueEmail);
      expect(result.data._id).toBeDefined();
    });

    it("should login via SDK facade bridge", async () => {
      const result = await sdkCall("auth.login", [
        {
          email: testFixtures.users.admin.email,
          password: testFixtures.users.admin.password,
        },
      ]);

      expect(result.user.email).toBe(testFixtures.users.admin.email.toLowerCase());
      expect(result.session).toBeDefined();
    });
  });

  describe("Collections Namespace", () => {
    it("should list collections via SDK bridge", async () => {
      const collections = await sdkCall("collections.list", []);
      expect(Array.isArray(collections)).toBe(true);
    });
  });
});
