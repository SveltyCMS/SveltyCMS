import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "./helpers/auth";

test.describe("Account Smoke", () => {
  test("admin can open the user profile and logout", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/user", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /user profile/i })).toBeVisible({
      timeout: 10_000,
    });

    await logout(page);
    await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 10_000 });
  });
});
