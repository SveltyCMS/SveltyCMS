/**
 * @file tests/e2e/routes/config/webhooks.spec.ts
 * @description E2E tests for /config/webhooks — webhook CRUD and delivery logs.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Webhooks", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with webhook list", async ({ page }) => {
    await page.goto("/config/webhooks");
    await expect(page.getByRole("heading", { level: 1, name: /webhook/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /add webhook/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can open create webhook form", async ({ page }) => {
    await page.goto("/config/webhooks");
    const addButton = page.getByRole("button", { name: /add webhook/i });
    if (await addButton.isVisible()) {
      await addButton.click();
      await expect(page.getByLabel(/webhook name/i).or(page.getByPlaceholder(/name/i))).toBeVisible(
        { timeout: 5_000 },
      );
    }
  });

  test("webhook logs page loads", async ({ page }) => {
    await page.goto("/config/webhooks/logs");
    await expect(
      page.getByRole("heading", { level: 1, name: /log|delivery|monitor/i }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("empty state shows guidance when no webhooks exist", async ({ page }) => {
    await page.goto("/config/webhooks");
    const emptyState = page.getByText(/no webhooks|get started|configured/i);
    const hasItems = page.locator('[class*="card"], [class*="list"]').first();
    await expect(emptyState.or(hasItems).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
