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
  expect(cookies).toBeTruthy();
  expect(sessionId).toBeTruthy();

  // Parse the set-cookie header manually
  const cookieParts = cookies.split(";")[0]; // name=value
  const [name, value] = cookieParts.split("=");

  // Apply cookie to the context
  // Use response.url() instead of page.url() because the page hasn't
  // navigated anywhere yet (page.url() may be about:blank with no hostname).
  const context = page.context();
  const responseUrl = new URL(response.url());
  await context.addCookies([
    {
      name,
      value,
      url: responseUrl.origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Navigate to dashboard to verify auth works and capture full storage state
  try {
    await page.goto("/", { waitUntil: "load", timeout: 15_000 });
  } catch (e) {
    console.log(`[Setup] goto("/") failed: ${e}`);
  }
  console.log(`[Setup] URL after goto: ${page.url()}`);
  try {
    console.log(`[Setup] Page title: ${await page.title()}`);
  } catch {
    console.log(`[Setup] Page title unavailable`);
  }

  // Verify we landed on an authenticated page (not /login)
  const currentUrl = page.url();
  expect(currentUrl).not.toContain("/login");

  // Save storage state for downstream tests
  await context.storageState({ path: outputPath });
  console.log(`[Setup] Storage state saved to ${outputPath}`);
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
