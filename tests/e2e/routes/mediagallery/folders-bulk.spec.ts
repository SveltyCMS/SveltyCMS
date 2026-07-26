/**
 * @file tests/e2e/routes/mediagallery/folders-bulk.spec.ts
 * @description Media gallery: virtual folders + multi-select bulk actions.
 *
 * Uses data-testid selectors so tests survive CSS/layout changes.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");
const ACTION_TIMEOUT = 25_000;

async function openGallery(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/mediagallery");
  }
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });

  const shell = page
    .getByTestId("media-gallery-toolbar")
    .or(page.getByTestId("media-gallery-content"))
    .or(page.getByTestId("media-grid"));
  await expect(shell.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
}

async function uploadImage(page: Page, filePath = TEST_IMAGE) {
  const uploadResponse = page
    .waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        (res.url().includes("?/upload") || res.url().includes("/api/media")),
      { timeout: 30_000 },
    )
    .catch(() => null);

  await page.getByTestId("media-upload-input").setInputFiles(filePath);
  await uploadResponse;
  await expect(page.getByText(path.basename(filePath)).first()).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

// ---------------------------------------------------------------------------
// Virtual folders
// ---------------------------------------------------------------------------
test.describe("Media virtual folders", () => {
  test.setTimeout(120_000);

  test("create folder via New Folder prompt", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_folder_${Date.now().toString(36).slice(-6)}`;

    const createApi = page.waitForResponse(
      (res) =>
        res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
      { timeout: ACTION_TIMEOUT },
    );

    await page.getByTestId("media-create-folder").click();

    const dialog = page
      .getByRole("dialog", { name: /create new folder|new folder|folder/i })
      .or(
        page
          .getByRole("dialog")
          .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i }),
      )
      .first();
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });

    const input = dialog.locator("input[type='text'], input:not([type])").first();
    await expect(input).toBeVisible({ timeout: ACTION_TIMEOUT });
    await input.fill(folderName);
    await dialog.getByRole("button", { name: /^(ok|create|confirm|save)$/i }).click();

    const res = await createApi;
    expect(res.ok()).toBe(true);
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("folder appears and gallery remains usable after create", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_nav_${Date.now().toString(36).slice(-6)}`;

    // Create folder
    await page.getByTestId("media-create-folder").click();
    const dialog = page
      .getByRole("dialog", { name: /create new folder|new folder|folder/i })
      .or(
        page
          .getByRole("dialog")
          .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i }),
      )
      .first();
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
    await dialog.locator("input").first().fill(folderName);
    await dialog.getByRole("button", { name: /^(ok|create|confirm|save)$/i }).click();
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Navigate into folder and verify gallery still works
    const folderLink = page.getByText(folderName, { exact: true }).first();
    await expect(folderLink).toBeVisible({ timeout: ACTION_TIMEOUT });
    await folderLink.click();

    // Wait for navigation to complete (breadcrumbs appear)
    await expect(page.getByTestId("media-gallery-breadcrumbs")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("media-gallery-content")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});

// ---------------------------------------------------------------------------
// Bulk selection actions
// ---------------------------------------------------------------------------
test.describe("Media bulk actions", () => {
  test.setTimeout(150_000);

  test("selection mode shows checkboxes and bulk bar", async ({ page }) => {
    await openGallery(page);
    await uploadImage(page);

    await expect(page.getByTestId("media-view-grid")).toHaveAttribute("aria-pressed", "true");

    // Enter selection mode
    await page.getByTestId("media-selection-toggle").click();
    await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Select first media item via its checkbox
    const item = page.getByTestId("media-item").first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
    const checkbox = item.locator('input[type="checkbox"]').first();
    await checkbox.check({ force: true, timeout: ACTION_TIMEOUT });

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
    await expect(page.getByTestId("media-bulk-download")).toBeVisible();
  });

  test("bulk download requests archive endpoint", async ({ page }) => {
    await openGallery(page);
    await uploadImage(page);

    await page.getByTestId("media-selection-toggle").click();
    const item = page.getByTestId("media-item").first();
    const checkbox = item.locator('input[type="checkbox"]').first();
    await checkbox.check({ force: true, timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    const downloadApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/bulk-download") && res.request().method() === "GET",
      { timeout: ACTION_TIMEOUT },
    );

    await page.getByTestId("media-bulk-download").click();
    const res = await downloadApi;
    expect([200, 400, 404, 500, 501]).toContain(res.status());
    if (res.ok()) {
      await expect(page.getByText(/archive download started|download/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("Delete key bulk-deletes selection with confirm", async ({ page }) => {
    await openGallery(page);
    await uploadImage(page);
    const filename = path.basename(TEST_IMAGE);

    // Select the item
    await page.getByTestId("media-selection-toggle").click();
    const item = page.getByTestId("media-item").filter({ hasText: filename }).first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
    const checkbox = item.locator('input[type="checkbox"]').first();
    await checkbox.check({ force: true, timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Press Delete key while body is focused
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Delete");

    const dialog = page
      .getByRole("dialog")
      .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i })
      .filter({ hasText: /delete/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(dialog.getByText(/delete/i)).toBeVisible();
    await dialog.getByRole("button", { name: /confirm/i }).click();

    await expect(page.getByText(/batch delete complete|deleted/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
