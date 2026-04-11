import { test as setup, expect } from "@playwright/test";
import { loginAsAdmin, ADMIN_CREDENTIALS } from "./helpers/auth";
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

    if (!resetResponse.ok()) {
      const errorBody = await resetResponse.text();
      console.error(`[Setup] Reset failed with status ${resetResponse.status()}: ${errorBody}`);
    }
    expect(resetResponse.ok()).toBeTruthy();

    // 2. Seed system via Testing API with explicit credentials
    console.log(`[Setup] Seeding database with ${ADMIN_CREDENTIALS.email}...`);
    const seedResponse = await page.request.post("/api/testing", {
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });

    if (!seedResponse.ok()) {
      const errorBody = await seedResponse.text();
      console.error(`[Setup] Seeding failed with status ${seedResponse.status()}: ${errorBody}`);
    }
    expect(seedResponse.ok()).toBeTruthy();

    // 3. Perform login
    await loginAsAdmin(page);

    // 4. Save admin storage state
    await page.context().storageState({ path: ADMIN_AUTH_FILE });
  });

  setup("provision editor and author via invite flow", async ({ page }) => {
    // This depends on the admin.json created in the previous setup test
    const adminState = JSON.parse(readFileSync(ADMIN_AUTH_FILE, "utf-8"));
    await page.context().addCookies(adminState.cookies);

    const roles = ["Editor", "Author"];
    for (const role of roles) {
      console.log(`[Setup] Inviting ${role}...`);
      const signupResponse = await page.request.post("/api/testing", {
        data: {
          action: "create-user",
          email: `${role.toLowerCase()}@example.com`,
          password: "Password123!",
          role: role,
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
      await page.goto("/login");
      await page.getByPlaceholder(/email/i).fill(`${role.toLowerCase()}@example.com`);
      await page.getByPlaceholder(/password/i).fill("Password123!");
      await page.getByRole("button", { name: /sign in/i }).click();

      const targetFile = role === "Editor" ? EDITOR_AUTH_FILE : AUTHOR_AUTH_FILE;
      await page.context().storageState({ path: targetFile });
      console.log(`[Setup] Saved ${role} state to ${targetFile}`);
    }
  });
});
