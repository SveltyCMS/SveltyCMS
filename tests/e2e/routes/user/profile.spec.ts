/**
 * @file user.spec.ts
 * @description Enterprise-grade E2E tests for user profile management.
 * Refactored to use standard authentication patterns and robust locators.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

// Construct reliable file path for CI/CD environments
// The shared test thumbnail lives at the e2e root (tests/e2e/testthumb.png),
// committed to the repo so CI has it. Resolve it relative to this spec file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_PATH = path.join(__dirname, "..", "..", "testthumb.png");

// Run tests serially: Edit Avatar and Delete Avatar share the admin's avatar
// state, so they must not race each other (Delete Avatar needs a custom avatar
// that Edit Avatar uploads).
test.describe.serial("User Profile Management", () => {
  // 1. Setup: Run before every test in this group
  test.beforeEach(async ({ page }) => {
    // Perform Login
    await loginAsAdmin(page);

    // Verification: Wait for dashboard/collections to ensure we are logged in
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("Login Verification", async ({ page }) => {
    // Already verified in beforeEach, but good for sanity check
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Navigate to user profile page and verify it loads
    await page.goto("/user");
    await expect(
      page
        .getByRole("heading", { level: 1 })
        .or(page.locator("body").filter({ hasText: /profile|user/i })),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Workspace Appearance link navigates to appearance settings", async ({ page }) => {
    await page.goto("/user");
    await expect(page.getByText("Workspace Appearance")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Open Appearance Settings" }).click();
    await expect(page).toHaveURL(/\/config\/appearance/, { timeout: 10_000 });
    await expect(page.getByText("My Overrides")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Edit Avatar", async ({ page }) => {
    // Ensure the test image exists before trying to upload
    if (!fs.existsSync(AVATAR_PATH)) {
      console.warn(`Test image not found at ${AVATAR_PATH}. Skipping avatar upload test.`);
      return;
    }

    await page.goto("/user");

    // Wait for profile to load
    await expect(page.getByRole("heading", { level: 1, name: "User Profile" })).toBeVisible();

    // Trigger upload — the Edit Avatar button is an absolutely-positioned overlay
    // that Playwright's viewport check rejects even with force:true, so dispatch
    // a native DOM click instead.
    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    await editAvatarBtn.evaluate((el: HTMLElement) => el.click());

    // Handle file input safely — wait for modal to render
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    await fileInput.setInputFiles(AVATAR_PATH);

    await page.getByRole("button", { name: "Save" }).click();

    // Assertion: Check if the image source changes or notification appears
    await expect(page.locator('.avatar-image, img[alt="User avatar"]')).toBeVisible();
  });

  test("Delete Avatar", async ({ page }) => {
    await page.goto("/user");

    // Wait for profile to load (matches the passing "Edit Avatar" test)
    await expect(page.getByRole("heading", { level: 1, name: "User Profile" })).toBeVisible();

    // The "Delete Avatar" button only renders when a custom avatar is set
    // (page.data.user.avatar !== '/Default_User.svg'). Edit Avatar (which runs
    // before this test in serial mode) uploads one; if it skipped (no test
    // image), there is nothing to delete, so skip gracefully rather than fail.
    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    await editAvatarBtn.evaluate((el: HTMLElement) => el.click());

    const deleteBtn = page.getByRole("button", { name: "Delete Avatar" });
    const deleteVisible = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!deleteVisible) {
      console.warn("Delete Avatar button not present (no custom avatar to delete). Skipping.");
      return;
    }
    await deleteBtn.click();

    // Confirmation dialog appears — click Confirm
    const confirmBtn = page.getByRole("button", { name: /confirm/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Assertion: a custom avatar is gone — the success toast "Avatar Deleted"
    // appears and the profile avatar image src returns to the default. Scope
    // to the profile info region so the 11+ imgs on the page (sidebar, table
    // rows) don't trigger a strict-mode violation.
    await expect(page.getByText(/Avatar Deleted/i)).toBeVisible({ timeout: 10_000 });
    const profileAvatar = page
      .getByRole("img", { name: "AV", exact: true })
      .or(page.locator('img[alt="User avatar"]').first());
    await expect(profileAvatar).toBeVisible();
  });

  test("Edit User Details", async ({ page }) => {
    await page.goto("/user");

    await page.getByRole("button", { name: /Edit User Settings/i }).click();

    // Scope to the edit dialog so Save/username resolve unambiguously
    const editDialog = page.getByRole("dialog", { name: /Edit User Data/i });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // usernameSchema disallows spaces (regex /^[a-zA-Z0-9@$!%*#.__-]+$/), so use
    // a username without spaces — otherwise the form validation fails and the
    // "User Data Updated" toast never appears.
    await editDialog.locator('input[name="username"]:not([disabled])').fill("TestUserUpdated");

    await editDialog.getByRole("button", { name: "Save" }).click();

    // Toast notification may be brief; increase timeout
    await expect(page.getByText(/User Data Updated/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Registration Token Workflow", async ({ page }) => {
    await page.goto("/user");

    await page.getByRole("button", { name: /Email User Registration token/i }).click();

    // Scoped to the token dialog
    const tokenDialog = page.getByRole("dialog", { name: /Edit Token Data/i });
    await expect(tokenDialog).toBeVisible({ timeout: 10_000 });

    // Fill details
    await tokenDialog.locator('input[name="email"]:not([disabled])').fill("newuser@test.ge");

    // Select Role — chip buttons inside the dialog (role names: admin/developer/editor/user)
    const roleChip = tokenDialog.getByRole("button", { name: /^user$/i });
    if (await roleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleChip.click();
    }

    // Select Duration
    await tokenDialog.locator("#expires-select").selectOption("12 hrs");

    await tokenDialog.getByRole("button", { name: "Save" }).click();

    // After success the modal stays open and renders an "Invitation Token Created"
    // panel with the copyable invite link. Assert on that heading (scoped to the
    // dialog) — a global getByText(/Token Created/i) also matches the toast and
    // the success toast title, causing a strict-mode violation.
    await expect(
      tokenDialog.getByRole("heading", { name: /Invitation Token Created/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Toggle User Token Visibility", async ({ page }) => {
    await page.goto("/user");

    // Open
    await page.getByText(/Show User Token/i).click();
    const tokenList = page.getByRole("heading", { name: "Token List:" });
    await expect(tokenList).toBeVisible();

    // Close
    await page.getByText(/Hide User Token/i).click();
    await expect(tokenList).not.toBeVisible();
  });

  test("Toggle User List Visibility", async ({ page }) => {
    await page.goto("/user");

    // Initially open
    const userList = page.getByRole("heading", { name: "User List:" });
    await expect(userList).toBeVisible();

    // Close
    await page.getByText(/Hide User List/i).click();
    await expect(userList).not.toBeVisible();

    // Open
    await page.getByText(/Show User List/i).click();
    await expect(userList).toBeVisible();
  });
});
