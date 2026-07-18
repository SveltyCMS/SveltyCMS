/**
 * @file tests/e2e/routes/config/operations.spec.ts
 * @description E2E for operations config pages — monitor, queue (testids + filters).
 * System-settings deep coverage lives in system/settings.spec.ts.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function loginAndGo(page: Page, path: string) {
  await loginAsAdmin(page);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Operations Pages", () => {
  test.setTimeout(90_000);

  test("monitor page loads with stats and service health", async ({ page }) => {
    await loginAndGo(page, "/config/monitor");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("page-title")).toContainText(/monitor/i);
    await expect(page.getByTestId("monitor-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("monitor-stats")).toBeVisible();
    await expect(page.getByTestId("monitor-card-security")).toBeVisible();
    await expect(page.getByTestId("monitor-card-system")).toBeVisible();
    await expect(page.getByTestId("monitor-service-health")).toBeVisible();
    await expect(page.getByTestId("monitor-overall-state")).toBeVisible();
    await expect(page.getByTestId("monitor-link-settings")).toBeVisible();
  });

  test("queue page loads with stats and jobs table", async ({ page }) => {
    await loginAndGo(page, "/config/queue");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("page-title")).toContainText(/queue/i);
    await expect(page.getByTestId("queue-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("queue-stats")).toBeVisible();
    await expect(page.getByTestId("queue-stat-total")).toBeVisible();
    await expect(page.getByTestId("queue-jobs-table")).toBeVisible();
    await expect(page.getByTestId("queue-refresh")).toBeVisible();
    await expect(page.getByTestId("queue-clear-completed")).toBeVisible();
  });

  test("queue status filter updates URL", async ({ page }) => {
    await loginAndGo(page, "/config/queue");
    await expect(page.getByTestId("queue-stat-failed")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.getByTestId("queue-stat-failed").click();
    await expect(page).toHaveURL(/status=failed/, { timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("queue-filter-badge")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("queue-clear-filter").click();
    await expect(page).not.toHaveURL(/status=failed/, { timeout: ACTION_TIMEOUT });
  });

  test("extensions page loads", async ({ page }) => {
    await loginAndGo(page, "/config/extensions");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
