/**
 * @file tests/e2e/routes/mediagallery/mediagallery.spec.ts
 * @description E2E tests for /mediagallery — toolbar, grid/table views, search, upload, delete.
 *
 * Uses data-testid selectors (not role/CSS) so tests survive layout changes.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");

async function openMediaGallery(page: import("@playwright/test").Page) {
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/mediagallery");
  }
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  const shell = page
    .getByTestId("media-gallery-toolbar")
    .or(page.getByTestId("media-gallery-content"))
    .or(page.getByTestId("media-grid"))
    .or(page.getByTestId("admin-page-shell-title"));
  await expect(shell.first()).toBeVisible({ timeout: 30_000 });
}

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
    const gridBtn = page.getByTestId("media-view-grid");
    const tableBtn = page.getByTestId("media-view-table");

    await expect(gridBtn).toBeVisible({ timeout: 15_000 });
    await expect(tableBtn).toBeVisible();
    await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("media-grid")).toBeVisible();

    // Switch to table
    await tableBtn.click();
    await expect(tableBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 10_000 });

    // Switch back to grid
    await gridBtn.click();
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
  });

  test("can upload an image and verify it appears", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await expect(uploadInput).toBeAttached();

    await uploadInput.setInputFiles(TEST_IMAGE);

    // Wait for grid to populate (empty state gone, gridcell visible)
    await expect(page.getByTestId("media-grid-empty")).toHaveCount(0, { timeout: 25_000 });
    await expect(page.getByTestId("media-item").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(path.basename(TEST_IMAGE)).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can delete an uploaded asset via grid action menu", async ({ page }) => {
    await openMediaGallery(page);

    // Upload a fresh asset so the delete target is deterministic (unique id).
    const uploadInput = page.getByTestId("media-upload-input");
    await expect(uploadInput).toBeAttached();
    await uploadInput.setInputFiles(TEST_IMAGE);
    const item = page.getByTestId("media-item").first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    const mediaId = await item.getAttribute("data-media-id");
    expect(mediaId, "media item must expose a data-media-id").toBeTruthy();

    await item.hover();

    // Action buttons container
    const actions = page.getByTestId("media-grid-actions").first();
    await expect(actions).toBeVisible({ timeout: 5_000 });

    // Delete button
    const deleteBtn = actions.getByLabel(/delete/i).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm dialog
    const dialog = page.locator("dialog[open]").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog
      .getByTestId("modal-confirm")
      .or(dialog.getByRole("button", { name: /confirm|delete/i }))
      .first()
      .click();

    // Outcome 1: the specific item disappears from the grid.
    await expect(page.locator(`[data-media-id="${mediaId}"]`)).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Outcome 2: the entry is gone from the media API list as well.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/media");
          if (!res.ok()) return false;
          const body = await res.json().catch(() => null);
          const items = Array.isArray(body?.data)
            ? body.data
            : Array.isArray(body)
              ? body
              : Array.isArray(body?.items)
                ? body.items
                : [];
          return items.every((m: { _id?: unknown }) => String(m?._id) !== mediaId);
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
  });

  test("advanced search modal opens and closes", async ({ page }) => {
    const searchBtn = page.getByTestId("media-advanced-search");
    await expect(searchBtn).toBeVisible({ timeout: 5_000 });
    await searchBtn.click();

    const modal = page
      .getByRole("dialog")
      .filter({ hasText: /advanced search/i })
      .first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Click close button — Escape doesn't close this modal
    await modal
      .getByRole("button", { name: /close|cancel/i })
      .first()
      .click({ timeout: 5_000 });
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("filter by type selects IMAGE", async ({ page }) => {
    const typeFilter = page.locator("#media-type-filter");
    await expect(typeFilter).toBeVisible({ timeout: 5_000 });
    await typeFilter.selectOption({ label: "IMAGE" });
    await expect(typeFilter).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("selection mode and bulk bar appear after selecting image", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await uploadInput.setInputFiles(TEST_IMAGE);
    await expect(page.getByTestId("media-item").first()).toBeVisible({ timeout: 20_000 });

    const item = page.getByTestId("media-item").first();
    const mediaId = await item.getAttribute("data-media-id");
    expect(mediaId).toBeTruthy();

    await page.getByTestId("media-selection-toggle").click();
    await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const label = item.locator("label").first();
    await label.click({ timeout: 5_000 });

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
  });

  test("tooltip actions appear on hover", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await uploadInput.setInputFiles(TEST_IMAGE);
    await expect(page.getByTestId("media-item").first()).toBeVisible({ timeout: 20_000 });

    const item = page.getByTestId("media-item").first();
    await item.hover();

    const actions = page.getByTestId("media-grid-actions").first();
    await expect(actions).toBeVisible({ timeout: 5_000 });

    // Details tooltip
    await expect(actions.getByLabel(/details for/i).first()).toBeVisible({ timeout: 3_000 });
    // Edit tooltip
    await expect(actions.getByLabel(/edit/i).first()).toBeVisible({ timeout: 3_000 });
    // Delete tooltip
    await expect(actions.getByLabel(/delete/i).first()).toBeVisible({ timeout: 3_000 });
  });

  test("tag editor modal opens for image", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await uploadInput.setInputFiles(TEST_IMAGE);
    await expect(page.getByTestId("media-item").first()).toBeVisible({ timeout: 20_000 });

    const item = page.getByTestId("media-item").first();
    await item.hover();

    const actions = page.getByTestId("media-grid-actions").first();
    await expect(actions).toBeVisible({ timeout: 5_000 });

    const tagBtn = actions.getByLabel(/tags for/i).first();
    await expect(tagBtn).toBeVisible({ timeout: 3_000 });
    await tagBtn.click();

    // Tag editor modal should appear
    const modal = page.getByRole("dialog").filter({ hasText: /tag/i }).first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("create folder via New Folder prompt", async ({ page }) => {
    const createBtn = page.getByTestId("media-create-folder");
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();

    const dialog = page
      .getByRole("dialog")
      .filter({ hasNotText: /cookie|privacy/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator("input").first().fill("e2e-test-folder");
    await dialog.getByRole("button", { name: /ok|create|confirm|save/i }).click();
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: 10_000 });
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

  test("details and edit actions appear on hover", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await uploadInput.setInputFiles(TEST_IMAGE);
    await expect(page.getByTestId("media-item").first()).toBeVisible({ timeout: 20_000 });

    const item = page.getByTestId("media-item").first();
    await item.hover();

    const actions = page.getByTestId("media-grid-actions").first();
    await expect(actions).toBeVisible({ timeout: 5_000 });

    // Details
    const detailsBtn = actions.getByLabel(/details for/i).first();
    await expect(detailsBtn).toBeVisible({ timeout: 3_000 });

    // Edit
    const editBtn = actions.getByLabel(/edit/i).first();
    await expect(editBtn).toBeVisible({ timeout: 3_000 });
  });
});
