/**
 * @file tests/e2e/routes/collection-builder/structure-persistence.spec.ts
 * @description Category create + save persistence — no soft-skip for empty board.
 * Uses Quick Start when board is empty so the control always has structure.
 */

import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "../../helpers/test-auth";

async function selectFirstIcon(page: import("@playwright/test").Page): Promise<void> {
  const browseButton = page.getByRole("button", { name: /browse icons/i });
  if (await browseButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await browseButton.click();
  }

  const firstIcon = page.getByRole("option", { name: /select icon/i }).first();
  await expect(firstIcon).toBeVisible({ timeout: 15_000 });
  await firstIcon.click();
}

/** Ensure board is available — Quick Start from empty state if needed. */
async function ensureBuilderBoard(page: import("@playwright/test").Page) {
  await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
    timeout: 15_000,
  });

  const board = page.getByTestId("collection-builder-board");
  if (await board.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  // Empty install: open Quick Start (control must not soft-skip)
  const quickStart = page
    .getByRole("button", { name: /quick start/i })
    .or(page.getByTestId("collection-builder-quick-start"));
  await expect(
    quickStart.first(),
    "Expected Collection Builder board or Quick Start on empty install",
  ).toBeVisible({ timeout: 15_000 });
  await quickStart.first().click();

  // Accept common quick-start / preset confirmations if present
  const confirm = page.getByRole("button", {
    name: /^(create|start|continue|confirm|use preset)$/i,
  });
  if (
    await confirm
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    await confirm.first().click();
  }

  await expect(
    board.or(page.getByTestId("add-category-button")).first(),
    "Board or add-category should appear after Quick Start",
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("Collection Builder Structure Persistence", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("category save survives page reload", async ({ page }) => {
    const categoryName = `E2E_Category_${Date.now()}`;
    await ensureBuilderBoard(page);

    await page.getByTestId("add-category-button").click();
    await expect(page.getByLabel(/category name/i)).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/category name/i).fill(categoryName);
    await selectFirstIcon(page);

    await page
      .getByRole("button", { name: /^save$/i })
      .last()
      .click();

    const stickySave = page.getByTestId("save-structure-button");
    await expect(stickySave).toBeEnabled({ timeout: 5_000 });
    await stickySave.click();

    await expect(page.getByText(/organization updated successfully/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(categoryName, { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(categoryName, { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  test("unsaved organizational changes banner appears before save", async ({ page }) => {
    await ensureBuilderBoard(page);

    const categoryName = `E2E_Unsaved_${Date.now()}`;
    await page.getByTestId("add-category-button").click();
    await page.getByLabel(/category name/i).fill(categoryName);
    await selectFirstIcon(page);
    await page
      .getByRole("button", { name: /^save$/i })
      .last()
      .click();

    await expect(page.getByText(/unsaved organizational changes/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
