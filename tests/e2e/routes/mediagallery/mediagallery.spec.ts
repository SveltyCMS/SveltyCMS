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

async function openMediaGallery(page: import("@playwright/test").Page) {
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Fail fast with a clear signal if the root error boundary fired
  const systemError = page.getByRole("heading", { name: /system error/i });
  if (await systemError.isVisible({ timeout: 1_500 }).catch(() => false)) {
    const detail = await page
      .locator(".font-mono, pre, code")
      .first()
      .textContent()
      .catch(() => "");
    throw new Error(`Media gallery hit System Error boundary: ${detail?.trim() || "(no detail)"}`);
  }

  // Prefer stable page-title marker (AdminPageShell → PageTitle h1)
  const pageTitle = page.getByTestId("page-title");
  await expect(pageTitle).toBeVisible({ timeout: 15_000 });
  await expect(pageTitle).toContainText(/media gallery/i);
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

    // Search with no results triggers empty state
    await search.fill("e2e-no-match-xyz-random");
    await expect(page.getByTestId("media-grid-empty")).toBeVisible({ timeout: 10_000 });

    // Clearing search restores the grid
    await search.clear();
    await expect(page.getByTestId("media-grid")).toBeVisible();

    // Filter by type persists selection (option values are lowercase; labels are UPPER)
    await page.locator("#media-type-filter").selectOption({ label: "IMAGE" });
    await expect(page.locator("#media-type-filter")).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible();
  });

  test("can switch between grid and table views", async ({ page }) => {
    // Assertions use data-view + testids — never role/name (Button a11y forwarding flaked in CI)
    const content = page.getByTestId("media-gallery-content");
    const gridBtn = page.getByTestId("media-view-grid");
    const tableBtn = page.getByTestId("media-view-table");

    await expect(gridBtn).toBeVisible({ timeout: 15_000 });
    await expect(tableBtn).toBeVisible();
    await expect(content).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("media-grid")).toBeVisible();

    // Native button — Playwright click is enough; evaluate as belt-and-suspenders
    await tableBtn.click({ force: true });
    await expect(content).toHaveAttribute("data-view", "table", { timeout: 10_000 });
    await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 10_000 });
    await expect(tableBtn).toHaveAttribute("aria-pressed", "true");
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false");

    await gridBtn.click({ force: true });
    await expect(content).toHaveAttribute("data-view", "grid", { timeout: 10_000 });
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
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
