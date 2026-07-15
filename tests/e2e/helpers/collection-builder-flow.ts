/**
 * @file tests/e2e/helpers/collection-builder-flow.ts
 * @description Shared Playwright helpers for Collection Builder E2E flows.
 */

import { expect, type Locator, type Page } from "@playwright/test";

export interface CollectionFixture {
  name: string;
  slug: string;
}

export function uniqueCollectionFixture(prefix = "E2E_Col"): CollectionFixture {
  const runId = Date.now().toString(36);
  const name = `${prefix}_${runId}`;
  return { name, slug: name.toLowerCase().replace(/ /g, "_") };
}

/** Click after the control is visible/enabled; force as last resort (overlays). */
async function stableClick(locator: Locator, timeout = 15_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout });
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await locator.click({ timeout: Math.min(timeout, 10_000) });
  } catch {
    await locator.click({ force: true, timeout: 5_000 });
  }
}

/**
 * Close open modal dialogs that intercept pointer events (e.g. "Add New Field").
 * CI failures often show: dialog intercepts pointer events while clicking sidebar tiles.
 */
async function dismissOpenDialogs(page: Page): Promise<void> {
  const dialog = page.locator("dialog[open]");
  if (
    !(await dialog
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false))
  ) {
    return;
  }

  // Prefer explicit close control inside the open dialog
  const closeBtn = dialog
    .first()
    .getByRole("button", { name: /close|cancel|dismiss/i })
    .first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click({ force: true }).catch(() => undefined);
  } else {
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  await expect(dialog.first())
    .toBeHidden({ timeout: 5_000 })
    .catch(() => undefined);
}

export async function openNewCollectionEditor(page: Page): Promise<void> {
  await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
  const addBtn = page.getByTestId("add-collection-button").first();
  await stableClick(addBtn, 20_000);
  await page.waitForURL(/\/config\/collectionbuilder\/new/, { timeout: 20_000 });
  await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 10_000 });
}

/**
 * Add an Input field via the sidebar quick-add tile (preferred), with a modal fallback.
 *
 * Never use page-level getByRole('button', /Input/) while "Add New Field" may be open —
 * that resolves the sidebar tile behind the dialog and fails with "intercepts pointer events".
 */
export async function addInputField(
  page: Page,
  options: { label: string; fieldName: string; index?: number },
): Promise<void> {
  const index = options.index ?? 0;

  const widgetsTab = page.getByTestId("tab-widgets");
  await stableClick(widgetsTab, 15_000);

  // Clear any leftover modal from a prior action / parallel flakiness
  await dismissOpenDialogs(page);

  const fieldList = page.getByTestId("widget-fields-list");
  const quickAdd = page.getByTestId("quick-add-input");
  const addFieldBtn = page.getByTestId("add-field-button");

  // Preferred: sidebar tile (no modal)
  if (await quickAdd.isVisible({ timeout: 20_000 }).catch(() => false)) {
    await stableClick(quickAdd, 15_000);
  } else if (await addFieldBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Fallback: "Add Widget" → select Input inside the dialog only
    await stableClick(addFieldBtn, 10_000);
    const dialog = page.getByRole("dialog", { name: /add new field/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const pick = dialog
      .getByTestId("select-widget-input")
      .or(dialog.getByRole("button", { name: /^input$/i }));
    await stableClick(pick.first(), 10_000);
    // Selecting from modal opens the field editor immediately for new fields
  } else {
    throw new Error("Neither quick-add-input nor add-field-button is visible on the Widgets tab");
  }

  // If field was added via sidebar, open its row editor; modal path may already show the form
  const labelInput = page.getByTestId("widget-field-label");
  const editorOpen = await labelInput.isVisible({ timeout: 3_000 }).catch(() => false);

  if (!editorOpen) {
    const fieldRow = fieldList.getByTestId("widget-field-row").nth(index);
    await expect(fieldRow).toBeVisible({ timeout: 15_000 });
    await expect(fieldRow.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

    const openBtn = fieldRow.getByTestId("widget-field-open");
    if (await openBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stableClick(openBtn, 10_000);
    } else {
      await stableClick(fieldRow.getByTestId("widget-field-edit"), 10_000);
    }
  }

  await expect(labelInput).toBeVisible({ timeout: 15_000 });
  await labelInput.fill(options.label);
  await page.getByTestId("widget-field-name").fill(options.fieldName);
  await stableClick(page.getByTestId("widget-field-apply"), 10_000);

  await expect(labelInput)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);
  await expect(fieldList.getByText(options.label)).toBeVisible({
    timeout: 15_000,
  });
}

export async function saveCollectionSchema(page: Page): Promise<void> {
  await dismissOpenDialogs(page);
  await stableClick(page.getByTestId("save-collection-button").first(), 10_000);
  await expect(page.getByText(/collection saved/i)).toBeVisible({ timeout: 15_000 });
}

export async function openCollectionEntries(page: Page, slug: string): Promise<void> {
  await page.goto(`/en/collection/${slug}`, { waitUntil: "domcontentloaded" });
}

export async function createEntryWithNames(
  page: Page,
  firstName: string,
  lastName: string,
): Promise<void> {
  const createBtn = page.getByTestId("entry-list-action-create");
  if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await stableClick(createBtn, 10_000);
  } else {
    await page
      .getByRole("button", { name: /create/i })
      .first()
      .click({ force: true });
  }

  await page.getByRole("textbox", { name: "First Name" }).fill(firstName);
  await page.getByRole("textbox", { name: "Last Name" }).fill(lastName);
  await page.getByRole("button", { name: /save/i }).first().click();
}
