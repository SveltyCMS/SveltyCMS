/**
 * @file tests/integration/api/session-page-load.test.ts
 * @description Black-box: authenticated session must unlock (app) page loads,
 * not only /api/* endpoints.
 *
 * Catches the class of bugs where /api/user returns 200 but SvelteKit
 * __data.json returns { type: "redirect", location: "/login" } — mass E2E
 * missing page-title failures.
 *
 * Adapter-agnostic: uses public HTTP + session cookie only.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import {
  initializeTestEnvironment,
  prepareAuthenticatedContext,
  testingAction,
  testFixtures,
} from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

/**
 * Full (app) admin surface that must accept a valid admin session.
 * Keep in sync with src/routes/(app) page routes (not optional headless-off).
 */
const AUTHENTICATED_PAGE_PATHS = [
  // Core app
  "/user",
  "/dashboard",
  "/mediagallery",
  // Config hub
  "/config",
  "/config/collectionbuilder",
  "/config/system-settings",
  "/config/access-management",
  "/config/appearance",
  "/config/automations",
  "/config/webhooks",
  "/config/redirects",
  "/config/extensions",
  "/config/queue",
  "/config/monitor",
  "/config/sync",
  "/config/trash",
  "/config/workflows",
  "/config/design-system",
] as const;

function parseSetCookieHeader(header: string | null): string {
  if (!header) return "";
  return header
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function assertPageLoadNotLoginRedirect(path: string, cookie: string): Promise<void> {
  const url = `${API_BASE_URL}${path}/__data.json?x-sveltekit-invalidated=111`;
  const res = await safeFetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
    },
  });

  expect(res.status, `${path} status`).toBe(200);
  const text = await res.text();
  let body: { type?: string; location?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} __data.json not JSON: ${text.slice(0, 200)}`);
  }

  if (body.type === "redirect") {
    expect(
      body.location,
      `${path} redirected to ${body.location} — session cookie not accepted for page load`,
    ).not.toMatch(/\/login/i);
    // Setup redirect is also a failure for seeded admin systems
    expect(body.location, `${path} should not bounce to setup`).not.toMatch(/\/setup/i);
  } else {
    expect(body.type, `${path} __data type`).toBe("data");
  }
}

describe("Session → page load contracts (agnostic headless + admin)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await initializeTestEnvironment();
    adminCookie = await prepareAuthenticatedContext();
    expect(adminCookie.length).toBeGreaterThan(0);
    expect(adminCookie.toLowerCase()).toMatch(/auth_sessions/);
  }, 120_000);

  it("API /api/user accepts the same session cookie as page loads", async () => {
    const res = await safeFetch(`${API_BASE_URL}/api/user`, {
      headers: {
        Accept: "application/json",
        Cookie: adminCookie,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success === true || Array.isArray(body.data) || body.data).toBeTruthy();
  });

  describe("admin __data.json for all config + core shells", () => {
    for (const path of AUTHENTICATED_PAGE_PATHS) {
      it(`GET ${path}/__data.json is data (not redirect to /login)`, async () => {
        await assertPageLoadNotLoginRedirect(path, adminCookie);
      });
    }
  });

  it("unauthenticated __data for /dashboard redirects to login or denies", async () => {
    const res = await safeFetch(
      `${API_BASE_URL}/dashboard/__data.json?x-sveltekit-invalidated=111`,
      {
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.type === "redirect") {
      expect(body.location).toMatch(/login/i);
    } else if (body.type === "error") {
      expect([401, 403, 302, 500]).toContain(body.status ?? body.error?.status ?? 401);
    } else {
      const raw = JSON.stringify(body);
      expect(raw).not.toMatch(/availableWidgets/);
    }
  });

  describe("Testing API login session contract", () => {
    it("POST /api/testing login returns Set-Cookie and x-test-session-id", async () => {
      await testingAction("seed");

      const res = await safeFetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          "x-test-mode": "true",
        },
        body: JSON.stringify({
          action: "login",
          email: testFixtures.adminUser.email,
          password: testFixtures.adminUser.password,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.token || res.headers.get("x-test-session-id")).toBeTruthy();

      const setCookie = res.headers.get("set-cookie") || "";
      const sessionHeader = res.headers.get("x-test-session-id") || "";
      expect(
        /auth_sessions/i.test(setCookie) || sessionHeader.length > 0,
        "login must expose session via Set-Cookie and/or x-test-session-id",
      ).toBe(true);

      const cookie =
        parseSetCookieHeader(setCookie) || (sessionHeader ? `auth_sessions=${sessionHeader}` : "");
      expect(cookie).toMatch(/auth_sessions=/i);

      // Spot-check a sample of admin pages with testing-API session
      for (const path of ["/user", "/config/webhooks", "/config/automations"] as const) {
        await assertPageLoadNotLoginRedirect(path, cookie);
      }
    });

    it("x-test-session-id alone (no Set-Cookie) unlocks page loads", async () => {
      // PR #473: Playwright storageState strips Set-Cookie on http:// origins.
      // E2E helpers fall back to x-test-session-id → cookie injection.
      // This test proves the contract end-to-end at the HTTP layer.
      await testingAction("seed");

      const loginRes = await safeFetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          "x-test-mode": "true",
        },
        body: JSON.stringify({
          action: "login",
          email: testFixtures.adminUser.email,
          password: testFixtures.adminUser.password,
        }),
      });

      expect(loginRes.status).toBe(200);
      const sessionId = loginRes.headers.get("x-test-session-id");
      expect(sessionId, "x-test-session-id must be present").toBeTruthy();
      expect(sessionId!.length).toBeGreaterThan(10);

      // Simulate what Playwright helpers do: construct cookie from session ID only
      const injectedCookie = `auth_sessions=${sessionId}`;

      // Verify the injected cookie works for page loads
      for (const path of ["/user", "/dashboard", "/config/webhooks"] as const) {
        await assertPageLoadNotLoginRedirect(path, injectedCookie);
      }

      // Verify it also works for /api/user
      const apiRes = await safeFetch(`${API_BASE_URL}/api/user`, {
        headers: { Accept: "application/json", Cookie: injectedCookie },
      });
      expect(apiRes.status).toBe(200);
    });
  });
});
