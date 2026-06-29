/**
 * @file tests/e2e/helpers/test-auth.ts
 * @description Deterministic authentication helpers for Playwright E2E tests.
 *
 * Unlike `auth.ts` which uses UI-based login (flaky), these helpers use the
 * /api/testing API to obtain session cookies directly, eliminating UI login
 * flakiness from E2E tests.
 *
 * Usage:
 *   import { ensureAuthenticated } from "./helpers/test-auth";
 *   test.beforeEach(async ({ page }) => {
 *     await ensureAuthenticated(page);
 *   });
 */

import type { Page, APIRequestContext } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";
import { ADMIN_CREDENTIALS } from "./auth";

/**
 * Applies a session cookie from the seed/login API response to the page context.
 */
export async function applySessionCookie(
  page: Page,
  response: { headers(): Record<string, string> },
): Promise<string | null> {
  const cookies = response.headers()["set-cookie"];
  const sessionId = response.headers()["x-test-session-id"];

  if (!cookies) return null;

  const cookieParts = cookies.split(";")[0];
  const [name, value] = cookieParts.split("=");

  const baseUrl = new URL(page.url());
  await page.context().addCookies([
    {
      name,
      value,
      domain: baseUrl.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return sessionId || null;
}

/**
 * Ensures the page has a valid admin session.
 * If no session cookie exists, creates one via the test API.
 * This is useful for test.beforeEach hooks.
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  const hasSession = cookies.some(
    (c) => c.name.includes("auth_sessions") || c.name.includes("__Host-auth_sessions"),
  );

  if (hasSession) return;

  // Use login endpoint to get a session
  const loginResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "login",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });

  if (loginResponse.status() !== 200) {
    // Session might be expired — reseed
    const seedResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });

    if (seedResponse.status() !== 200) {
      // Full reset + reseed
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "reset" },
      });
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
    }
  }

  const finalResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "login",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });

  await applySessionCookie(page, finalResponse);
}

/**
 * Resets and reseeds the database from a test.
 * Useful for tests that need a completely clean state.
 */
export async function resetAndSeed(request: APIRequestContext): Promise<{
  success: boolean;
  sessionId?: string;
}> {
  const resetResponse = await request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "reset" },
  });

  if (resetResponse.status() !== 200) {
    return { success: false };
  }

  const seedResponse = await request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });

  if (seedResponse.status() !== 200) {
    return { success: false };
  }

  const body = await seedResponse.json();
  return {
    success: body.success,
    sessionId: body.sessionId,
  };
}
