/**
 * @file tests/e2e/routes/config/extensions.spec.ts
 * @description E2E for /config/extensions — tabs, plugins grid shell.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function goExtensions(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/extensions", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("page-title")).toContainText(/extension/i);
  await expect(page.getByTestId("extensions-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Extension Management", () => {
  test.setTimeout(90_000);

  test("loads with three tabs and plugins panel", async ({ page }) => {
    await goExtensions(page);
    await expect(page.getByTestId("extensions-tabs")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-plugins")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-widgets")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-themes")).toBeVisible();
    await expect(page.getByTestId("extensions-panel-plugins")).toBeVisible();
    await expect(page.getByTestId("plugins-view")).toBeVisible();
  });

  test("switching tabs updates panel", async ({ page }) => {
    await goExtensions(page);
    await page.getByTestId("extensions-tab-widgets").click();
    await expect(page.getByTestId("extensions-panel-widgets")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("extensions-tab-themes").click();
    await expect(page.getByTestId("extensions-panel-themes")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("extensions-tab-plugins").click();
    await expect(page.getByTestId("extensions-panel-plugins")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("plugins grid or empty state is present", async ({ page }) => {
    await goExtensions(page);
    await expect(
      page.getByTestId("plugins-grid").or(page.getByTestId("plugins-empty")).first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});
