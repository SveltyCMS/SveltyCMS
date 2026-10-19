/**
 * @file tests/e2e/routes/mediagallery/mediagallery.spec.ts
 * @description E2E tests for /mediagallery — toolbar, grid/table views, search, upload, delete.
 *
 * Uses data-testid selectors (not role/CSS) so tests survive layout changes.
 */

import { test, expect } from "@playwright/test";
import { waitForHydration } from "../../helpers/auth";
import { seedMediaWithMetadata } from "../../helpers/api";
import {
  deleteMediaRow,
  mediaCard,
  openMediaGallery,
  uploadUniqueImage,
} from "../../helpers/media";

test.describe("Media Gallery", () => {
  test.beforeEach(async ({ page }) => {
    await openMediaGallery(page);
  });

  test("loads with toolbar, content area and default grid view", async ({ page }) => {
    const content = page.getByTestId("media-gallery-content");
    await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible();
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(page.getByTestId("media-view-grid")).toHaveAttribute("aria-pressed", "true");
  });

  test("supports search and type filtering", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: /search media assets/i });
    await expect(search).toBeVisible();

    await search.fill("e2e-no-match-xyz-random");
    await expect(page.getByTestId("media-grid-empty")).toBeVisible({ timeout: 10_000 });

    await search.clear();
    await expect(page.getByTestId("media-grid")).toBeVisible();

    const typeFilter = page
      .getByLabel(/filter by media type/i)
      .or(page.locator("#media-type-filter"));
    await typeFilter.selectOption({ label: "IMAGE" });
    await expect(typeFilter).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible();
  });

  test("can switch between grid and table views", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const target = seeded.items[0]!;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      const gridBtn = page.getByTestId("media-view-grid");
      const tableBtn = page.getByTestId("media-view-table");

      await expect(gridBtn).toBeVisible({ timeout: 15_000 });
      await expect(tableBtn).toBeVisible();
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
      await expect(page.getByTestId("media-grid")).toBeVisible();
      await expect(page.getByTestId("media-grid").getByText(target.filename).first()).toBeVisible({
        timeout: 10_000,
      });

      // Switch to table — the seeded asset must be a real data row, not just a shell.
      await tableBtn.click();
      await expect(tableBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
      await expect(gridBtn).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 10_000 });
      await expect(
        page
          .getByTestId("media-table")
          .getByText(target.filename)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({
        timeout: 10_000,
      });

      // Switch back to grid.
      await gridBtn.click();
      await expect(gridBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
      await expect(page.getByTestId("media-grid").getByText(target.filename).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("can upload an image and verify it persists", async ({ page }) => {
    const filename = `e2e-upload-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    try {
      await expect(page.getByText(filename).first()).toBeVisible({ timeout: 15_000 });

      // Create → reload → assert: the card comes back from the API, not local state.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(
        page.getByTestId("media-item").filter({ hasText: filename }).first(),
      ).toBeVisible({
        timeout: 25_000,
      });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("can delete an uploaded asset via grid action menu", async ({ page }) => {
    const filename = `e2e-delete-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    const mediaId = String(row._id);

    try {
      const item = page.locator(`[data-media-id="${mediaId}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      const deleteBtn = actions.getByLabel(`Delete ${filename}`).first();
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
      await deleteBtn.click();

      const dialog = page.locator("dialog[open]").first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog
        .getByTestId("modal-confirm")
        .or(dialog.getByRole("button", { name: /confirm|delete/i }))
        .first()
        .click();

      // Outcome 1: the specific item disappears from the grid.
      await expect(item).toHaveCount(0, { timeout: 15_000 });
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Outcome 2: the row is gone on the server too — reload and assert the
      // card does not come back. (The media list API response shape is not a
      // reliable oracle here; the rendered gallery is.)
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(mediaCard(page, filename)).toHaveCount(0, { timeout: 25_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("advanced search filters by filename and restores all items", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const [canon, nikon] = seeded.items;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(
        page.getByTestId("media-item").filter({ hasText: canon!.filename }).first(),
      ).toBeVisible({ timeout: 25_000 });

      const searchBtn = page.getByTestId("media-advanced-search");
      await expect(searchBtn).toBeVisible({ timeout: 5_000 });
      await searchBtn.click();

      const modal = page
        .getByRole("dialog")
        .filter({ hasText: /advanced search/i })
        .first();
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await modal.getByLabel("Filename", { exact: true }).fill(canon!.filename);
      await modal.getByRole("button", { name: /^search$/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 5_000 });

      // Outcome: only the matching asset remains in the grid.
      await expect(
        page.getByTestId("media-item").filter({ hasText: canon!.filename }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("media-item").filter({ hasText: nikon!.filename })).toHaveCount(
        0,
      );
      await expect(page.getByTestId("media-advanced-search")).toHaveClass(/text-primary-500/);
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("filter by type selects IMAGE", async ({ page }) => {
    const typeFilter = page.locator("#media-type-filter");
    await expect(typeFilter).toBeVisible({ timeout: 5_000 });
    await typeFilter.selectOption({ label: "IMAGE" });
    await expect(typeFilter).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("selection mode and bulk bar appear after selecting image", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-select-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });

      await page.getByTestId("media-selection-toggle").click();
      await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const label = item.locator("label").first();
      await label.click({ timeout: 5_000 });

      await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("tooltip actions appear on hover", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-tips-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      // Details / edit / delete tooltips
      await expect(actions.getByLabel(/details for/i).first()).toBeVisible({ timeout: 3_000 });
      await expect(actions.getByLabel(/edit/i).first()).toBeVisible({ timeout: 3_000 });
      await expect(actions.getByLabel(/delete/i).first()).toBeVisible({ timeout: 3_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("tag editor modal opens for image", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-tags-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      const tagBtn = actions.getByLabel(/tags for/i).first();
      await expect(tagBtn).toBeVisible({ timeout: 3_000 });
      await tagBtn.click();

      const modal = page.getByRole("dialog").filter({ hasText: /tag/i }).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("create folder via New Folder prompt", async ({ page }) => {
    const folderName = `e2e-test-folder-${Date.now().toString(36)}`;
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

  test("sort dropdown changes selection", async ({ page }) => {
    const sortFilter = page.locator("#sort-by-filter");
    await expect(sortFilter).toBeVisible({ timeout: 5_000 });

    await sortFilter.selectOption({ label: "Oldest first" });
    await expect(sortFilter).toHaveValue("oldest");

    await sortFilter.selectOption({ label: "Newest first" });
    await expect(sortFilter).toHaveValue("newest");

    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("JSON path filter input is present", async ({ page }) => {
    const jsonFilter = page.getByLabel(/filter by json path/i);
    await expect(jsonFilter).toBeVisible({ timeout: 5_000 });
  });

  test("grid size zoom changes thumbnail size", async ({ page }) => {
    const gridSizeGroup = page
      .getByRole("group", { name: "Grid size" })
      .filter({ visible: true })
      .first();
    await expect(gridSizeGroup).toBeVisible({ timeout: 5_000 });

    const largeBtn = gridSizeGroup.getByRole("button", { name: "large grid" });
    await largeBtn.click();
    await expect(largeBtn).toHaveAttribute("aria-pressed", "true");

    const tinyBtn = gridSizeGroup.getByRole("button", { name: "tiny grid" });
    await tinyBtn.click();
    await expect(tinyBtn).toHaveAttribute("aria-pressed", "true");

    // Grid should still be visible
    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("breadcrumb exists and is clickable", async ({ page }) => {
    // Create folder, then navigate into it to generate breadcrumbs
    await page.getByTestId("media-create-folder").click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasNotText: /cookie|privacy/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const folderName = "e2e-bc-" + Date.now().toString(36);
    await dialog.locator("input").first().fill(folderName);
    await dialog.getByRole("button", { name: /ok|create|confirm|save/i }).click();
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: 10_000 });

    // Navigate into the folder. The sidebar tree refreshes asynchronously after
    // creation, so wait for the folder link before clicking, then confirm the
    // navigation actually lands inside the folder (URL gains ?folderId=).
    const folderLink = page.getByText(folderName, { exact: true }).first();
    await expect(folderLink).toBeVisible({ timeout: 15_000 });
    await folderLink.click();
    await expect(page).toHaveURL(/folderId=/, { timeout: 15_000 });

    // Breadcrumbs now show the folder as a non-root crumb.
    await expect(page.getByTestId("media-gallery-breadcrumbs").getByText(folderName)).toBeVisible({
      timeout: 10_000,
    });

    // Click root breadcrumb to go back — now rendered as a link (not the
    // current-folder span), so navigation lands back at /mediagallery.
    await page.getByTestId("media-breadcrumb-root").click();
    await expect(page).toHaveURL(/\/mediagallery$/, { timeout: 15_000 });
    await expect(page.getByTestId("media-gallery-content")).toBeVisible({ timeout: 10_000 });
  });

  test("can edit asset metadata from the details modal and persist it", async ({ page }) => {
    const filename = `e2e-meta-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    const renamed = `renamed-${Date.now().toString(36)}`;

    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      // Keep the image-editor entry point covered.
      await expect(actions.getByTestId("media-edit-button")).toBeVisible({ timeout: 3_000 });

      await actions.getByLabel(`Details for ${filename}`).first().click();
      const modal = page.getByTestId("media-details-modal");
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const nameEdit = modal.getByRole("button", { name: /edit asset name/i }).first();
      await expect(nameEdit).toBeVisible({ timeout: 5_000 });
      await nameEdit.click();

      const patch = page.waitForResponse(
        (res) => res.request().method() === "PATCH" && res.url().includes(`/api/media/${row._id}`),
        { timeout: 15_000 },
      );
      const nameInput = modal.getByRole("textbox").first();
      await nameInput.fill(renamed);
      const res = await patch;
      expect(res.ok(), `PATCH ${res.status()} ${res.url()}`).toBe(true);

      // Persistence: reload, reopen details, and read the saved name back.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const reloadedItem = page.locator(`[data-media-id="${row._id}"]`);
      await expect(reloadedItem).toBeVisible({ timeout: 25_000 });
      await reloadedItem.hover();
      await reloadedItem
        .getByTestId("media-grid-actions")
        .first()
        .getByLabel(`Details for ${filename}`)
        .first()
        .click();
      await expect(page.getByTestId("media-details-modal")).toContainText(renamed, {
        timeout: 10_000,
      });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });
});
