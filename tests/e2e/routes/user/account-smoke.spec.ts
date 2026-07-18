/**
 * @file tests/e2e/routes/user/account-smoke.spec.ts
 * @description Smoke: admin can open profile and logout.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "../../helpers/auth";

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
});
