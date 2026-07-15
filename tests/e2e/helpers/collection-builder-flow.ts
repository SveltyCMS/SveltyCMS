/**
 * @file tests/e2e/helpers/collection-builder-flow.ts
 * @description Shared Playwright helpers for Collection Builder E2E flows.
 */

import { expect, type Page } from "@playwright/test";

export interface CollectionFixture {
  name: string;
  slug: string;
}

export function uniqueCollectionFixture(prefix = "E2E_Col"): CollectionFixture {
  const runId = Date.now().toString(36);
  const name = `${prefix}_${runId}`;
  return { name, slug: name.toLowerCase().replace(/ /g, "_") };
}

export async function openNewCollectionEditor(page: Page): Promise<void> {
  await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
  const addBtn = page.getByTestId("add-collection-button").first();
  await expect(addBtn).toBeVisible({ timeout: 20_000 });
  await addBtn.click();
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
  await expect(widgetsTab).toBeVisible({ timeout: 15_000 });
  await widgetsTab.click();

  // Wait for widget sidebar (core widgets load asynchronously)
  const quickAdd = page.getByTestId("quick-add-input");
  await expect(quickAdd).toBeVisible({ timeout: 20_000 });
  await quickAdd.click();

  const fieldList = page.getByTestId("widget-fields-list");
  const fieldRow = fieldList.getByTestId("widget-field-row").nth(index);
  await expect(fieldRow).toBeVisible({ timeout: 15_000 });
  await expect(fieldRow.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

  // Open editor via dedicated control (pencil or field-info button)
  const openBtn = fieldRow.getByTestId("widget-field-open");
  if (await openBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await openBtn.click();
  } else {
    await fieldRow.getByTestId("widget-field-edit").click();
  }

  const labelInput = page.getByTestId("widget-field-label");
  const nameInput = page.getByTestId("widget-field-name");
  await expect(labelInput).toBeVisible({ timeout: 15_000 });
  await labelInput.fill(options.label);
  await nameInput.fill(options.fieldName);

  await page.getByTestId("widget-field-apply").click();

  await expect(fieldList.getByText(options.label)).toBeVisible({
    timeout: 15_000,
  });
}

export async function saveCollectionSchema(page: Page): Promise<void> {
  await page.getByTestId("save-collection-button").first().click();
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
    await createBtn.click();
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
