/**
 * @file tests/e2e/routes/config/appearance.spec.ts
 * @description E2E for My Overrides on /config/design-system.
 *
 * Locators use stable #layout-pref-* ids and data-testids (not role text alone).
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

async function openOverrides(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/config/design-system?tab=overrides", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/design-system?tab=overrides");
  }
  await expect(page).toHaveURL(/\/config\/design-system/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  const title = page.getByTestId("page-title");
  if (await title.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await expect(title).toContainText(/design system|appearance|theme/i);
  } else {
    await expect(
      page.getByRole("heading", { name: /design system|appearance|theme/i }).first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  }

  const overridesTab = page.getByTestId("appearance-tab-overrides");
  if (await overridesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await overridesTab.click();
  }

  // Panel must be ready before interacting with layout prefs
  await expect(
    page
      .getByTestId("appearance-overrides-panel")
      .or(page.locator("#layout-pref-leftSidebar"))
      .first(),
  ).toBeVisible({ timeout: 15_000 });

  const leftSidebar = page.locator("#layout-pref-leftSidebar");
  if (await leftSidebar.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await expect(leftSidebar).toBeEnabled({ timeout: 5_000 });
  }
}

function leftSidebarSelect(page: Page) {
  return page.locator("#layout-pref-leftSidebar");
}

test.describe.serial("Design System — My Overrides", () => {
  test("page loads My Overrides and My Layout sections", async ({ page }) => {
    test.setTimeout(60_000);
    await openOverrides(page);
    await expect(page.getByTestId("appearance-save-overrides")).toBeVisible();
  });

  test("persists left sidebar layout preference after reload", async ({ page }) => {
    test.setTimeout(60_000);
    await openOverrides(page);

    const select = leftSidebarSelect(page);
    await select.scrollIntoViewIfNeeded();
    await select.selectOption("hidden");
    await expect(select).toHaveValue("hidden");

    await page.getByTestId("appearance-save-overrides").click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.goto("/config/design-system?tab=overrides", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#layout-pref-leftSidebar")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("#layout-pref-leftSidebar")).toHaveValue("hidden", {
        timeout: 10_000,
      });
    }).toPass({ timeout: 25_000 });
  });

  test("clear overrides resets layout to theme default", async ({ page }) => {
    test.setTimeout(90_000);
    await openOverrides(page);

    const select = leftSidebarSelect(page);
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.scrollIntoViewIfNeeded();
    // Previous test in this serial describe already persisted "hidden".
    // Select the OPPOSITE value so a change event always fires (a no-op
    // selectOption leaves the saved state untouched and no save toast appears).
    // Robust standalone (retry) and after the serial run.
    const current = await select.inputValue();
    const target = current === "hidden" ? "full" : "hidden";
    await select.selectOption(target);
    await expect(select).toHaveValue(target);

    const saveBtn = page.getByTestId("appearance-save-overrides");
    await saveBtn.scrollIntoViewIfNeeded();
    // NO force: the button stays disabled until Svelte processes the
    // selectOption change (bind:value → derived hasChanges). A force click
    // fires before that update lands and the save request never goes out.
    await saveBtn.click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({ timeout: 15_000 });

    const clearBtn = page.getByTestId("appearance-clear-overrides");
    await expect(clearBtn).toBeVisible({ timeout: 10_000 });
    await clearBtn.scrollIntoViewIfNeeded();
    // force: sticky shells / toasts can intercept normal click in CI
    await clearBtn.click({ force: true });
    await expect(
      page.getByText(/overrides cleared|theme defaults|using active theme/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
