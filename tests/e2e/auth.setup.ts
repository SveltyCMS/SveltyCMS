/**
 * @file tests/e2e/auth.setup.ts
 * @description Authentication setup for Playwright E2E tests
 *
 * Uses deterministic test API (no UI-based login) for reliable storage state generation.
 * The seed and login endpoints return set-cookie headers that are applied directly
 * to the browser context, eliminating UI flakiness.
 */

import { test as setup, expect } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./helpers/auth";
import { readFileSync } from "node:fs";
import { TEST_API_HEADERS } from "./helpers/test-api";

const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
const EDITOR_AUTH_FILE = "tests/e2e/.auth/editor.json";
const AUTHOR_AUTH_FILE = "tests/e2e/.auth/author.json";

/**
 * Extract session cookie from response and apply it to the current context.
 * The seed/login endpoints return set-cookie headers that we parse and inject
 * into the Playwright browser context, then save as storage state.
 */
async function extractAndSaveSession(page: any, response: any, outputPath: string) {
  const cookies = response.headers()["set-cookie"];
  const sessionId = response.headers()["x-test-session-id"];

  let sessionEstablished = false;

  // If the seed/login response includes cookies, use them directly.
  // Use the API response URL to build the cookie origin (page.url() may be
  // "about:blank" when the test only issues API requests without navigation).
  // Use `url` instead of domain/path for addCookies — simpler and avoids
  // "Invalid cookie fields" from empty/edge-case domain values.
  if (cookies && sessionId) {
    const cookieParts = cookies.split(";")[0];
    // Use indexOf (not split("=")) so cookie values containing "=" aren't
    // truncated — base64 session IDs and signed tokens often contain "=".
    const eqIdx = cookieParts.indexOf("=");
    const name = eqIdx >= 0 ? cookieParts.slice(0, eqIdx) : cookieParts;
    const value = eqIdx >= 0 ? cookieParts.slice(eqIdx + 1) : "";
    const context = page.context();
    let hostname = "127.0.0.1";
    try {
      const pageUrl = page.url();
      if (pageUrl && pageUrl !== "about:blank") {
        hostname = new URL(pageUrl).hostname;
      }
    } catch {}
    // Match the upstream secure-cookie handling: __Host- and __Secure-
    // prefixed cookies MUST be set with secure: true, otherwise Playwright
    // rejects them / they don't get sent back over http.
    const isHostCookie = name.startsWith("__Host-");
    const secure = isHostCookie || name.startsWith("__Secure-");
    const urlScheme = secure ? "https://" : "http://";
    // Include host:port from the API response so cookies bind to 127.0.0.1:4173
    // (hostname alone defaults to port 80 and is never sent to the preview server).
    let cookieOrigin = urlScheme + hostname;
    try {
      const bu = new URL(response.url());
      cookieOrigin = `${urlScheme}${bu.host}`;
    } catch {
      /* keep hostname-only fallback */
    }
    await context.addCookies([
      {
        name,
        value,
        url: cookieOrigin,
        httpOnly: true,
        sameSite: "Lax",
        secure,
      },
    ]);
    sessionEstablished = true;
  } else {
    // Fallback: seed succeeded but no cookie returned.
    // Try navigating to homepage — the server should have established a session.
    console.log("[Setup] No set-cookie in seed response — navigating to establish session...");
  }

  // Verify session by navigating to homepage — but only if we haven't
  // already established the session via the cookie. The networkidle wait
  // can time out when the system is in IDLE state (the /api/content/events
  // endpoint is blocked and the page keeps polling).
  if (!sessionEstablished) {
    try {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
      const currentUrl = page.url();
      if (!currentUrl.includes("/login")) {
        sessionEstablished = true;
      } else {
        console.log("[Setup] Session not established via navigation — will attempt direct login");
      }
    } catch (navErr) {
      console.log("[Setup] Navigation failed:", navErr);
    }
  }

  // If all session checks fail, attempt direct login via test API
  if (!sessionEstablished) {
    console.log("[Setup] Attempting direct test API login fallback...");
    try {
      const { ADMIN_CREDENTIALS } = await import("./helpers/auth");
      const { TEST_API_HEADERS } = await import("./helpers/test-api");
      const loginResp = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "login",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      if (loginResp.status() === 200) {
        const body = await loginResp.json();
        if (body.success) {
          const loginCookies = loginResp.headers()["set-cookie"];
          const loginSid = loginResp.headers()["x-test-session-id"];
          if (loginCookies && loginSid) {
            const cp = loginCookies.split(";")[0];
            const eqI = cp.indexOf("=");
            const cn = eqI >= 0 ? cp.slice(0, eqI) : cp;
            const cv = eqI >= 0 ? cp.slice(eqI + 1) : "";
            const bu = new URL(loginResp.url());
            const secure = cn.startsWith("__Host-") || cn.startsWith("__Secure-");
            const urlScheme = secure ? "https://" : "http://";
            const origin = `${urlScheme}${bu.host}`;
            await page.context().addCookies([
              {
                name: cn,
                value: cv,
                url: origin,
                httpOnly: true,
                sameSite: "Lax",
                secure,
              },
            ]);
            console.log("[Setup] Direct login fallback succeeded");
            sessionEstablished = true;
          }
        }
      }
    } catch (fallbackErr) {
      console.log("[Setup] Direct login fallback also failed:", fallbackErr);
    }
  }

  // Save storage state even with partial session (downstream tests handle graceful degradation)
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

    // 2. Seed system (creates admin user + session, returns set-cookie)
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

    // 3. Prefer an explicit login after seed so Set-Cookie is always present.
    // Seed now also sets a session cookie, but login is the reliable contract.
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

    // 4. Extract session cookie and save storage state
    await extractAndSaveSession(page, loginResponse, ADMIN_AUTH_FILE);
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
      await extractAndSaveSession(page, loginResponse, targetFile);
    }
  });
});
