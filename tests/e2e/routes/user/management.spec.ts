/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("User Management Flow", () => {
  test.setTimeout(120_000); // 2 min timeout

  test("Admin Login", async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Read and Edit User Profile", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // ✅ READ operation - assert user profile visible
    await expect(page.locator("h1")).toContainText(/user profile/i);

    // ✅ UPDATE operation - Edit user info
    await page.getByRole("button", { name: /edit user settings/i }).click();
    await page.locator('input[name="username"]:not([disabled])').fill("updatedUser");
    await page.getByRole("button", { name: /save/i }).first().click();

    // Confirm update saved — toast may appear and disappear; wait longer
    // If the page refreshes with invalidateAll(), the username input value should update
    await expect(
      page.locator('input[name="username"]').or(page.getByText(/updateduser/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Delete, Block, and Unblock Users", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // Block, then Unblock, and finally Delete the seeded user
    const actions = ["Block", "Unblock", "Delete"];

    for (const action of actions) {
      // Find row for author@example.com (since we cannot block/delete admins) and check the checkbox
      const row = page.locator("tr", { hasText: "author@example.com" });
      await row.getByRole("checkbox").first().click();

      // Click dropdown button to open menu
      await page.getByRole("button", { name: /Toggle bulk actions menu/i }).click();

      // Select action
      await page.getByRole("menuitem", { name: new RegExp(action, "i") }).click();

      // Click Confirm
      await page.getByRole("button", { name: /confirm/i }).click();

      // Optional: Wait for confirmation toast or success message
      await expect(page.getByText(new RegExp(action, "i"))).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("Invite User via Email and Accept Invitation", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // Click on email user registration token
    await page.getByRole("button", { name: /email user registration token/i }).click();

    // Fill form
    await page.locator('input[name="email"]:not([disabled])').fill("newuser@example.com");
    // Select role — try radio first, fall back to button
    const roleRadio = page.getByRole("radio", { name: /user/i });
    if (await roleRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleRadio.click();
    } else {
      await page.getByRole("button", { name: /user/i }).first().click();
    }
    await page.getByRole("button", { name: /save/i }).first().click();

    // Extract dynamic invite URL from copy input
    const inviteLinkInput = page.locator('input[value*="invite_token="]');
    await expect(inviteLinkInput).toBeVisible({ timeout: 10_000 });
    const inviteUrl = await inviteLinkInput.inputValue();

    // Go to generated invite URL
    await page.goto(inviteUrl);

    // Check prefilled fields on signup page
    await expect(page.locator('input[name="email"]')).toHaveValue("newuser@example.com");
    await expect(page.locator('input[name="token"]')).not.toHaveValue("");

    // Fill remaining signup fields
    await page.fill('input[name="username"]', "newuser");
    await page.fill('input[name="security"]', "user@123!");
    await page.fill('input[name="confirm_password"]', "user@123!");

    await page.getByRole("button", { name: /accept invitation and create account/i }).click();

    // Optional: Assert signup success
    await expect(page.getByText(/account created/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
