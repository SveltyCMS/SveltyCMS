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

function openDialog(page: Page): Locator {
  return page.locator("dialog[open]").first();
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
    const dialog = openDialog(page);
    if (!(await dialog.isVisible({ timeout: 300 }).catch(() => false))) {
      return;
    }

    const closeBtn = dialog
      .getByRole("button", { name: /close modal|close|cancel|dismiss/i })
      .first();
    if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => undefined);
    } else {
      await page.keyboard.press("Escape").catch(() => undefined);
      await dialog
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

/** Switch editor to Widgets tab and wait for the field canvas. */
export async function goToWidgetsTab(page: Page): Promise<void> {
  const widgetsTab = page.getByTestId("tab-widgets");
  await expect(widgetsTab).toBeVisible({ timeout: 15_000 });
  const selected = await widgetsTab.getAttribute("aria-selected").catch(() => null);
  if (selected !== "true") {
    await stableClick(widgetsTab, 15_000);
  }
  // Canvas or add control proves the tab panel mounted
  await expect(
    page
      .getByTestId("widget-fields-list")
      .or(page.getByTestId("add-field-button"))
      .or(page.getByTestId("collection-widgets-tab"))
      .first(),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Pick the Input widget into the collection canvas.
 *
 * Priority:
 * 1. If "Add New Field" is already open → select Input *inside that dialog*
 * 2. Else open "Add Widget" modal (most reliable in CI)
 * 3. Else sidebar `quick-add-input`
 */
export async function quickAddInputWidget(page: Page): Promise<void> {
  await goToWidgetsTab(page);
  await dismissOpenDialogs(page);

  // Path 1: dialog already open
  if (await isAddNewFieldOpen(page)) {
    await selectInputFromAddFieldDialog(page);
    return;
  }

  // Path 2: Add Widget button → modal (stable under wizard layout)
  const addFieldBtn = page.getByTestId("add-field-button");
  if (await addFieldBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await stableClick(addFieldBtn, 10_000);
    await selectInputFromAddFieldDialog(page);
    return;
  }

  // Path 3: sidebar quick-add
  const quickAdd = page.getByTestId("quick-add-input");
  await expect(quickAdd).toBeVisible({ timeout: 20_000 });
  if (await isAddNewFieldOpen(page)) {
    await selectInputFromAddFieldDialog(page);
    return;
  }
  await stableClick(quickAdd, 15_000);
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
  if (page.url().includes("/login")) {
    const { loginAsAdmin } = await import("./auth");
    await loginAsAdmin(page, "/config/collectionbuilder");
  }
  await dismissOpenDialogs(page);

  const addBtn = page.getByTestId("add-collection-button").first();
  await expect(addBtn, "Add Collection button on /config/collectionbuilder").toBeVisible({
    timeout: 20_000,
  });

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

  // Field editor may open automatically (add path with openEditor) or need a row click
  const labelInDialog = () =>
    openDialog(page).getByTestId("widget-field-label").or(page.getByTestId("widget-field-label"));

  let editorOpen = await labelInDialog()
    .first()
    .isVisible({ timeout: 6_000 })
    .catch(() => false);

  if (!editorOpen) {
    await expect(fieldList).toBeVisible({ timeout: 15_000 });
    const fieldRow = fieldList.getByTestId("widget-field-row").nth(index);
    await expect(fieldRow).toBeVisible({ timeout: 15_000 });

    const openBtn = fieldRow
      .getByTestId("widget-field-open")
      .or(fieldRow.getByTestId("widget-field-edit"))
      .first();
    await stableClick(openBtn, 10_000);
  }

  const labelInput = labelInDialog().first();
  await expect(labelInput, "Field editor should show widget-field-label").toBeVisible({
    timeout: 15_000,
  });

  await labelInput.click();
  await labelInput.fill("");
  await labelInput.fill(options.label);

  const nameInput = openDialog(page)
    .getByTestId("widget-field-name")
    .or(page.getByTestId("widget-field-name"))
    .first();
  await nameInput.click();
  await nameInput.fill("");
  await nameInput.fill(options.fieldName);

  const applyBtn = openDialog(page)
    .getByTestId("widget-field-apply")
    .or(page.getByTestId("widget-field-apply"))
    .first();
  await stableClick(applyBtn, 10_000);

  await expect(labelInput)
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);

  await expect(fieldList.getByText(options.label, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

export async function saveCollectionSchema(page: Page): Promise<void> {
  await dismissOpenDialogs(page);

  // StickyActions may clone the Save button into a sticky bar (duplicate testids).
  // Prefer a visible, enabled instance; force-click to beat overlays.
  const candidates = page.locator('[data-testid="save-collection-button"]');
  await expect(candidates.first()).toBeAttached({ timeout: 10_000 });

  const count = await candidates.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const btn = candidates.nth(i);
    const enabled = await btn.isEnabled().catch(() => false);
    const visible = await btn.isVisible().catch(() => false);
    if (enabled && visible) {
      await btn.scrollIntoViewIfNeeded().catch(() => undefined);
      await btn.click({ force: true, timeout: 10_000 });
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // Last resort: any enabled button (including sticky)
    const anyEnabled = page
      .locator('[data-testid="save-collection-button"]:not([disabled])')
      .first();
    await anyEnabled.click({ force: true, timeout: 10_000 });
  }

  // Success: toast and/or SPA navigation to edit/:name (new collections)
  await Promise.race([
    page.getByText(/collection saved/i).waitFor({ state: "visible", timeout: 25_000 }),
    page.waitForURL(/\/config\/collectionbuilder\/edit\//, { timeout: 25_000 }),
  ]);
}

export async function openCollectionEntries(page: Page, slug: string): Promise<void> {
  const cleanSlug = slug.replace(/^collection\//, "").replace(/^\/+/, "");

  await expect(async () => {
    const apiRes = await page.request.get(`/api/collections/${cleanSlug}`);
    expect(apiRes.ok()).toBeTruthy();
    const body = await apiRes.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  }).toPass({ timeout: 30_000, intervals: [2_000, 3_000, 5_000] });

  await page.waitForTimeout(500);

  await expect(async () => {
    await page.goto(`/en/collection/${cleanSlug}`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      const { loginAsAdmin } = await import("./auth");
      await loginAsAdmin(page, `/en/collection/${cleanSlug}`);
    }
    await expect(page).toHaveURL(new RegExp(cleanSlug, "i"), { timeout: 3_000 });
    await expect(page).not.toHaveURL(/\/config\/collectionbuilder/, { timeout: 3_000 });
  }).toPass({
    timeout: 40_000,
    intervals: [2_000, 4_000, 6_000],
  });
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
