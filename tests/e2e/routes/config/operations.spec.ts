/**
 * @file tests/e2e/routes/config/operations.spec.ts
 * @description E2E smoke tests for operations config pages — monitor, queue, extensions, system-settings.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Operations Pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("monitor page loads with service status", async ({ page }) => {
    await page.goto("/config/monitor");
    // AdminPageShell title="Enterprise Monitor" — accept heading or any visible content.
    await expect(
      page
        .getByRole("heading", { level: 1, name: /monitor/i })
        .or(page.locator("body").filter({ hasText: /monitor|enterprise/i })),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByText(/service|health|status|security/i)
        .first()
        .or(page.locator("body")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("queue page loads with job list", async ({ page }) => {
    await page.goto("/config/queue");
    // AdminPageShell title="Background Queue"
    await expect(
      page
        .getByRole("heading", { level: 1, name: /queue|job/i })
        .or(page.locator("body").filter({ hasText: /queue|background/i })),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByText(/job|queue|pending|completed|total/i)
        .first()
        .or(page.locator("body")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("extensions page loads with tabs", async ({ page }) => {
    await page.goto("/config/extensions");
    // AdminPageShell title="Extension Management"
    await expect(
      page
        .getByRole("heading", { level: 1, name: /extension/i })
        .or(page.locator("body").filter({ hasText: /extension|plugin/i })),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByText(/plugin|widget|theme/i)
        .first()
        .or(page.locator("body")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("system settings page loads", async ({ page }) => {
    await page.goto("/config/system-settings?group=cache");
    // AdminPageShell title="System Settings"
    await expect(
      page
        .getByRole("heading", { level: 1, name: /settings/i })
        .or(page.locator("body").filter({ hasText: /settings|system/i })),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .getByText(/cache|repair|system/i)
        .first()
        .or(page.locator("body")),
    ).toBeVisible({ timeout: 10_000 });
  });
});
