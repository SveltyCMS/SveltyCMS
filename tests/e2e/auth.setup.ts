import { test as setup, expect } from "@playwright/test";
import { loginAs, ADMIN_CREDENTIALS } from "./helpers/auth";
import { readFileSync } from "node:fs";

const ADMIN_AUTH_FILE = "tests/e2e/.auth/admin.json";
const EDITOR_AUTH_FILE = "tests/e2e/.auth/editor.json";
const AUTHOR_AUTH_FILE = "tests/e2e/.auth/author.json";

setup.describe("E2E Role-Based Setup", () => {
  setup("authenticate as admin", async ({ page }) => {
    // 1. Reset Database for a clean slate
    console.log("[Setup] Resetting database via Testing API...");
    const resetResponse = await page.request.post("/api/testing", {
      data: { action: "reset" },
    });
    expect(resetResponse.status()).toBe(200);

    // 2. Seed system
    console.log(`[Setup] Seeding database with ${ADMIN_CREDENTIALS.email}...`);
    const seedResponse = await page.request.post("/api/testing", {
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(seedResponse.status()).toBe(200);

    // 3. Perform login
    await loginAs(page);

    // 4. Save admin storage state
    await page.context().storageState({ path: ADMIN_AUTH_FILE });
  });

  setup("provision editor and author via invite flow", async ({ page }) => {
    const adminState = JSON.parse(readFileSync(ADMIN_AUTH_FILE, "utf-8"));
    await page.context().addCookies(adminState.cookies);

    const roles = ["Editor", "Author"];
    for (const role of roles) {
      console.log(`[Setup] Inviting ${role}...`);
      const email = `${role.toLowerCase()}@example.com`;
      const password = "Password123!";

      const signupResponse = await page.request.post("/api/testing", {
        data: {
          action: "create-user",
          email,
          password,
          role,
        },
      });
      expect(signupResponse.status()).toBe(200);

      // Login as user to capture state
      await loginAs(page, { email, password });

      const targetFile = role === "Editor" ? EDITOR_AUTH_FILE : AUTHOR_AUTH_FILE;
      await page.context().storageState({ path: targetFile });
    }
  });
});
