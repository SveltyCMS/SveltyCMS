/**
 * @file tests/e2e/auth.setup.ts
 * @description Authentication setup for Playwright E2E tests
 */

import { test as setup, expect } from "@playwright/test";
import { loginAsAdmin, loginAs, ADMIN_CREDENTIALS } from "./helpers/auth";
import { readFileSync } from "node:fs";
import { TEST_API_HEADERS } from "./helpers/test-api";

const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
const EDITOR_AUTH_FILE = "tests/e2e/.auth/editor.json";
const AUTHOR_AUTH_FILE = "tests/e2e/.auth/author.json";

setup.describe("E2E Role-Based Setup", () => {
  setup("authenticate as admin", async ({ page }) => {
    // 1. Reset Database for a clean slate
    console.log("[Setup] Resetting database via Testing API...");
    const resetResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    expect(resetResponse.status()).toBe(200);

    // 2. Seed system
    console.log(`[Setup] Seeding database with ${ADMIN_CREDENTIALS.email}...`);
    const seedResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(seedResponse.status()).toBe(200);

    // 3. Perform login
    await loginAsAdmin(page);

    // 4. Save admin storage state
    await page.context().storageState({ path: ADMIN_AUTH_FILE });
  });

  setup("provision editor and author via invite flow", async ({ page }) => {
    const adminState = JSON.parse(readFileSync(ADMIN_AUTH_FILE, "utf-8"));
    await page.context().addCookies(adminState.cookies);

    const roles = ["editor", "developer"];
    for (const role of roles) {
      console.log(`[Setup] Inviting ${role}...`);
      const email = `${role}@example.com`;
      const password = "Password123!";

      const signupResponse = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "create-user",
          email,
          password,
          role,
        },
      });

      if (!signupResponse.ok()) {
        const errorBody = await signupResponse.text();
        console.error(
          `[Setup] Create user failed with status ${signupResponse.status()}: ${errorBody}`,
        );
      }
      expect(signupResponse.ok()).toBeTruthy();

      // Login as the new user to capture their state
      await loginAs(page, email, password);

      const targetFile = role === "editor" ? EDITOR_AUTH_FILE : AUTHOR_AUTH_FILE;
      // Developer uses author auth file for backward compat with tests referencing author@example.com
      await page.context().storageState({ path: targetFile });
    }
  });
});
