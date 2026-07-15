/**
 * @file tests/e2e/helpers/test-auth.ts
 * @description Deterministic authentication helpers for Playwright E2E tests.
 *
 * Uses `/api/testing` login/seed (not UI) so sessions are fresh for each worker.
 * Stale storageState cookies from e2e-prep are re-validated and replaced when needed.
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";
import { ADMIN_CREDENTIALS } from "./auth";

const SESSION_COOKIE_RE = /auth_sessions|__Host-auth_sessions|__Secure-auth_sessions/i;

function e2eBaseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";
}

/**
 * Applies a session cookie from a seed/login API response to the page context.
 * For HTTP e2e bases, prefer url=`http://host` so the cookie is actually sent
 * (secure-only cookies are not attached to http:// navigations).
 */
export async function applySessionCookie(
  page: Page,
  response: { headers(): Record<string, string>; url(): string },
  hostname = "127.0.0.1",
): Promise<boolean> {
  const setCookie = response.headers()["set-cookie"];
  if (!setCookie) return false;

  // set-cookie may be multi-value; take the first session cookie pair
  const firstPair = setCookie.split(/,(?=[^;]+?=)/)[0] ?? setCookie;
  const cookieParts = firstPair.split(";")[0].trim();
  const eqIdx = cookieParts.indexOf("=");
  const name = eqIdx >= 0 ? cookieParts.slice(0, eqIdx) : cookieParts;
  const value = eqIdx >= 0 ? cookieParts.slice(eqIdx + 1) : "";
  if (!name || !value) return false;

  let host = hostname;
  try {
    const responseUrl = response.url();
    if (responseUrl) host = new URL(responseUrl).hostname;
  } catch {
    /* keep default */
  }

  const base = e2eBaseUrl();
  const isHttpBase = base.startsWith("http://");
  // __Host- requires Secure; on pure-HTTP e2e we still set the cookie for the
  // http origin so Playwright attaches it to requests (matches auth.setup fallback).
  const cookieUrl = isHttpBase ? `http://${host}` : `https://${host}`;

  await page.context().addCookies([
    {
      name,
      value,
      url: cookieUrl,
      httpOnly: true,
      sameSite: "Lax",
      secure: !isHttpBase,
    },
  ]);

  return true;
}

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
  await applySessionCookie(page, seedResponse);
  return true;
}

/** True when a request to a protected endpoint accepts the current cookies. */
async function sessionLooksValid(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get("/api/user", {
      headers: { Accept: "application/json" },
      failOnStatusCode: false,
    } as any);
    // 200 = ok; 404 = route variant but authenticated; 401/403 = not authed
    if (res.status() === 401 || res.status() === 403) return false;
    if (res.status() >= 200 && res.status() < 500) return true;
  } catch {
    /* fall through */
  }
  return false;
}

/**
 * Ensures the page has a valid admin session without UI login.
 * Re-validates storageState cookies; reseeds + re-logs when stale.
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  await injectModalBypass(page);

  if (await sessionLooksValid(page)) return;

  // Drop stale prep cookies and mint a fresh API session
  const existing = await page.context().cookies();
  if (existing.some((c) => SESSION_COOKIE_RE.test(c.name))) {
    await page.context().clearCookies();
  }

  if (await loginViaApi(page)) {
    if (await sessionLooksValid(page)) return;
  }

  if (!(await seedViaApi(page))) {
    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    await seedViaApi(page);
  }

  if (!(await loginViaApi(page)) || !(await sessionLooksValid(page))) {
    throw new Error(
      `ensureAuthenticated: API login failed for ${ADMIN_CREDENTIALS.email} after seed`,
    );
  }
}

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
