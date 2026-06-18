/**
 * @file tests/e2e/routes/config/automations.spec.ts
 * @description E2E tests for /config/automations — workflow automation builder.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Automations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with automation list", async ({ page }) => {
    await page.goto("/config/automations");
    await expect(page.getByRole("heading", { name: /automation/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /new|create|add/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can start creating an automation", async ({ page }) => {
    await page.goto("/config/automations");
    const createBtn = page.getByRole("button", { name: /new|create|add/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(page).toHaveURL(/automations/, { timeout: 10_000 });
      await expect(page.getByText(/trigger|event|schedule|when/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("empty state shows guidance", async ({ page }) => {
    await page.goto("/config/automations");
    const emptyState = page.getByText(/no automations|get started|create your first/i);
    const hasItems = page.locator('[class*="card"]').first();
    await expect(emptyState.or(hasItems).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
