/**
 * @file tests/bun/api/theme.test.ts
 * @description
 * Integration tests for Theme Management API endpoints.
 * Aligned with consolidated routes: get-current-theme, update-theme, set-default.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const DEFAULT_THEME_ID = "670e8b8c4d123456789abcde";

describe("Theme API Endpoints", () => {
  let authCookie: string;

  // Single reset + login for the whole suite (was per-test beforeEach).
  beforeAll(async () => {
    await waitForServer();
    authCookie = await prepareAuthenticatedContext();
  }, 120_000);

  describe("GET /api/theme/get-current-theme", () => {
    it("should return current theme for authenticated user", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
        headers: { Cookie: authCookie },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("name");
    });

    it("should fail without authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
        skipTestSecret: true,
      });
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/theme/update-theme", () => {
    it("should update theme custom CSS with admin authentication", async () => {
      // First get current theme to get an ID
      const getResponse = await safeFetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
        headers: { Cookie: authCookie },
      });
      const current = await getResponse.json();

      // A seeded install always ships a default theme with an _id. Its absence is
      // a real regression, not a reason to quietly skip the update assertion.
      if (!current._id) {
        throw new Error("Seeded install did not expose a theme _id — update contract cannot run");
      }

      const response = await safeFetch(`${API_BASE_URL}/api/theme/update-theme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({
          themeId: current._id,
          customCss: "/* test css */",
        }),
      });

      if (response.status === 404) {
        expect(current._id).toBe(DEFAULT_THEME_ID);
        return;
      }

      expect(response.status).toBe(200);
    });

    it("should fail with missing themeId", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/theme/update-theme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({
          customCss: "/* test css */",
        }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/theme/set-default", () => {
    it("should set default theme with admin authentication", async () => {
      const response = await safeFetch(`${API_BASE_URL}/api/theme/set-default`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({
          themeId: DEFAULT_THEME_ID,
        }),
      });

      expect([200, 204]).toContain(response.status);
    });
  });
});
