/**
 * @file tests/e2e/routes/mediagallery/mediagallery.spec.ts
 * @description E2E tests for /mediagallery — toolbar, grid/table views, search, upload, delete.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");

test.describe("Media Gallery", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/mediagallery");
    await expect(page.getByRole("heading", { level: 1, name: /media gallery/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("loads with toolbar, content area and default grid view", async ({ page }) => {
    await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible();
    await expect(page.getByTestId("media-gallery-content")).toBeVisible();
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(page.getByRole("button", { name: /grid view/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("supports search and type filtering", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: /search media assets/i });
    await expect(search).toBeVisible();

    // Search with no results triggers empty state
    await search.fill("e2e-no-match-xyz-random");
    await expect(page.getByTestId("media-grid-empty")).toBeVisible({ timeout: 10_000 });

    // Clearing search restores the grid
    await search.clear();
    await expect(page.getByTestId("media-grid")).toBeVisible();

    // Filter by type persists selection (option values are lowercase)
    await page.locator("#media-type-filter").selectOption("IMAGE");
    await expect(page.locator("#media-type-filter")).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible();
  });

  test("can switch between grid and table views", async ({ page }) => {
    const gridBtn = page.getByRole("button", { name: /grid view/i });
    const tableBtn = page.getByRole("button", { name: /table view/i });

    // Default is grid
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("media-grid")).toBeVisible();

    // Switch to table — when gallery is empty, the table component shows "No media found"
    // instead of rendering <table>, so only verify the button state switched
    await tableBtn.click();
    await expect(tableBtn).toHaveAttribute("aria-pressed", "true");
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false");

    // Switch back to grid
    await gridBtn.click();
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("media-grid")).toBeVisible();
  });

  test("can upload an image and verify it appears", async ({ page }) => {
    const uploadInput = page.getByTestId("media-upload-input");
    await expect(uploadInput).toBeAttached();

    await uploadInput.setInputFiles(TEST_IMAGE);
    await page.waitForLoadState("domcontentloaded");

    // Empty state must disappear after upload
    await expect(page.getByTestId("media-grid-empty")).toHaveCount(0, { timeout: 25_000 });
    // Gridcell with the uploaded file must be visible
    await expect(page.getByRole("gridcell").first()).toBeVisible({ timeout: 15_000 });
    // Filename text appears in the grid
    await expect(page.getByText(path.basename(TEST_IMAGE))).toBeVisible({ timeout: 10_000 });
  });

  test("can delete an uploaded asset via grid action menu", async ({ page }) => {
    const filename = path.basename(TEST_IMAGE);

    // Upload a file to delete
    await page.getByTestId("media-upload-input").setInputFiles(TEST_IMAGE);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(filename)).toBeVisible({ timeout: 20_000 });

    // Hover the gridcell to reveal the action buttons
    const cell = page.getByRole("gridcell").first();
    await cell.hover();
    const actions = cell.locator("[data-testid='media-grid-actions']");
    await expect(actions).toBeVisible({ timeout: 5_000 });

    // Click the delete button — aria-label="Delete {filename}"
    await actions.getByRole("button", { name: new RegExp(filename) }).click();

    // Confirm dialog appears — click confirm
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // After delete, the filename must no longer be visible
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(filename)).not.toBeVisible({ timeout: 15_000 });
  });
});
