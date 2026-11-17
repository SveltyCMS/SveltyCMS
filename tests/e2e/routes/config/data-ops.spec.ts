/**
 * @file tests/e2e/routes/config/data-ops.spec.ts
 * @description Sync shell + trash golden restore (seed-trash). No soft-skip.
 */

import { test, expect, type Page } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";
import { purgeTrash, seedTrash } from "../../helpers/api";
import { runAfterHydration } from "../../helpers/hydration";

const ACTION_TIMEOUT = 20_000;

async function loginAndGo(page: Page, path: string) {
  await loginAsAdmin(page);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

// Tests are independent (unique trash fixtures, fresh storageState per test) —
// no serial mode needed, so the file parallelizes across workers on local runs.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Config Sync & Trash", () => {
  test.setTimeout(120_000);

  test("sync shell: collapsible explainer, tabs, safety modes, and snapshot export", async ({
    page,
  }) => {
    await loginAndGo(page, "/config/sync");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("sync-page")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // No Drupal/drush copy should remain anywhere on the page
    await expect(page.getByTestId("sync-page")).not.toContainText(/drush/i);

    // Explainer starts collapsed for maximum workspace height and expands on click
    const explainerToggle = page.getByTestId("sync-explainer-toggle");
    await expect(explainerToggle).toHaveAttribute("aria-expanded", "false");
    await runAfterHydration(page, () => explainerToggle.click(), { selector: explainerToggle });
    await expect(explainerToggle).toHaveAttribute("aria-expanded", "true");
    await explainerToggle.click();
    await expect(explainerToggle).toHaveAttribute("aria-expanded", "false");

    await expect(page.getByTestId("sync-tabs")).toBeVisible();
    await expect(page.getByTestId("sync-run")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(
      page
        .getByTestId("sync-in-sync")
        .or(page.getByTestId("sync-changes"))
        .or(page.getByTestId("sync-loading"))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Exercise safety mode selector & Refresh button
    const modeSelect = page.locator("#safety-mode-select");
    await modeSelect.selectOption("add");
    await expect(modeSelect).toHaveValue("add");
    await modeSelect.selectOption("merge");

    // Export Snapshot writes to config/sync and refreshes the snapshot table in Data & Backups
    await page.getByTestId("config-export-btn").click();
    await page.getByTestId("sync-refresh").click();
    await expect(page.getByTestId("sync-loading")).toHaveCount(0, { timeout: ACTION_TIMEOUT });

    // Switch to Data & Backups tab and confirm snapshots table or empty card renders
    await page.getByRole("tab", { name: /Data & Backups/i }).click();
    await expect(
      page.getByTestId("sync-snapshots-table").or(page.getByTestId("sync-snapshots-empty")).first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Switch to Debug tab and verify raw status payload renders
    await page.getByRole("tab", { name: /Debug/i }).click();
    await expect(page.locator("#tabpanel-debug pre")).toBeVisible({ timeout: ACTION_TIMEOUT });
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
      // The row is SSR-painted; a restore click before hydration is a no-op and
      // leaves the confirm dialog to time out.
      await runAfterHydration(page, () => row.getByTestId("trash-restore").click(), {
        selector: row,
      });
      await confirmModal(page);

      await expect(page.getByText(title)).toHaveCount(0, { timeout: ACTION_TIMEOUT });
    } finally {
      await purgeTrash(page, seeded.collectionId, seeded.entryId).catch(() => {});
    }
  });
});
