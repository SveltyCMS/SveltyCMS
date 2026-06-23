/**
 * @file tests/e2e/routes/config/design-system.spec.ts
 * @description E2E smoke tests for /config/design-system playground.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Design System Playground", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("loads playground controls and component matrices", async ({ page }) => {
    await page.goto("/config/design-system");
    await expect(page.getByRole("heading", { level: 1, name: /design system/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/playground controls/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/semantic palettes/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^appearance$/i })).toBeVisible();
  });

  test("density control updates preview context", async ({ page }) => {
    await page.goto("/config/design-system");
    await page.getByRole("combobox", { name: /^density$/i }).selectOption("compact");
    await expect(page.getByText(/structural tokens/i)).toBeVisible({ timeout: 10_000 });
  });
});
