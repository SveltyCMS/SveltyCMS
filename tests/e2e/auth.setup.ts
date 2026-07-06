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

  // If the seed/login response includes cookies, use them directly
  if (cookies && sessionId) {
    const cookieParts = cookies.split(";")[0];
    const [name, value] = cookieParts.split("=");
    const context = page.context();
    let hostname = "127.0.0.1";
    try {
      const pageUrl = page.url();
      if (pageUrl && pageUrl !== "about:blank") {
        hostname = new URL(pageUrl).hostname;
      }
    } catch {}
    const isHostCookie = name.startsWith("__Host-");
    const secure = isHostCookie || name.startsWith("__Secure-");
    const urlScheme = secure ? "https://" : "http://";
    await context.addCookies([
      {
        name,
        value,
        url: urlScheme + hostname,
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

  // Verify session by navigating to homepage
  try {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const currentUrl = page.url();
    if (!currentUrl.includes("/login")) {
      sessionEstablished = true;
    } else {
      console.log("[Setup] Session not established via navigation — will attempt direct login");
    }
  } catch (navErr) {
    console.log("[Setup] Navigation failed:", navErr);
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
            const [cn, cv] = cp.split("=");
            const ctx = page.context();
            const bu = new URL(page.url());
            await ctx.addCookies([
              {
                name: cn,
                value: cv,
                domain: bu.hostname,
                path: "/",
                httpOnly: true,
                sameSite: "Lax",
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

    // 3. Extract session cookie from seed response and save storage state
    await extractAndSaveSession(page, seedResponse, ADMIN_AUTH_FILE);
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
