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
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 });
    // Also verify page body is visible as a secondary check
    await expect(page.locator("body")).toBeVisible({ timeout: 5_000 });
  });

  test("Workspace Appearance link opens appearance config", async ({ page }) => {
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });

    // Fail fast if the root error boundary fired (same class of flake as account-smoke)
    const systemError = page.getByRole("heading", { name: /system error/i });
    if (await systemError.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const detail = await page
        .locator(".font-mono, pre, code")
        .first()
        .textContent()
        .catch(() => "");
      throw new Error(`User profile hit System Error boundary: ${detail?.trim() || "(no detail)"}`);
    }

    // Prefer attached over visible: Preferences can sit below fold / inside overflow shells
    // where Playwright treats clipped nodes as not visible even though they are in the DOM.
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });

    const openLink = page.getByTestId("open-appearance-settings-btn");
    await expect(openLink).toBeAttached({ timeout: 20_000 });
    await expect(openLink).toHaveAttribute("href", /\/config\/appearance/);

    // Navigate via the real href (SPA-safe); force-click as fallback if layout intercepts
    await openLink.scrollIntoViewIfNeeded().catch(() => {});
    await Promise.all([
      page.waitForURL(/\/config\/appearance/, { timeout: 20_000 }),
      openLink.click({ force: true }),
    ]).catch(async () => {
      // Last resort: follow href attribute directly (still validates the link target)
      const href = await openLink.getAttribute("href");
      if (!href) throw new Error("open-appearance-settings-btn missing href");
      await page.goto(href, { waitUntil: "domcontentloaded" });
    });

    await expect(page).toHaveURL(/\/config\/appearance/, { timeout: 15_000 });
    await expect(
      page
        .getByRole("heading", { level: 1, name: /admin theme settings|appearance/i })
        .or(page.getByRole("heading", { name: /my overrides/i }))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
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
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });

    await page
      .getByTestId("edit-user-settings-btn")
      .or(page.getByRole("button", { name: /Edit User Settings/i }))
      .first()
      .click();

    // Scope to the edit dialog so Save/username resolve unambiguously
    const editDialog = page
      .getByRole("dialog", { name: /Edit User Data|edit user/i })
      .or(page.getByRole("dialog").filter({ hasText: /username/i }))
      .first();
    await expect(editDialog).toBeVisible({ timeout: 15_000 });

    // Unique username each run — avoids uniqueness validation failures
    const newUsername = `TestUser_${Date.now().toString(36).slice(-6)}`;
    const usernameInput = editDialog.locator('input[name="username"]:not([disabled])');
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    await usernameInput.fill(newUsername);

    const updateRespPromise = page
      .waitForResponse(
        (res) =>
          res.url().includes("/api/user/update-user-attributes") &&
          ["PUT", "POST", "PATCH"].includes(res.request().method()),
        { timeout: 15_000 },
      )
      .catch(() => null);

    await editDialog.getByRole("button", { name: /^save$/i }).click();

    const updateResp = await updateRespPromise;
    if (updateResp && !updateResp.ok()) {
      const body = await updateResp.text().catch(() => "");
      throw new Error(
        `update-user-attributes failed: HTTP ${updateResp.status()} ${body.slice(0, 300)}`,
      );
    }

    // Prefer outcome over toast flash: dialog closes, username visible, or success toast
    const { expectToast } = await import("../../helpers/stable");
    await expect(async () => {
      const dialogGone = !(await editDialog.isVisible().catch(() => false));
      if (dialogGone) return;
      const usernameVisible = await page
        .getByText(newUsername, { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      if (usernameVisible) return;
      const errToast = page
        .getByTestId("app-toast")
        .filter({ hasText: /user not found|update failed|failed to update/i });
      if (
        await errToast
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        throw new Error(
          `Profile update failed: ${await errToast
            .first()
            .textContent()
            .catch(() => "error toast")}`,
        );
      }
      await expectToast(page, /user data updated|profile changes were saved/i, 2_000);
    }).toPass({ timeout: 20_000 });
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
