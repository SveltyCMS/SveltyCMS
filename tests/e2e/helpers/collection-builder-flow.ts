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

export async function openNewCollectionEditor(page: Page): Promise<void> {
  await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
  const addBtn = page.getByTestId("add-collection-button").first();
  await stableClick(addBtn, 20_000);
  await page.waitForURL(/\/config\/collectionbuilder\/new/, { timeout: 20_000 });
  await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 10_000 });
}

/**
 * Add an Input widget via the sidebar quick-add tile, open its editor, and set label/name.
 * Relies on stable data-testid attributes (quick-add-input, widget-field-*).
 */
export async function addInputField(
  page: Page,
  options: { label: string; fieldName: string; index?: number },
): Promise<void> {
  const index = options.index ?? 0;

  const widgetsTab = page.getByTestId("tab-widgets");
  await stableClick(widgetsTab, 15_000);

  // Wait for widget sidebar (core widgets load asynchronously after initializeWidgets)
  const quickAdd = page.getByTestId("quick-add-input");
  await expect(quickAdd).toBeVisible({ timeout: 25_000 });
  await stableClick(quickAdd, 15_000);

  const fieldList = page.getByTestId("widget-fields-list");
  const fieldRow = fieldList.getByTestId("widget-field-row").nth(index);
  await expect(fieldRow).toBeVisible({ timeout: 15_000 });
  await expect(fieldRow.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

  // Open editor via field-info button (preferred) or pencil
  const openBtn = fieldRow.getByTestId("widget-field-open");
  if (await openBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await stableClick(openBtn, 10_000);
  } else {
    await stableClick(fieldRow.getByTestId("widget-field-edit"), 10_000);
  }

  const labelInput = page.getByTestId("widget-field-label");
  const nameInput = page.getByTestId("widget-field-name");
  await expect(labelInput).toBeVisible({ timeout: 15_000 });
  await labelInput.fill(options.label);
  await nameInput.fill(options.fieldName);

  await stableClick(page.getByTestId("widget-field-apply"), 10_000);

  // Modal should close; label appears on the canvas row
  await expect(labelInput)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);
  await expect(fieldList.getByText(options.label)).toBeVisible({
    timeout: 15_000,
  });
}

export async function saveCollectionSchema(page: Page): Promise<void> {
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
