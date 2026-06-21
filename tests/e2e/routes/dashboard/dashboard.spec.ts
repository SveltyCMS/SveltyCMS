/**
 * @file tests/e2e/routes/dashboard/dashboard.spec.ts
 * @description E2E smoke tests for /dashboard — widget grid, add widget, monitoring widgets.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with dashboard shell", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /dashboard/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("grid").or(page.getByText(/your dashboard is empty/i))).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test("add widget menu lists monitoring widgets", async ({ page }) => {
    await page.goto("/dashboard");
    const addBtn = page.getByRole("button", { name: /add widget/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await expect(page.getByRole("menuitem", { name: /cpu usage/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("menuitem", { name: /system health/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can add CPU usage widget to the grid", async ({ page }) => {
    await page.goto("/dashboard");
    const addBtn = page.getByRole("button", { name: /add widget/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await page.getByRole("menuitem", { name: /cpu usage/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[role="article"][aria-label*="CPU"]')).toBeVisible({
      timeout: 15_000,
    });
  });
});
