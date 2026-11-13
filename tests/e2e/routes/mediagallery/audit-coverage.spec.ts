/**
 * @file tests/e2e/routes/mediagallery/audit-coverage.spec.ts
 * @description Browser contract for the Media Gallery audit items that lacked coverage:
 * folder create → persist, seed media → grid render, tile click → details dialog,
 * rename → persist on reload, delete → removed from grid.
 *
 * Each journey drives the real UI and asserts an outcome. Seeding goes through
 * `POST /api/testing` (`seedMediaWithMetadata`), and every seeded row is deleted
 * in `finally`, so this is a create → render → assert → cleanup round-trip with
 * no soft-skips.
 */

import { test, expect } from "../../fixtures";
import { waitForHydration } from "../../helpers/auth";
import { seedMediaWithMetadata } from "../../helpers/api";
import { deleteMediaRow, mediaCard, openMediaGallery } from "../../helpers/media";

test.describe("Media Gallery audit coverage", () => {
  test.beforeEach(async ({ page }) => {
    await openMediaGallery(page);
  });

  test("creates a folder that persists across reload", async ({ page }) => {
    const folderName = `e2e-audit-folder-${Date.now().toString(36)}`;
    let folderId = "";
    try {
      const createBtn = page.getByTestId("media-create-folder");
      await expect(createBtn).toBeVisible({ timeout: 5_000 });
      await createBtn.click();

      const dialog = page
        .getByRole("dialog")
        .filter({ hasNotText: /cookie|privacy/i })
        .first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.locator("input").first().fill(folderName);
      await dialog.getByRole("button", { name: /ok|create|confirm|save/i }).click();
      await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: 10_000 });

      // Persistence: the API must contain the folder, and a reload must show it.
      const list = await page.request.get("/api/system-virtual-folder");
      const body = await list.json();
      expect(body.success).toBe(true);
      const created = (body.data as Array<{ _id?: string; name?: string }>).find(
        (folder) => folder.name === folderName,
      );
      expect(created?._id, "folder must be persisted").toBeTruthy();
      folderId = String(created!._id);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(page.getByText(folderName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      if (folderId) {
        await page.request.delete(
          `/api/system-virtual-folder?folderId=${encodeURIComponent(folderId)}`,
        );
      }
    }
  });

  test("seeded media appears in the grid and opens the details dialog on tile click", async ({
    page,
  }) => {
    const seeded = await seedMediaWithMetadata(page);
    const target = seeded.items[0]!;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      const tile = mediaCard(page, target.filename);
      await expect(tile).toBeVisible({ timeout: 25_000 });

      // Clicking the tile (its thumbnail is the interactive surface) opens details.
      await tile.getByRole("button").first().click();
      await expect(page.getByTestId("media-details-modal")).toBeVisible({ timeout: 10_000 });
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("renames seeded media from the details dialog and persists on reload", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const target = seeded.items[0]!;
    const renamed = `renamed-${Date.now().toString(36)}`;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      const tile = mediaCard(page, target.filename);
      await expect(tile).toBeVisible({ timeout: 25_000 });
      await tile.getByRole("button").first().click();

      const modal = page.getByTestId("media-details-modal");
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const nameEdit = modal.getByRole("button", { name: /edit asset name/i }).first();
      await expect(nameEdit).toBeVisible({ timeout: 5_000 });
      await nameEdit.click();

      const patch = page.waitForResponse(
        (res) =>
          res.request().method() === "PATCH" && res.url().includes(`/api/media/${target._id}`),
        { timeout: 15_000 },
      );
      await modal.getByRole("textbox").first().fill(renamed);
      const res = await patch;
      expect(res.ok(), `PATCH ${res.status()} ${res.url()}`).toBe(true);

      // Persistence: reload, reopen details (by stable media id, not the old name),
      // and read the saved name back.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const reloadedItem = page.locator(`[data-media-id="${target._id}"]`);
      await expect(reloadedItem).toBeVisible({ timeout: 25_000 });
      await reloadedItem.getByRole("button").first().click();
      await expect(page.getByTestId("media-details-modal")).toContainText(renamed, {
        timeout: 10_000,
      });
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("deletes seeded media and removes it from the grid", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const target = seeded.items[0]!;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      const item = page.locator(`[data-media-id="${target._id}"]`);
      await expect(item).toBeVisible({ timeout: 25_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });
      await actions.getByLabel(`Delete ${target.filename}`).first().click();

      const dialog = page.locator("dialog[open]").first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog
        .getByTestId("modal-confirm")
        .or(dialog.getByRole("button", { name: /confirm|delete/i }))
        .first()
        .click();

      // Outcome 1: the specific item disappears from the grid.
      await expect(item).toHaveCount(0, { timeout: 15_000 });

      // Outcome 2: the row is gone on the server too — reload and assert it stays gone.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(mediaCard(page, target.filename)).toHaveCount(0, { timeout: 25_000 });
    } finally {
      // The target is already deleted; clean up any remaining seeded sibling.
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });
});
