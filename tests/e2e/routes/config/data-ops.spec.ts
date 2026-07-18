/**
 * @file tests/e2e/routes/config/data-ops.spec.ts
 * @description Sync shell + trash golden restore (seed-trash). No soft-skip.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";
import { purgeTrash, seedTrash } from "../../helpers/seed";

const ACTION_TIMEOUT = 20_000;

async function loginAndGo(page: Page, path: string) {
  await loginAsAdmin(page);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Config Sync & Trash", () => {
  test.setTimeout(120_000);

  test("sync shell: tabs and status", async ({ page }) => {
    await loginAndGo(page, "/config/sync");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("sync-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("sync-tabs")).toBeVisible();
    await expect(page.getByTestId("sync-run")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(
      page
        .getByTestId("sync-in-sync")
        .or(page.getByTestId("sync-changes"))
        .or(page.getByTestId("sync-loading"))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("trash shell: page chrome", async ({ page }) => {
    await loginAndGo(page, "/config/trash");
    await expect(page.getByTestId("trash-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("trash-refresh")).toBeVisible();
    await expect(page.getByTestId("trash-loading")).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });

  /**
   * Golden: seed soft-deleted entry → appears in trash → restore → gone from trash.
   */
  test("golden: seed-trash → restore → empty of fixture", async ({ page }) => {
    await loginAsAdmin(page);
    const stamp = Date.now().toString(36);
    const title = `E2E Trash Restore ${stamp}`;
    const seeded = await seedTrash(page, { title });

    try {
      await page.goto("/config/trash", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.getByTestId("trash-loading")).toHaveCount(0, {
        timeout: ACTION_TIMEOUT,
      });
      await expect(page.getByTestId("trash-table")).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(page.getByText(title).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

      const row = page.getByTestId(`trash-row-${seeded.entryId}`);
      await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
      await row.getByTestId("trash-restore").click();
      await confirmModal(page);

      await expect(page.getByText(title)).toHaveCount(0, { timeout: ACTION_TIMEOUT });
    } finally {
      await purgeTrash(page, seeded.collectionId, seeded.entryId).catch(() => {});
    }
  });
});
