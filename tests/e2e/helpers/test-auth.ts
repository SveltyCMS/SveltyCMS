/**
 * @file tests/e2e/helpers/test-auth.ts
 * @description Deterministic authentication helpers for Playwright E2E tests.
 *
 * Uses `/api/testing` login/seed (not UI). Cookie injection must match
 * auth.setup.ts rules: `__Host-` / `__Secure-` cookies require `secure: true`
 * or Playwright throws "Invalid cookie fields".
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";
import { ADMIN_CREDENTIALS } from "./auth";

const SESSION_COOKIE_RE = /auth_sessions|__Host-auth_sessions|__Secure-auth_sessions/i;

/**
 * Apply Set-Cookie from a testing API response to the browser context.
 * Mirrors tests/e2e/auth.setup.ts — required fields for Playwright:
 * - `__Host-*` / `__Secure-*` → secure: true, url scheme https
 * - never secure:false with a Host-prefixed name (Invalid cookie fields)
 */
export async function applySessionCookie(
  page: Page,
  response: { headers(): Record<string, string>; url(): string },
  hostname = "127.0.0.1",
): Promise<boolean> {
  const setCookie = response.headers()["set-cookie"];
  if (!setCookie) return false;

  // First cookie only (before attributes). Keep values that contain '='.
  const raw = setCookie.split(";")[0]?.trim() ?? "";
  const eqIdx = raw.indexOf("=");
  if (eqIdx <= 0) return false;
  const name = raw.slice(0, eqIdx).trim();
  let value = raw.slice(eqIdx + 1).trim();
  if (!name || !value) return false;

  // Strip surrounding quotes if the server quoted the value
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  let host = hostname;
  try {
    const responseUrl = response.url();
    if (responseUrl) host = new URL(responseUrl).hostname || host;
  } catch {
    /* keep default */
  }
  // Never pass empty host — Playwright rejects empty domain/url
  if (!host) host = "127.0.0.1";

  const isHostCookie = name.startsWith("__Host-");
  const isSecureCookie = isHostCookie || name.startsWith("__Secure-");
  // Playwright rejects Host-prefixed cookies unless secure:true.
  // Use https origin for those; http for plain session cookies.
  const urlScheme = isSecureCookie ? "https://" : "http://";

  try {
    await page.context().addCookies([
      {
        name,
        value,
        url: `${urlScheme}${host}`,
        httpOnly: true,
        sameSite: "Lax" as const,
        secure: isSecureCookie,
      },
    ]);
    return true;
  } catch (err) {
    // Fallback: path-based form (no url) — still must honor secure for Host cookies
    try {
      await page.context().addCookies([
        {
          name,
          value,
          domain: host,
          path: "/",
          httpOnly: true,
          sameSite: "Lax" as const,
          secure: isSecureCookie,
        },
      ]);
      return true;
    } catch (err2) {
      console.log("[test-auth] addCookies failed:", err, err2);
      return false;
    }
  }
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

  if (!loginResponse.ok()) return false;

  // page.request usually stores Set-Cookie automatically; also apply explicitly
  // so browser navigations share the session (required when auto-store is skipped).
  const applied = await applySessionCookie(page, loginResponse);
  // Treat HTTP 200 as success even if Set-Cookie was empty (cookie may already be in jar)
  return applied || (await sessionLooksValid(page));
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
    });
    if (res.status() === 401 || res.status() === 403) return false;
    // 200 OK or other non-auth client errors still mean we are past the gate
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

  // Drop only session cookies (keep other state); avoid wiping everything twice
  const existing = await page.context().cookies();
  const sessionCookies = existing.filter((c) => SESSION_COOKIE_RE.test(c.name));
  if (sessionCookies.length > 0) {
    // clearCookies clears all; re-login immediately after
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

  if (!(await loginViaApi(page))) {
    throw new Error(
      `ensureAuthenticated: API login failed for ${ADMIN_CREDENTIALS.email} after seed`,
    );
  }

  // Final check — if Host-secure cookies still don't attach on http, navigation may still work
  if (await sessionLooksValid(page)) return;

  // Last resort: open app so any cookie jar from page.request is exercised
  try {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!page.url().includes("/login")) return;
  } catch {
    /* ignore */
  }

  throw new Error(
    `ensureAuthenticated: session still invalid for ${ADMIN_CREDENTIALS.email} after API login`,
  );
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
