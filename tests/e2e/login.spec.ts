/**
 * @file tests/playwright/login.spec.ts
 * @description Playwright end-to-end test for the login and logout flow in SveltyCMS.
 *   - Navigates to the login page
 *   - Performs login with admin credentials
 *   - Verifies successful navigation to the admin area
 *   - Logs out and checks redirect to login page
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout, ADMIN_CREDENTIALS } from "./helpers/auth";

test.describe("Login and Logout Flow", () => {
  // Ensure we start with a clean state for the login test
  test.use({ storageState: { cookies: [], origins: [] } });

  // Seed database before each test to ensure consistent state
  test.beforeEach(async ({ page }) => {
    console.log("[Login Test] Resetting database via Testing API...");
    const resetResponse = await page.request.post("/api/testing", {
      data: { action: "reset" },
    });
    expect(resetResponse.ok()).toBeTruthy();

    console.log("[Login Test] Seeding database with admin@example.com...");
    const seedResponse = await page.request.post("/api/testing", {
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(seedResponse.ok()).toBeTruthy();
  });

  test("should login and logout successfully", async ({ page }) => {
    // Set a higher timeout for this test
    test.setTimeout(120_000); // 2 minutes

    // Use the auth helper to login
    await loginAsAdmin(page);

    // Assert we're logged in and at a valid post-login page
    // Fresh installs redirect to collectionbuilder, existing ones to Collections/admin/dashboard
    await expect(page).toHaveURL(/\/(Collections|admin|dashboard|collectionbuilder)/, {
      timeout: 10_000,
    });
    console.log("✓ Login successful, current URL:", page.url());

    // Click logout
    await logout(page);

    // Assert redirect back to login
    await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 10_000 });
    console.log("✓ Logout successful");
  });
});
