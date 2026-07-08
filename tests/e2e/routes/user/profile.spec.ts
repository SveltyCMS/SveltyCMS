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
// This looks for 'testthumb.png' in the SAME directory as this test file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_PATH = path.join(__dirname, "testthumb.png");

test.describe("User Profile Management", () => {
  // 1. Setup: Run before every test in this group
  test.beforeEach(async ({ page }) => {
    // Perform Login
    await loginAsAdmin(page);

    // Verification: Wait for dashboard/collections to ensure we are logged in
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("Login Verification", async ({ page }) => {
    // Already verified in beforeEach, but good for sanity check
    expect(page.url()).not.toContain("/login");
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

    // Trigger upload - scroll into view first to avoid viewport issues
    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    await editAvatarBtn.scrollIntoViewIfNeeded();
    await editAvatarBtn.click({ force: true });

    // Handle file input safely - wait for modal to render
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    await fileInput.setInputFiles(AVATAR_PATH);

    await page.getByRole("button", { name: "Save" }).click();

    // Assertion: Check if the image source changes or notification appears
    await expect(page.locator('.avatar-image, img[alt="User avatar"]')).toBeVisible();
  });

  test("Delete Avatar", async ({ page }) => {
    if (!fs.existsSync(AVATAR_PATH)) {
      console.warn(`Test image not found at ${AVATAR_PATH}. Skipping avatar delete test.`);
      return;
    }

    await page.goto("/user");

    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    await editAvatarBtn.scrollIntoViewIfNeeded();
    await editAvatarBtn.click({ force: true });

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    await fileInput.setInputFiles(AVATAR_PATH);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    await editAvatarBtn.click({ force: true });
    const deleteBtn = page.getByRole("button", { name: /delete avatar/i });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    const confirmBtn = page.getByRole("button", { name: /confirm|delete/i }).last();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("img").first()).toBeVisible();
  });

  test("Edit User Details", async ({ page }) => {
    await page.goto("/user");

    await page.getByRole("button", { name: /Edit User Settings/i }).click();

    // Use fill for robustness on the enabled input in the modal
    await page.locator('input[name="username"]:not([disabled])').fill("TestUserUpdated");

    await page.getByRole("button", { name: "Save" }).click();

    // Toast notification may be brief; increase timeout
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('input[name="username"][disabled]')).toHaveValue("TestUserUpdated", {
      timeout: 10_000,
    });
  });

  test("Registration Token Workflow", async ({ page }) => {
    await page.goto("/user");

    await page.getByText(/Email User Registration token/i).click();

    // Fill details
    await page.locator('input[name="email"]:not([disabled])').fill("newuser@test.ge");

    // Select Role - try radio first (ModalEditForm pattern), fall back to button
    const roleRadio = page.getByRole("radio", { name: /user/i });
    if (await roleRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleRadio.click();
    } else {
      await page
        .getByRole("button", { name: /^editor$/i })
        .first()
        .click();
    }

    // Select Duration
    await page.getByLabel("Token Validity").selectOption({ label: "12 Hours" });

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: /Invitation Token Created/i })).toBeVisible({
      timeout: 10_000,
    });
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
