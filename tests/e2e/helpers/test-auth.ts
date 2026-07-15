/**
 * @file tests/e2e/helpers/test-auth.ts
 * @description Deterministic authentication helpers for Playwright E2E tests.
 *
 * Unlike `auth.ts` which uses UI-based login (flaky, often burns the full 30s
 * default test timeout on sign-in clicks), these helpers use `/api/testing` to
 * obtain session cookies directly.
 *
 * Usage:
 *   import { ensureAuthenticated } from "./helpers/test-auth";
 *   test.beforeEach(async ({ page }) => {
 *     await ensureAuthenticated(page);
 *   });
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";
import { ADMIN_CREDENTIALS } from "./auth";

const SESSION_COOKIE_RE = /auth_sessions|__Host-auth_sessions|__Secure-auth_sessions/i;

/**
 * Applies a session cookie from a seed/login API response to the page context.
 * Handles `__Host-` / `__Secure-` prefixes and cookie values that contain `=`.
 */
export async function applySessionCookie(
  page: Page,
  response: { headers(): Record<string, string>; url(): string },
  hostname = "127.0.0.1",
): Promise<boolean> {
  const cookies = response.headers()["set-cookie"];
  if (!cookies) return false;

  const cookieParts = cookies.split(";")[0];
  const eqIdx = cookieParts.indexOf("=");
  const name = eqIdx >= 0 ? cookieParts.slice(0, eqIdx) : cookieParts;
  const value = eqIdx >= 0 ? cookieParts.slice(eqIdx + 1) : "";
  if (!name || !value) return false;

  const isHostCookie = name.startsWith("__Host-");
  const secure = isHostCookie || name.startsWith("__Secure-");
  const urlScheme = secure ? "https://" : "http://";

  // Prefer response host when available (page may still be about:blank).
  let host = hostname;
  try {
    const responseUrl = response.url();
    if (responseUrl) host = new URL(responseUrl).hostname;
  } catch {
    /* keep default */
  }

  await page.context().addCookies([
    {
      name,
      value,
      url: `${urlScheme}${host}`,
      httpOnly: true,
      sameSite: "Lax",
      secure,
    },
  ]);

  return true;
}

/**
 * Inject client storage that suppresses welcome / cookie / first-login modals.
 * Call before or after session cookie injection; init scripts apply on next navigation.
 */
export async function injectModalBypass(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({ responded: true, necessary: true }),
    );
    window.localStorage.setItem("sveltycms-welcome-seen", "true");
    window.localStorage.setItem(
      "sveltycms-welcome-progress",
      JSON.stringify(["data-management", "collections", "users", "settings"]),
    );
  });
}

async function loginViaApi(page: Page): Promise<boolean> {
  const loginResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "login",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });

  if (loginResponse.ok()) {
    return applySessionCookie(page, loginResponse);
  }
  return false;
}

async function seedViaApi(page: Page): Promise<boolean> {
  const seedResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });

  if (!seedResponse.ok()) return false;
  // Seed may already include a session cookie — apply if present.
  await applySessionCookie(page, seedResponse);
  return true;
}

/**
 * Ensures the page has a valid admin session without UI login.
 * Seeds via the testing API when login fails, then re-logs in.
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  await injectModalBypass(page);

  const cookies = await page.context().cookies();
  const hasSession = cookies.some((c) => SESSION_COOKIE_RE.test(c.name));
  if (hasSession) return;

  if (await loginViaApi(page)) return;

  // Login failed — seed (or reset+seed) then login again.
  if (!(await seedViaApi(page))) {
    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    await seedViaApi(page);
  }

  if (!(await loginViaApi(page))) {
    throw new Error(
      `ensureAuthenticated: API login failed for ${ADMIN_CREDENTIALS.email} after seed`,
    );
  }
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
