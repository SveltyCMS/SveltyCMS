/**
 * @file tests/e2e/routes/collection-builder/confirm-migration.spec.ts
 * @description Migration confirmation contract for the collection editor.
 *
 * A schema change that requires a migration must not be persisted until the
 * user has reviewed the returned plan and explicitly approved it. The editor
 * used to toast "confirm and save again" without re-sending the confirmation
 * flag, so Save could never complete a migration-requiring change.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E | this file (cancel → reload → explicit confirm → reload) |
 * | Unit | `collectionbuilder-utils`, `+page.server.ts` suites |
 */

import { expect, type Page, test } from "@playwright/test";
import { resetAndSeedDatabase } from "../../helpers/api";
import {
  addInputField,
  goToWidgetsTab,
  openNewCollectionEditor,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

test.describe.configure({ mode: "serial", timeout: 180_000 });

const FIELD_LABEL = "Title";
const FIELD_NAME = "title";

/** Open the field inspector for `label` and return its Required switch. */
async function openFieldEditor(page: Page, label: string) {
  await goToWidgetsTab(page);
  const row = page.getByTestId("widget-field-row").filter({ hasText: label }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('div[role="button"]').first().click();

  const requiredSwitch = page.getByTestId("widget-field-required").getByRole("switch");
  await expect(requiredSwitch).toBeVisible({ timeout: 20_000 });
  return requiredSwitch;
}

async function closeFieldEditor(page: Page) {
  await page.getByTestId("widget-field-cancel").click();
  await expect(page.getByTestId("widget-field-cancel")).toBeHidden({ timeout: 10_000 });
}

/** Make the existing field required (or not) and apply the inspector. */
async function setFieldRequired(page: Page, required: boolean) {
  const toggle = await openFieldEditor(page, FIELD_LABEL);
  const checked = (await toggle.getAttribute("aria-checked")) === "true";
  if (checked !== required) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-checked", required ? "true" : "false");

  await page.getByTestId("widget-field-apply").click();
  await expect(page.getByTestId("widget-field-apply")).toBeHidden({ timeout: 15_000 });
}

/**
 * Click the visible, enabled Save control (the sticky bar can clone the testid).
 * No `force`: an obscured Save control is a product bug, not a test workaround.
 */
async function clickSave(page: Page) {
  const enabledButton = page.locator('[data-testid="save-collection-button"]:not([disabled])');
  await expect(enabledButton.first()).toBeVisible({ timeout: 20_000 });
  const candidates = page.locator('[data-testid="save-collection-button"]');
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const button = candidates.nth(i);
    const isEnabled = await button.isEnabled().catch(() => false);
    const isVisible = await button.isVisible().catch(() => false);
    if (isEnabled && isVisible) {
      await button.scrollIntoViewIfNeeded().catch(() => undefined);
      await button.click();
      return;
    }
  }
  throw new Error("No enabled, visible Save button in the collection editor");
}

/** The native confirm modal that renders the returned migration plan. */
function migrationModal(page: Page) {
  return page
    .getByRole("dialog")
    .filter({ hasText: /schema migration required/i })
    .first();
}

test.describe("Collection Builder - migration confirmation", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test("cancel keeps the schema; explicit confirm persists it", async ({ page }) => {
    const fixture = uniqueCollectionFixture("Migr");

    // Baseline: a fresh collection with one field (no drift on first save).
    await openNewCollectionEditor(page);
    const nameInput = page.getByTestId("collection-name-input");
    await nameInput.fill(fixture.name);
    await nameInput.blur();
    await addInputField(page, { label: FIELD_LABEL, fieldName: FIELD_NAME });
    await clickSave(page);
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/edit\//, { timeout: 30_000 });

    // Migration-requiring change: an existing field becomes required.
    await setFieldRequired(page, true);

    await clickSave(page);

    const planModal = migrationModal(page);
    await expect(planModal).toBeVisible({ timeout: 20_000 });
    // The plan itself is reviewed, not just a generic warning.
    await expect(planModal).toContainText(new RegExp(`field "${FIELD_NAME}" is now required`, "i"));

    // Cancel once: nothing may be written.
    await planModal.getByTestId("modal-cancel").click();
    await expect(planModal).toBeHidden({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 20_000 });
    const persisted = await openFieldEditor(page, FIELD_LABEL);
    await expect(persisted).toHaveAttribute("aria-checked", "false");
    await closeFieldEditor(page);

    // Explicit confirmation now applies the migration and persists the schema.
    await setFieldRequired(page, true);
    await clickSave(page);

    const confirmedModal = migrationModal(page);
    await expect(confirmedModal).toBeVisible({ timeout: 20_000 });
    await confirmedModal.getByTestId("modal-confirm").click();
    await expect(page.getByText(/collection saved/i).first()).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 20_000 });
    const confirmed = await openFieldEditor(page, FIELD_LABEL);
    await expect(confirmed).toHaveAttribute("aria-checked", "true");
  });
});
