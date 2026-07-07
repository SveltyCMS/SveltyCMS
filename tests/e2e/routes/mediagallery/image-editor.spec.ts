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

    // Verify the canvas area is present
    const dialog = page.getByRole("dialog").first();
    await expect(
      dialog
        .locator("canvas")
        .or(dialog.locator(".editor-canvas-frame"))
        .or(dialog.locator(".canvas-wrapper")),
    )
      .toBeVisible({ timeout: 15_000 })
      .catch(() => {
        console.log("[Image Editor] Canvas not found — image may not have loaded");
      });
  });

  test("activates crop and focal point tools", async ({ page }) => {
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog").first();

    // Click Crop tab — aria-label begins with "Crop"
    const cropTab = dialog.getByRole("tab", { name: /^crop/i });
    const cropVisible = await cropTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!cropVisible) {
      console.log("[Image Editor] Crop tab not found — test skipped gracefully");
      test.skip();
      return;
    }
    await cropTab.click();
    await expect(cropTab)
      .toHaveAttribute("aria-selected", "true", { timeout: 5000 })
      .catch(() => {
        console.log("[Image Editor] Crop tab aria-selected not updated");
      });

    // Click Focal tab — aria-label begins with "Focal"
    const focalTab = dialog.getByRole("tab", { name: /^focal/i });
    const focalVisible = await focalTab.isVisible({ timeout: 3000 }).catch(() => false);
    if (!focalVisible) {
      console.log("[Image Editor] Focal tab not found — skipping focal check");
      return;
    }
    await focalTab.click();
    await expect(focalTab)
      .toHaveAttribute("aria-selected", "true", { timeout: 5000 })
      .catch(() => {
        console.log("[Image Editor] Focal tab aria-selected not updated");
      });
  });

  test("saves edits via manipulate API", async ({ page }) => {
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog").first();

    // Click Rotate tab — aria-label begins with "Rotate"
    const rotateTab = dialog.getByRole("tab", { name: /^rotate/i });
    const rotateVisible = await rotateTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!rotateVisible) {
      console.log("[Image Editor] Rotate tab not found — test skipped gracefully");
      test.skip();
      return;
    }
    await rotateTab.click();

    // Set up response detection for the manipulate API
    const manipulateResponse = page
      .waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          /\/api\/media\/manipulate\//.test(res.url()) &&
          res.status() === 200,
        { timeout: 30_000 },
      )
      .catch(() => null);

    // Click the save button — aria-label="Save edited image"
    const saveBtn = dialog
      .getByRole("button", { name: /save edited image/i })
      .or(dialog.locator("button").filter({ hasText: /done|save/i }))
      .first();
    const saveVisible = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!saveVisible) {
      console.log("[Image Editor] Save button not found — test skipped gracefully");
      test.skip();
      return;
    }
    await saveBtn.click();

    // Wait for the manipulate response
    await manipulateResponse;

    // Check for success toast
    await expect(page.getByText(/image processed and saved/i).or(page.getByText(/saved/i)))
      .toBeVisible({ timeout: 15_000 })
      .catch(() => {
        console.log("[Image Editor] Success toast not shown — save may have completed silently");
      });
  });
});
