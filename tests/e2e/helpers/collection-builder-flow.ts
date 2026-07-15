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
  await page.getByTestId("add-collection-button").first().click();
  await page.waitForURL(/\/config\/collectionbuilder\/new/, { timeout: 15_000 });
  await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
}

export async function addInputField(
  page: Page,
  options: { label: string; fieldName: string; index?: number },
): Promise<void> {
  const index = options.index ?? 0;
  await page.getByTestId("tab-widgets").click();
  await page.getByTestId("quick-add-input").click();
  await expect(page.getByText(/New Input/i).nth(index)).toBeVisible({ timeout: 10_000 });
  await page
    .getByTestId("widget-fields-list")
    .getByText(/New Input/i)
    .nth(index)
    .click();
  await page.getByPlaceholder("e.g. Profile Picture").fill(options.label);
  await page.getByPlaceholder("e.g. profile_pic").fill(options.fieldName);
  await page.getByRole("button", { name: /Apply Changes/i }).click();
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
