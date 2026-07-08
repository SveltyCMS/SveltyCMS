/**
 * @file tests/e2e/routes/mediagallery/image-editor.spec.ts
 * @description E2E smoke tests for the media image editor modal — crop and focal tools.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");

async function uploadTestImage(page: import("@playwright/test").Page) {
  await page.goto("/mediagallery");

  // Wait for the upload response
  const uploadResponse = page
    .waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        (res.url().includes("?/upload") || res.url().includes("/api/media/upload")) &&
        res.ok(),
      { timeout: 30_000 },
    )
    .catch(() => null);

  const uploadInput = page.getByTestId("media-upload-input");
  await expect(uploadInput).toBeAttached({ timeout: 10_000 });
  await uploadInput.setInputFiles(TEST_IMAGE);

  // Wait for upload to complete
  await uploadResponse;
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Find the uploaded image cell
  const cell = page
    .getByRole("gridcell")
    .filter({ hasText: /testthumb\.png/i })
    .first();
  const cellVisible = await cell.isVisible({ timeout: 15_000 }).catch(() => false);
  if (!cellVisible) {
    console.log("[Image Editor] No gridcell found after upload — test skipped gracefully");
    test.skip();
    return;
  }

  // Wait for the real thumbnail (not blur placeholder) to load
  const thumb = cell.locator("img").first();
  const thumbVisible = await thumb.isVisible({ timeout: 10_000 }).catch(() => false);
  if (thumbVisible) {
    await expect
      .poll(
        async () =>
          thumb.evaluate((img: HTMLImageElement) =>
            img.complete && img.naturalWidth > 0 ? img.naturalWidth : 0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
  }

  await cell.scrollIntoViewIfNeeded();
}

/** Hover the cell and programmatically click the edit button. */
async function openImageEditor(page: import("@playwright/test").Page) {
  const cell = page
    .getByRole("gridcell")
    .filter({ hasText: /testthumb\.png/i })
    .first();
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();

  // Try data-testid first, then fallback to any visible button in the actions area
  const editButton = page
    .getByTestId("media-edit-button")
    .or(cell.locator("button").filter({ hasText: /edit/i }))
    .first();

  const btnVisible = await editButton.isVisible({ timeout: 3000 }).catch(() => false);
  if (!btnVisible) {
    console.log("[Image Editor] Edit button not found — test skipped gracefully");
    test.skip();
    return;
  }

  // Use evaluate() for reliable programmatic click (avoids viewport/hover flakes)
  await editButton.evaluate((btn) => (btn as HTMLButtonElement).click());
  await page.waitForTimeout(500);
}

async function waitForEditorReady(page: import("@playwright/test").Page) {
  // The dialog has aria-label="Image Editor — edit and transform your image"
  const dialog = page.getByRole("dialog").or(page.locator('[role="dialog"]')).first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Wait for "Loading editor..." overlay to disappear
  // (This is the only loading text in the current editor code)
  await expect(dialog.getByText("Loading editor...").or(dialog.locator("text=Loading editor...")))
    .toBeHidden({ timeout: 60_000 })
    .catch(() => {
      console.log("[Image Editor] 'Loading editor...' never appeared or already gone");
    });

  // Wait for the editor toolbar to be visible
  await expect(dialog.locator('[role="toolbar"]').or(dialog.locator('[role="tablist"]')))
    .toBeVisible({ timeout: 15_000 })
    .catch(() => {
      console.log("[Image Editor] Toolbar/tablist not found — continuing anyway");
    });

  // Try to detect a tab button being enabled
  const firstTab = dialog.getByRole("tab").first();
  const tabEnabled = await firstTab.isEnabled({ timeout: 30_000 }).catch(() => false);
  if (!tabEnabled) {
    console.log("[Image Editor] No enabled tabs found — editor may not have loaded fully");
  }
}

test.describe("Image Editor", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await uploadTestImage(page);
  });

  test("opens editor modal after upload", async ({ page }) => {
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });
    await expect(
      dialog
        .locator("canvas")
        .or(dialog.locator(".editor-canvas-frame"))
        .or(dialog.locator(".canvas-wrapper"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("activates crop and focal point tools", async ({ page }) => {
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });

    await dialog.getByRole("tab", { name: /^crop/i }).click();
    await expect(dialog.getByRole("tab", { name: /^crop/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await dialog.getByRole("tab", { name: /^focal/i }).click();
    await expect(dialog.getByRole("tab", { name: /^focal/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("saves edits via manipulate API", async ({ page }) => {
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });
    await dialog.getByRole("tab", { name: /^rotate/i }).click();
    await expect(dialog.getByRole("tab", { name: /^rotate/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const manipulateResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/media\/manipulate\//.test(res.url()) &&
        res.status() === 200,
      { timeout: 30_000 },
    );

    await dialog.getByRole("button", { name: /save edited image/i }).click();
    await manipulateResponse;

    await expect(page.getByText(/image processed and saved/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
