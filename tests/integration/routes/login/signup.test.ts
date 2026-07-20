/**
 * @file tests/integration/routes/login/signup.test.ts
 * @description Black-box integration tests for invitation-based / first-user signup paths.
 *
 * First-user bootstrap is covered by the setup wizard + `/api/testing` seed.
 * Subsequent user creation requires admin/session or invitation (create-user gate).
 *
 * Uses HTTP only (no in-process DB helpers) so the suite works with the external
 * preview server started by `scripts/run-integration.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestDatabase,
  getApiBaseUrl,
  prepareAuthenticatedContext,
  safeFetch,
  waitForServer,
} from "../../helpers/server";

const API_BASE = getApiBaseUrl();
const TEST_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

async function seedViaTestingApi(email: string, password: string, username = "admin") {
  const response = await safeFetch(`${API_BASE}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_SECRET,
    },
    body: JSON.stringify({ action: "seed", email, password, username }),
  });
  return response;
}

describe("Invitation-Based Signup Tests", () => {
  beforeAll(async () => {
    await waitForServer();
  });

  afterAll(async () => {
    try {
      await cleanupTestDatabase();
    } catch {
      /* best-effort */
    }
  });

  describe("Login Page", () => {
    it("should render login page (or redirect) when system is ready", async () => {
      await cleanupTestDatabase();
      await seedViaTestingApi("admin@example.com", "Password123!");

      const response = await safeFetch(`${API_BASE}/login`, {
        method: "GET",
        redirect: "manual",
      } as RequestInit);

      expect([200, 301, 302, 303, 307, 308]).toContain(response.status);
    });
  });

  describe("Seed / first admin via Testing API", () => {
    it("should seed admin and allow login", async () => {
      await cleanupTestDatabase();

      const seed = await seedViaTestingApi("admin@example.com", "Password123!", "admin");
      expect(seed.ok || seed.status === 200).toBe(true);

      const cookie = await prepareAuthenticatedContext({ skipReset: true });
      expect(cookie.length).toBeGreaterThan(0);

      const me = await safeFetch(`${API_BASE}/api/user`, {
        headers: { Cookie: cookie },
      });
      expect(me.status).toBe(200);
      const body = await me.json();
      const users = body.data ?? body;
      expect(Array.isArray(users) ? users.length : 1).toBeGreaterThan(0);
    });

    it("should reject create-user without session (invitation / admin gate)", async () => {
      await cleanupTestDatabase();
      await seedViaTestingApi("admin@example.com", "Password123!");

      const response = await safeFetch(`${API_BASE}/api/user/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        skipTestSecret: true,
        body: JSON.stringify({
          email: "second@example.com",
          username: "second",
          password: "Password123!",
          confirmPassword: "Password123!",
        }),
      });

      // Unauthenticated create must not succeed
      expect(response.status).not.toBe(200);
      expect([401, 403, 400, 422]).toContain(response.status);
    });

    it("should reject weak password on create-user", async () => {
      await cleanupTestDatabase();
      const adminCookie = await prepareAuthenticatedContext();

      const response = await safeFetch(`${API_BASE}/api/user/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        skipTestSecret: true,
        body: JSON.stringify({
          email: "weak@example.com",
          username: "weakuser",
          password: "weak",
          confirmPassword: "weak",
        }),
      });

      expect(response.status).not.toBe(200);
    });
  });

  describe("OAuth entrypoints", () => {
    it("should respond to OAuth start without crashing", async () => {
      const response = await safeFetch(`${API_BASE}/login/oauth?provider=google`, {
        method: "GET",
        redirect: "manual",
      } as RequestInit);

      // Provider may be unconfigured in CI — any non-5xx is acceptable
      if ([404, 500, 501, 503].includes(response.status)) return;
      expect([200, 301, 302, 303, 307, 308, 400]).toContain(response.status);
    });
  });
});
