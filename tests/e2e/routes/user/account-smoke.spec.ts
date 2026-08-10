/**
 * @file tests/e2e/routes/user/account-smoke.spec.ts
 * @description Smoke: admin can open profile, update display name (persists across reload), and logout.
 */

import { expect, test } from "@playwright/test";
import { ADMIN_CREDENTIALS, loginAsAdmin, logout } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/api";
import {
  goToUserPage,
  openEditUserDialog,
  openIdentityTab,
  USER_ACTION_TIMEOUT,
} from "../../helpers/user-page";

test.describe("Account Smoke", () => {
  test("admin can open the user profile and logout", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/user");
    }
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);

    // Fail fast with a clear signal if the root error boundary fired
    const systemError = page.getByRole("heading", { name: /system error/i });
    if (await systemError.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const detail = await page
        .locator(".font-mono, pre, code")
        .first()
        .textContent()
        .catch(() => "");
      throw new Error(`User profile hit System Error boundary: ${detail?.trim() || "(no detail)"}`);
    }

    // Prefer page-title; fall back to any user-profile content
    const pageTitle = page.getByTestId("page-title");
    if (await pageTitle.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(pageTitle).toContainText(/user profile|benutzerprofil|user/i);
    } else {
      await expect(
        page.getByRole("heading", { name: /user profile|identity|profile/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
    await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 15_000 });
  });

  test("admin can update display name and it persists across reload", async ({ page }) => {
    // Deterministic baseline: re-seed the admin fixture with the known username so
    // the journey starts from a stable state regardless of prior spec mutations.
    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
        username: "admin",
        role: "admin",
      },
    });
    await loginAsAdmin(page);
    await goToUserPage(page);
    await openIdentityTab(page);

    const originalUsername =
      (await page.getByTestId("profile-username").textContent())?.trim() || "admin";
    const newUsername = `E2E_Smoke_${Date.now().toString(36).slice(-6)}`;

    try {
      const dialog = await openEditUserDialog(page);
      const usernameInput = dialog.locator('input[name="username"]:not([disabled])');
      await expect(usernameInput).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
      await usernameInput.fill(newUsername);
      await dialog.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText(/user data updated/i)).toBeVisible({
        timeout: USER_ACTION_TIMEOUT,
      });

      // Reload and assert the updated name is rendered from server data.
      await goToUserPage(page);
      await expect(page.getByTestId("profile-username")).toHaveText(newUsername, {
        timeout: USER_ACTION_TIMEOUT,
      });
    } finally {
      // Revert the display name so the admin fixture stays stable for other specs.
      try {
        await goToUserPage(page);
        await openIdentityTab(page);
        const dialog = await openEditUserDialog(page);
        const usernameInput = dialog.locator('input[name="username"]:not([disabled])');
        await usernameInput.fill(originalUsername);
        await dialog.getByRole("button", { name: /^save$/i }).click();
        await expect(page.getByText(/user data updated/i)).toBeVisible({
          timeout: USER_ACTION_TIMEOUT,
        });
      } catch (err) {
        console.warn("[account-smoke] display-name revert failed:", err);
      }
    }
  });
});
