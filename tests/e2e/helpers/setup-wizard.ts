/**
 * @file tests/e2e/helpers/setup-wizard.ts
 * @description Robust interaction helpers for the SveltyCMS Setup Wizard.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Seeds localStorage to skip flakiness in the wizard flow.
 */
export async function seedWizardState(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("setupWizard:dbTestPassed", "true");
    window.localStorage.setItem("setupWizard:step", "1");
  });
}

/**
 * Clicks the 'Next' button with robust checks for enablement and visibility.
 */
export async function clickNext(page: Page) {
  const nextBtn = page.getByLabel("Next", { exact: true }).first();

  await expect(nextBtn).toBeVisible({ timeout: 30000 });
  await expect(nextBtn).toBeEnabled({ timeout: 60000 });

  await nextBtn.click({ force: true });
  await page.waitForLoadState("networkidle").catch(() => { });
}

/**
 * Clicks the 'Complete' / 'Finish' button.
 */
export async function clickFinish(page: Page) {
  const finishBtn = page.getByLabel("Complete", { exact: true }).first();
  await expect(finishBtn).toBeVisible({ timeout: 10000 });
  await finishBtn.click();
}

/**
 * Handles common dialogs (e.g., 'Database does not exist, create it?').
 */
export async function handleDialog(page: Page, textMatch: RegExp, action: "yes" | "no" = "yes") {
  const dialog = page
    .locator(".modal, .dialog, [role='dialog']")
    .filter({ hasText: textMatch })
    .first();
  if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    const btnText = action === "yes" ? /yes/i : /no/i;
    await dialog.getByRole("button", { name: btnText }).first().click({ force: true });
  }
}
