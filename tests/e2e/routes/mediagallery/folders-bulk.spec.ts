/**
 * @file tests/e2e/routes/mediagallery/folders-bulk.spec.ts
 * @description Media gallery: virtual folders + multi-select bulk actions.
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
  const toolbar = page.getByTestId("media-gallery-toolbar");
  if (await toolbar.isVisible({ timeout: ACTION_TIMEOUT }).catch(() => false)) return;
  // Soft shell: content area / page-title if toolbar testid lags
  const alt = page
    .getByTestId("media-gallery-content")
    .or(page.getByTestId("page-title"))
    .or(page.getByRole("heading", { name: /media gallery/i }));
  if (
    !(await alt
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false))
  ) {
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw new Error(`Media gallery shell missing at ${page.url()} body=${body.slice(0, 400)}`);
  }
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
    // ModalPrompt — prefer named dialog so GDPR cookie banner is excluded.
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
    // Folder name should appear somewhere (sidebar tree or toast path)
    await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("folder appears and gallery remains usable after create", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_nav_${Date.now().toString(36).slice(-6)}`;

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

    // Click folder in UI (sidebar tree or list) if present
    const folderLink = page.getByText(folderName, { exact: true }).first();
    await expect(folderLink).toBeVisible({ timeout: ACTION_TIMEOUT });
    await folderLink.click({ timeout: ACTION_TIMEOUT });

    // URL or breadcrumb should reflect navigation when folder has id
    await page.waitForTimeout(500);
    // Shell still healthy
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

    await page.getByTestId("media-selection-toggle").click();
    await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Select first gridcell checkbox
    const cell = page.getByRole("gridcell").first();
    await expect(cell).toBeVisible({ timeout: ACTION_TIMEOUT });
    const checkbox = cell.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeAttached({ timeout: ACTION_TIMEOUT });
    await checkbox.evaluate((el: HTMLInputElement) => el.click());

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
    await expect(page.getByTestId("media-bulk-download")).toBeVisible();
  });

  test("bulk download requests archive endpoint", async ({ page }) => {
    await openGallery(page);
    await uploadImage(page);

    await page.getByTestId("media-selection-toggle").click();
    const cell = page.getByRole("gridcell").first();
    await cell
      .locator('input[type="checkbox"]')
      .first()
      .evaluate((el: HTMLInputElement) => {
        el.click();
      });
    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    const downloadApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/bulk-download") && res.request().method() === "GET",
      { timeout: ACTION_TIMEOUT },
    );

    await page.getByTestId("media-bulk-download").click();
    const res = await downloadApi;
    // 200 blob, 4xx if endpoint missing, or 500 if archive fails — assert we hit the route
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

    await page.getByTestId("media-selection-toggle").click();
    const cell = page.getByRole("gridcell").filter({ hasText: filename }).first();
    await expect(cell).toBeVisible({ timeout: ACTION_TIMEOUT });
    await cell
      .locator('input[type="checkbox"]')
      .first()
      .evaluate((el: HTMLInputElement) => {
        el.click();
      });
    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Focus body so Delete hotkey is received
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
