/**
 * @file tests/e2e/routes/config/appearance.spec.ts
 * @description E2E tests for /config/appearance — per-user overrides and layout prefs (Phase 5).
 *
 * Locators use stable #layout-pref-* ids (not getByLabel alone) so we do not
 * race page load or collide with aside[aria-label="Left sidebar navigation"].
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

async function openAppearancePage(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/config/appearance", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /admin theme settings/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { level: 3, name: /my overrides/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { level: 4, name: /my layout/i })).toBeVisible({
    timeout: 15_000,
  });
  // Stable select id from appearance +page.svelte
  await expect(page.locator("#layout-pref-leftSidebar")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#layout-pref-leftSidebar")).toBeEnabled({ timeout: 5_000 });
}

function leftSidebarSelect(page: Page) {
  return page.locator("#layout-pref-leftSidebar");
}

test.describe.serial("Appearance — My Overrides", () => {
  test("page loads My Overrides and My Layout sections", async ({ page }) => {
    test.setTimeout(60_000);
    await openAppearancePage(page);
    await expect(page.getByRole("button", { name: /save my preferences/i })).toBeVisible();
  });

  test("persists left sidebar layout preference after reload", async ({ page }) => {
    test.setTimeout(60_000);
    await openAppearancePage(page);

    const select = leftSidebarSelect(page);
    await select.scrollIntoViewIfNeeded();
    await select.selectOption("hidden");
    await expect(select).toHaveValue("hidden");

    await page.getByRole("button", { name: /save my preferences/i }).click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#layout-pref-leftSidebar")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#layout-pref-leftSidebar")).toHaveValue("hidden", {
      timeout: 15_000,
    });
  });

  test("clear overrides resets layout to theme default", async ({ page }) => {
    test.setTimeout(60_000);
    await openAppearancePage(page);

    const select = leftSidebarSelect(page);
    await select.scrollIntoViewIfNeeded();
    await select.selectOption("hidden");
    await page.getByRole("button", { name: /save my preferences/i }).click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /clear overrides/i }).click();
    await expect(page.getByText(/overrides cleared/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(leftSidebarSelect(page)).toHaveValue("", {
      timeout: 15_000,
    });
  });
});
