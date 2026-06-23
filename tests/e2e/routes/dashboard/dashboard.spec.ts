/**
 * @file tests/e2e/routes/dashboard/dashboard.spec.ts
 * @description E2E smoke tests for /dashboard — widget grid, add widget, monitoring widgets.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset dashboard preferences so "Add Widget" button is available
    await request.post("/api/system-preferences", {
      headers: { "Content-Type": "application/json" },
      data: {
        key: "dashboard.layout.default",
        value: { id: "default", name: "Default", preferences: [] },
      },
    });
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
    // Use exact match on aria-label="Add Widget" — this button only renders
    // after the widget registry has loaded (availableWidgets.length > 0).
    // The regex /add.*widget/i also matches "Add first widget" in the empty
    // state, which appears before the registry loads and causes a race.
    const addBtn = page.getByRole("button", { name: "Add Widget" }).first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await addBtn.click();
    // Wait for widget registry to load and menu items to appear
    await expect(page.getByRole("menuitem", { name: /cpu usage/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("menuitem", { name: /system health/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can add CPU usage widget to the grid", async ({ page }) => {
    await page.goto("/dashboard");
    const addBtn = page.getByRole("button", { name: "Add Widget" }).first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await addBtn.click();
    // Wait for widget registry to load and menu items to appear
    await expect(page.getByRole("menuitem", { name: /cpu usage/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("menuitem", { name: /cpu usage/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[role="article"][aria-label*="CPU"]')).toBeVisible({
      timeout: 15_000,
    });
  });
});
