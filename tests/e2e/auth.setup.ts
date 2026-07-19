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
import { TEST_API_HEADERS } from "./helpers/test-api";
import { applySessionCookie } from "./helpers/test-auth";
import { readFileSync } from "node:fs";

const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
const EDITOR_AUTH_FILE = "tests/e2e/.auth/editor.json";
const AUTHOR_AUTH_FILE = "tests/e2e/.auth/author.json";

/**
 * Extract session cookie from response and apply it to the current context.
 * Prefer applySessionCookie (headersArray + x-test-session-id fallback + port-aware URL).
 * Hard-fail if no session can be established — soft-saving empty state poisons all chromium shards.
 */
async function extractAndSaveSession(page: any, response: any, outputPath: string) {
  let sessionEstablished = await applySessionCookie(page, response);

  // page.request also stores Set-Cookie in the shared jar — verify via cookie list
  if (!sessionEstablished) {
    const cookies = await page.context().cookies();
    sessionEstablished = cookies.some(
      (c: { name: string }) =>
        c.name === "auth_sessions" ||
        c.name === "__Host-auth_sessions" ||
        c.name === "__Secure-auth_sessions",
    );
  }

  // Fallback: seed succeeded but no cookie returned — navigate once
  if (!sessionEstablished) {
    console.log("[Setup] No session cookie yet — navigating to establish session...");
    try {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
      const currentUrl = page.url();
      if (!currentUrl.includes("/login") && !currentUrl.includes("/setup")) {
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
          sessionEstablished = await applySessionCookie(page, loginResp);
          if (sessionEstablished) {
            console.log("[Setup] Direct login fallback succeeded");
          }
        }
      }
    } catch (fallbackErr) {
      console.log("[Setup] Direct login fallback also failed:", fallbackErr);
    }
  }

  // Fail closed: empty storageState causes every chromium test to fail with missing page-title
  if (!sessionEstablished) {
    const jar = await page.context().cookies();
    throw new Error(
      `[Setup] Failed to establish session for ${outputPath}. ` +
        `Cookies in jar: ${jar.map((c: { name: string }) => c.name).join(", ") || "(none)"}. ` +
        `Ensure /api/testing login returns Set-Cookie or x-test-session-id ` +
        `(build with COMPILE_ALL_ADAPTERS=true for production preview).`,
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
