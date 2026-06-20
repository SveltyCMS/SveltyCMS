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
    await expect(page.getByRole("heading", { level: 1, name: /monitor/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/service|health|status|security/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("queue page loads with job list", async ({ page }) => {
    await page.goto("/config/queue");
    await expect(page.getByRole("heading", { level: 1, name: /queue|job/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/job|queue|pending|completed|total/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("extensions page loads with tabs", async ({ page }) => {
    await page.goto("/config/extensions");
    await expect(page.getByRole("heading", { level: 1, name: /extension/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/plugin|widget|theme/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("system settings page loads", async ({ page }) => {
    await page.goto("/config/system-settings?group=cache");
    await expect(page.getByRole("heading", { level: 1, name: /settings/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/cache|repair|system/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
