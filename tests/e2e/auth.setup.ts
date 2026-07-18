/**
 * @file tests/e2e/auth.setup.ts
 * @description Authentication setup for Playwright E2E tests
 *
 * Uses deterministic test API (no UI-based login) for reliable storage state generation.
 * The seed and login endpoints return set-cookie headers / x-test-session-id that are
 * applied to the browser context, then saved as storage state.
 *
 * IMPORTANT: Never treat public "/" as proof of authentication — it does not redirect
 * to /login when unauthenticated.
 */

import { test as setup, expect } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./helpers/auth";
import { readFileSync } from "node:fs";
import { TEST_API_HEADERS } from "./helpers/test-api";

const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
const EDITOR_AUTH_FILE = "tests/e2e/.auth/editor.json";
const AUTHOR_AUTH_FILE = "tests/e2e/.auth/author.json";

function originFromResponse(response: { url: () => string }, secure: boolean): string {
  try {
    const bu = new URL(response.url());
    return `${secure ? "https" : "http"}://${bu.host}`;
  } catch {
    return `${secure ? "https" : "http"}://127.0.0.1:4173`;
  }
}

/**
 * Apply session cookie from testing-API login/seed response.
 * Playwright often strips Set-Cookie from response.headers() — fall back to
 * x-test-session-id / JSON token body.
 */
async function applySessionFromResponse(
  page: any,
  response: any,
  bodyToken?: string,
): Promise<boolean> {
  const headers = response.headers();
  const setCookie = headers["set-cookie"] || "";
  const sessionId = headers["x-test-session-id"] || "";

  let tokenFromBody = bodyToken || "";
  if (!tokenFromBody) {
    try {
      const body = await response.json();
      tokenFromBody = body?.token || body?.data?.session?._id || "";
    } catch {
      /* body may already be consumed; ignore */
    }
  }

  const sid = sessionId || tokenFromBody;
  const cookieLine = setCookie.split(";")[0] || "";
  const eqIdx = cookieLine.indexOf("=");
  let name = eqIdx > 0 ? cookieLine.slice(0, eqIdx).trim() : "";
  let value = eqIdx > 0 ? cookieLine.slice(eqIdx + 1).trim() : "";

  // Prefer Set-Cookie name/value; fall back to plain auth_sessions + session id
  if (!name) name = "auth_sessions";
  if (!value) value = sid;
  if (!value) return false;

  const secure = name.startsWith("__Host-") || name.startsWith("__Secure-");
  // Over HTTP in CI, force non-secure plain cookie name
  if (secure && !response.url().startsWith("https")) {
    name = "auth_sessions";
  }
  const finalSecure = name.startsWith("__Host-") || name.startsWith("__Secure-");
  const origin = originFromResponse(response, finalSecure);

  try {
    await page.context().addCookies([
      {
        name,
        value,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
        secure: finalSecure,
      },
    ]);
    return true;
  } catch (err) {
    console.log("[Setup] addCookies failed:", err);
    // Last resort: plain cookie without secure prefix
    try {
      await page.context().addCookies([
        {
          name: "auth_sessions",
          value: sid || value,
          url: originFromResponse(response, false),
          httpOnly: true,
          sameSite: "Lax",
          secure: false,
        },
      ]);
      return true;
    } catch (err2) {
      console.log("[Setup] plain addCookies also failed:", err2);
      return false;
    }
  }
}

/** Verify browser can reach a protected page with the current cookie jar. */
async function sessionIsAuthenticated(page: any): Promise<boolean> {
  try {
    const api = await page.request.get("/api/user/me", {
      headers: { Accept: "application/json" },
    });
    if (api.ok()) return true;
    // 401/403 = definitely unauthenticated
    if (api.status() === 401 || api.status() === 403) return false;
  } catch {
    /* fall through to document probe */
  }

  try {
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 20_000 });
    const url = page.url();
    return !url.includes("/login") && !url.includes("/setup");
  } catch {
    return false;
  }
}

/**
 * Extract session cookie from response and apply it to the current context.
 */
async function extractAndSaveSession(
  page: any,
  response: any,
  outputPath: string,
  bodyToken?: string,
) {
  let sessionEstablished = await applySessionFromResponse(page, response, bodyToken);

  // page.request may already have stored Set-Cookie into the jar even when
  // response.headers() omits set-cookie — verify before re-login.
  if (!sessionEstablished || !(await sessionIsAuthenticated(page))) {
    console.log("[Setup] Session not confirmed — attempting explicit testing API login...");
    try {
      const loginResp = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "login",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      if (loginResp.ok()) {
        await applySessionFromResponse(page, loginResp);
        sessionEstablished = await sessionIsAuthenticated(page);
        console.log(`[Setup] Re-login sessionEstablished=${sessionEstablished}`);
      } else {
        console.log(`[Setup] Re-login status=${loginResp.status()}`);
      }
    } catch (fallbackErr) {
      console.log("[Setup] Direct login fallback failed:", fallbackErr);
    }
  } else {
    sessionEstablished = true;
  }

  if (!sessionEstablished) {
    console.warn(
      "[Setup] WARNING: could not confirm authenticated storageState — chromium tests will re-login",
    );
  }

  await page.context().storageState({ path: outputPath });
  console.log(
    `[Setup] Storage state saved to ${outputPath} (sessionEstablished=${sessionEstablished})`,
  );
}

setup.describe("E2E Role-Based Setup", () => {
  setup("authenticate as admin", async ({ page }) => {
    // 1. Reset Database for a clean slate
    console.log("[Setup] Resetting database via Testing API...");
    const resetResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    expect(resetResponse.status()).toBe(200);

    // 2. Seed system (creates admin user; session is optional)
    console.log(`[Setup] Seeding database with ${ADMIN_CREDENTIALS.email}...`);
    const seedResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });

    const seedBody = await seedResponse.json();
    expect(seedResponse.status()).toBe(200);
    expect(seedBody.success).toBe(true);

    // 3. Prefer an explicit login after seed so Set-Cookie / session id is always present.
    console.log(`[Setup] Logging in as ${ADMIN_CREDENTIALS.email} for storageState...`);
    const loginResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "login",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.success).toBe(true);

    // 4. Extract session cookie and save storage state (verified on /user)
    await extractAndSaveSession(page, loginResponse, ADMIN_AUTH_FILE, loginBody.token);
  });

  setup("provision editor and author via test API", async ({ page }) => {
    // Load admin state to authorize user creation
    const adminState = JSON.parse(readFileSync(ADMIN_AUTH_FILE, "utf-8"));
    await page.context().addCookies(adminState.cookies);

    const roles = ["Editor", "Author"];
    for (const role of roles) {
      console.log(`[Setup] Creating ${role} user...`);
      const email = `${role.toLowerCase()}@example.com`;
      const password = "Password123!";

      const createResponse = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "create-user",
          email,
          password,
          role,
        },
      });

      expect(createResponse.ok()).toBeTruthy();

      // Login via test API (no UI navigation)
      const loginResponse = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "login",
          email,
          password,
        },
      });

      const loginBody = await loginResponse.json();
      expect(loginResponse.status()).toBe(200);
      expect(loginBody.success).toBe(true);

      const targetFile = role === "Editor" ? EDITOR_AUTH_FILE : AUTHOR_AUTH_FILE;
      await extractAndSaveSession(page, loginResponse, targetFile, loginBody.token);
    }
  });
});
