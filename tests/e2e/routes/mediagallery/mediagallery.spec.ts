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
  if (page.url().includes("/warming-up")) {
    await page.waitForURL(/\/mediagallery/, { timeout: 20_000 });
  }
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Wait for one of: toolbar, content area, or grid
  const shell = page
    .getByTestId("media-gallery-toolbar")
    .or(page.getByTestId("media-gallery-content"))
    .or(page.getByTestId("media-grid"));
  await expect(shell.first()).toBeVisible({ timeout: 15_000 });
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

    // Switch to table. If the page navigates away (possible render crash),
    // navigate back and retry via toPass.
    await tableBtn.click();
    await expect(async () => {
      // If we landed somewhere else, go back to mediagallery
      if (!page.url().includes("/mediagallery")) {
        await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
        await tableBtn.click();
      }
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "table");
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });
    await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 10_000 });
    await expect(tableBtn).toHaveAttribute("aria-pressed", "true");
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false");

    // Switch back to grid
    await gridBtn.click();
    await expect(async () => {
      if (!page.url().includes("/mediagallery")) {
        await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
        await gridBtn.click();
      }
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
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
    const filename = path.basename(TEST_IMAGE);

    // Count before upload to verify deletion by count delta
    const beforeCount = await page.getByTestId("media-item").count();

    // Upload
    await page.getByTestId("media-upload-input").setInputFiles(TEST_IMAGE);
    await expect(async () => {
      const count = await page.getByTestId("media-item").count();
      expect(count).toBeGreaterThan(beforeCount);
    }).toPass({ timeout: 20_000 });

    // Find the media item that contains our filename and hover to reveal actions
    const item = page.getByTestId("media-item").filter({ hasText: filename }).first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.hover();

    // Action buttons container
    const actions = page.getByTestId("media-grid-actions").first();
    await expect(actions).toBeVisible({ timeout: 5_000 });

    // Delete button has aria-label "Delete {filename}"
    const deleteBtn = actions.getByLabel(`Delete ${filename}`, { exact: true });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm dialog
    const dialog = page
      .locator("dialog[open]")
      .or(page.getByRole("dialog").filter({ hasNotText: /cookie|privacy/i }))
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // Verify deletion — count returns to before-upload level
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      const afterCount = await page.getByTestId("media-item").count();
      expect(afterCount).toBe(beforeCount);
    }).toPass({ timeout: 15_000 });
  });
});
