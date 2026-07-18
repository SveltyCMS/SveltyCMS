/**
 * @file tests/e2e/helpers/collection-builder-flow.ts
 * @description Shared Playwright helpers for Collection Builder E2E flows.
 *
 * Critical rule: never click the sidebar Input tile while the "Add New Field"
 * dialog is open — Playwright resolves that tile first and fails with:
 *   dialog … aria-label="Add New Field" … intercepts pointer events
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

/** Click after visible; force only as last resort. */
async function stableClick(locator: Locator, timeout = 15_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout });
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await locator.click({ timeout: Math.min(timeout, 10_000) });
  } catch {
    await locator.click({ force: true, timeout: 5_000 });
  }
}

function addNewFieldDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: /add new field/i });
}

/** True when the native Add New Field modal is open. */
async function isAddNewFieldOpen(page: Page): Promise<boolean> {
  return addNewFieldDialog(page)
    .isVisible({ timeout: 400 })
    .catch(() => false);
}

/**
 * Close any open `<dialog>` (especially "Add New Field") that steals clicks.
 */
export async function dismissOpenDialogs(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const openDialog = page.locator("dialog[open]").first();
    if (!(await openDialog.isVisible({ timeout: 300 }).catch(() => false))) {
      return;
    }

    const closeBtn = openDialog
      .getByRole("button", { name: /close modal|close|cancel|dismiss/i })
      .first();
    if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => undefined);
    } else {
      // Backdrop / Escape — DialogManager syncs modalState on close
      await page.keyboard.press("Escape").catch(() => undefined);
      await openDialog
        .evaluate((el) => {
          const d = el as HTMLDialogElement;
          if (typeof d.close === "function") d.close();
          else el.removeAttribute("open");
        })
        .catch(() => undefined);
    }

    await page.waitForTimeout(150);
  }
}

/**
 * Pick the Input widget into the collection canvas.
 *
 * Priority:
 * 1. If "Add New Field" is already open → select Input *inside that dialog*
 * 2. Else sidebar `quick-add-input` (no modal)
 * 3. Else open "Add Widget" and select Input inside the dialog
 */
export async function quickAddInputWidget(page: Page): Promise<void> {
  const widgetsTab = page.getByTestId("tab-widgets");
  if (await widgetsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    // Only click if not already selected
    const selected = await widgetsTab.getAttribute("aria-selected").catch(() => null);
    if (selected !== "true") {
      await stableClick(widgetsTab, 15_000);
    }
  }

  // Path 1: dialog already open — NEVER click the sidebar Input behind it
  if (await isAddNewFieldOpen(page)) {
    await selectInputFromAddFieldDialog(page);
    return;
  }

  // Path 2: sidebar quick-add (preferred)
  const quickAdd = page.getByTestId("quick-add-input");
  if (await quickAdd.isVisible({ timeout: 20_000 }).catch(() => false)) {
    // Guard: if a dialog opened between checks, switch strategy
    if (await isAddNewFieldOpen(page)) {
      await selectInputFromAddFieldDialog(page);
      return;
    }
    await stableClick(quickAdd, 15_000);
    return;
  }

  // Path 3: "Add Widget" button → modal
  const addFieldBtn = page.getByTestId("add-field-button");
  await expect(addFieldBtn).toBeVisible({ timeout: 10_000 });
  await stableClick(addFieldBtn, 10_000);
  await selectInputFromAddFieldDialog(page);
}

/**
 * Click Input only inside the "Add New Field" dialog (never page-level /Input/).
 */
async function selectInputFromAddFieldDialog(page: Page): Promise<void> {
  const dialog = addNewFieldDialog(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const pick = dialog
    .getByTestId("select-widget-input")
    .or(dialog.getByRole("button", { name: /select input widget|^input$/i }));

  await stableClick(pick.first(), 10_000);

  // Modal should close after selection (then field editor may open)
  await expect(dialog)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);
}

export async function openNewCollectionEditor(page: Page): Promise<void> {
  await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
  await dismissOpenDialogs(page);

  // If builder shell never mounts (SSR error), surface URL + body for CI logs
  const addBtn = page.getByTestId("add-collection-button").first();
  const board = page.getByTestId("collection-builder-board");
  const title = page.getByTestId("page-title");
  const shellVisible =
    (await addBtn.isVisible({ timeout: 20_000 }).catch(() => false)) ||
    (await board.isVisible({ timeout: 2_000 }).catch(() => false)) ||
    (await title.isVisible({ timeout: 2_000 }).catch(() => false));

  if (!shellVisible) {
    // One recovery: re-login via testing API then retry once
    try {
      const { loginAsAdmin } = await import("./auth");
      await loginAsAdmin(page);
      await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
      await dismissOpenDialogs(page);
    } catch {
      /* ignore */
    }
  }

  if (!(await addBtn.isVisible({ timeout: 15_000 }).catch(() => false))) {
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw new Error(`collectionbuilder shell missing at ${page.url()} body=${body.slice(0, 500)}`);
  }

  await stableClick(addBtn, 20_000);
  await page.waitForURL(/\/config\/collectionbuilder\/new/, { timeout: 20_000 });
  await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 10_000 });
}

/**
 * Add an Input field and set label + db name via the inspector modal.
 */
export async function addInputField(
  page: Page,
  options: { label: string; fieldName: string; index?: number },
): Promise<void> {
  const index = options.index ?? 0;
  const fieldList = page.getByTestId("widget-fields-list");

  await quickAddInputWidget(page);

  // Sidebar path leaves a "New Input" row; modal path may already open the editor
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
  // clear + type so Svelte bind:value picks up changes under Playwright
  await labelInput.click();
  await labelInput.fill("");
  await labelInput.fill(options.label);
  const nameInput = page.getByTestId("widget-field-name");
  await nameInput.click();
  await nameInput.fill("");
  await nameInput.fill(options.fieldName);
  await stableClick(page.getByTestId("widget-field-apply"), 10_000);

  await expect(labelInput)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);
  // Label is the stable post-apply signal (db name may still be auto-generated)
  await expect(fieldList.getByText(options.label, { exact: true })).toBeVisible({
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
