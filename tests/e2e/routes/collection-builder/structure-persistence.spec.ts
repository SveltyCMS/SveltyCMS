/**
 * @file tests/e2e/routes/collection-builder/structure-persistence.spec.ts
 * @description E2E tests for Collection Builder category creation and organizational save persistence.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

async function selectFirstIcon(page: import("@playwright/test").Page): Promise<void> {
  const browseButton = page.getByRole("button", { name: /browse icons/i });
  if (await browseButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await browseButton.click();
  }

  const firstIcon = page.getByRole("option", { name: /select icon/i }).first();
  await expect(firstIcon).toBeVisible({ timeout: 15_000 });
  await firstIcon.click();
}

test.describe("Collection Builder Structure Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("category save survives page reload", async ({ page }) => {
    const categoryName = `E2E_Category_${Date.now()}`;

    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 15_000,
    });

    const board = page.getByTestId("collection-builder-board");
    const emptyState = page.getByRole("button", { name: /quick start/i });

    if (!(await board.isVisible({ timeout: 5_000 }).catch(() => false))) {
      if (await emptyState.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip(true, "No existing collections — empty-state category flow needs seeded content");
        return;
      }
    }

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
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });

    const board = page.getByTestId("collection-builder-board");
    if (!(await board.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Board not visible — requires existing collections");
      return;
    }

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
