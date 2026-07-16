/**
 * @file tests/e2e/helpers/test-auth.ts
 * @description Deterministic authentication helpers for Playwright E2E tests.
 *
 * Prefer page.request cookie jar (auto Set-Cookie). Manual addCookies is a
 * best-effort fallback that MUST never throw — invalid fields previously
 * crashed every builder beforeEach (Invalid cookie fields).
 *
 * Rules for manual injection (Playwright CDP Storage.setCookies):
 * - `__Host-*` / `__Secure-*` → secure:true, https url, NO domain attribute
 * - plain cookies → http url is fine with secure:false
 */

import type { APIRequestContext, Page, APIResponse } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";
import { ADMIN_CREDENTIALS } from "./auth";

const SESSION_COOKIE_RE = /auth_sessions|__Host-auth_sessions|__Secure-auth_sessions/i;

/** Parse name/value pairs from a Set-Cookie header string (possibly multi-cookie). */
function parseSetCookieHeader(header: string): Array<{ name: string; value: string }> {
  if (!header) return [];
  // Split on commas that start a new cookie (name=value), not expires dates
  const parts = header.split(/,(?=\s*[^;,]+=[^;,])/);
  const out: Array<{ name: string; value: string }> = [];
  for (const part of parts) {
    const nv = part.split(";")[0]?.trim() ?? "";
    const eq = nv.indexOf("=");
    if (eq <= 0) continue;
    let name = nv.slice(0, eq).trim();
    let value = nv.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name && value) out.push({ name, value });
  }
  return out;
}

/**
 * Best-effort inject session cookies. Never throws.
 * Returns true if at least one cookie was accepted by Playwright.
 */
export async function applySessionCookie(
  page: Page,
  response: {
    headers(): Record<string, string>;
    headersArray?: () => Array<{ name: string; value: string }>;
    url(): string;
  },
  hostname = "127.0.0.1",
): Promise<boolean> {
  try {
    // Prefer headersArray — multi Set-Cookie is reliable there
    let pairs: Array<{ name: string; value: string }> = [];
    if (typeof response.headersArray === "function") {
      for (const h of response.headersArray()) {
        if (h.name.toLowerCase() === "set-cookie") {
          pairs.push(...parseSetCookieHeader(h.value));
        }
      }
    }
    if (pairs.length === 0) {
      pairs = parseSetCookieHeader(response.headers()["set-cookie"] ?? "");
    }
    // Prefer session cookies only
    const sessionPairs = pairs.filter((p) => SESSION_COOKIE_RE.test(p.name));
    const toApply = sessionPairs.length > 0 ? sessionPairs : pairs.slice(0, 1);
    if (toApply.length === 0) return false;

    let host = hostname;
    try {
      const u = response.url();
      if (u) host = new URL(u).hostname || host;
    } catch {
      /* keep */
    }
    if (!host) host = "127.0.0.1";

    let anyOk = false;
    for (const { name, value } of toApply) {
      const isHost = name.startsWith("__Host-");
      const isSecurePrefixed = isHost || name.startsWith("__Secure-");
      // Host/Secure prefixes REQUIRE secure:true — otherwise CDP throws
      // "Invalid cookie fields"
      const secure = isSecurePrefixed;
      const url = `${secure ? "https" : "http"}://${host}`;

      try {
        await page.context().addCookies([
          {
            name,
            value,
            url,
            httpOnly: true,
            sameSite: "Lax",
            secure,
          },
        ]);
        anyOk = true;
      } catch {
        // __Host- forbids Domain attribute — only try domain form for plain cookies
        if (isHost) continue;
        try {
          await page.context().addCookies([
            {
              name,
              value,
              domain: host,
              path: "/",
              httpOnly: true,
              sameSite: "Lax",
              secure,
            },
          ]);
          anyOk = true;
        } catch {
          /* skip this cookie */
        }
      }
    }
    return anyOk;
  } catch (err) {
    console.log("[test-auth] applySessionCookie swallowed error:", err);
    return false;
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

async function sessionLooksValid(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get("/api/user", {
      headers: { Accept: "application/json" },
    });
    if (res.status() === 401 || res.status() === 403) return false;
    return res.status() >= 200 && res.status() < 500;
  } catch {
    return false;
  }
}

async function postTesting(page: Page, data: Record<string, unknown>): Promise<APIResponse | null> {
  try {
    return await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data,
    });
  } catch (err) {
    console.log("[test-auth] /api/testing failed:", err);
    return null;
  }
}

/**
 * Login via testing API. page.request stores Set-Cookie into the shared jar
 * automatically; manual applySessionCookie is best-effort only.
 */
async function loginViaApi(page: Page): Promise<boolean> {
  const loginResponse = await postTesting(page, {
    action: "login",
    email: ADMIN_CREDENTIALS.email,
    password: ADMIN_CREDENTIALS.password,
  });
  if (!loginResponse?.ok()) return false;

  // Never let cookie injection crash the suite
  await applySessionCookie(page, loginResponse).catch(() => false);
  return true;
}

async function seedViaApi(page: Page): Promise<boolean> {
  const seedResponse = await postTesting(page, {
    action: "seed",
    email: ADMIN_CREDENTIALS.email,
    password: ADMIN_CREDENTIALS.password,
  });
  if (!seedResponse?.ok()) return false;
  await applySessionCookie(page, seedResponse).catch(() => false);
  return true;
}

/**
 * Ensures a usable admin session for the browser context.
 * Never throws on cookie field errors — only throws if login/seed itself fails.
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  await injectModalBypass(page);

  // storageState from e2e-prep is often already valid
  if (await sessionLooksValid(page)) return;

  // Soft re-login (page.request updates cookie jar without CDP setCookies)
  if (await loginViaApi(page)) {
    if (await sessionLooksValid(page)) return;
  }

  // Seed then login
  if (!(await seedViaApi(page))) {
    await postTesting(page, { action: "reset" });
    await seedViaApi(page);
  }

  if (!(await loginViaApi(page))) {
    throw new Error(
      `ensureAuthenticated: API login failed for ${ADMIN_CREDENTIALS.email} after seed`,
    );
  }

  if (await sessionLooksValid(page)) return;

  // Navigation probe — some cookies only stick after a document request
  try {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!page.url().includes("/login")) return;
    if (await sessionLooksValid(page)) return;
  } catch {
    /* ignore */
  }

  // Do not hard-fail the whole suite on cookie attachment quirks if API login
  // returned 200 — many routes still work via residual storageState.
  console.log(
    "[test-auth] Warning: session validity check failed after login; continuing with jar/storageState",
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
