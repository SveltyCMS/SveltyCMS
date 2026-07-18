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
  await expect(page).toHaveURL(/\/config\/appearance/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  const title = page.getByTestId("page-title");
  if (await title.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await expect(title).toContainText(/admin theme|appearance|theme/i);
  } else {
    await expect(
      page.getByRole("heading", { name: /admin theme|appearance|theme/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  // Layout prefs are the stable contract for this page
  const leftSidebar = page.locator("#layout-pref-leftSidebar");
  if (await leftSidebar.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await expect(leftSidebar).toBeEnabled({ timeout: 5_000 });
  } else {
    // Soft fallback: page body mentions overrides / layout
    await expect(page.getByText(/my overrides|my layout|theme/i).first()).toBeVisible({
      timeout: 10_000,
    });
  }
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
