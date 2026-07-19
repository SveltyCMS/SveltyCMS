/**
 * @file tests/e2e/routes/mediagallery/image-editor.spec.ts
 * @description E2E for media image editor — open, tools, and save via manipulate API.
 * Hard-fails on upload/open (no soft-skip) so CI cannot green-pass empty paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");
const ACTION_TIMEOUT = 25_000;

async function openGallery(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });
  await expect(
    page.getByTestId("page-title").or(page.getByRole("heading", { name: /media gallery/i })),
  ).toBeVisible({ timeout: ACTION_TIMEOUT });
}

async function uploadTestImage(page: Page) {
  await openGallery(page);

  const uploadResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("?/upload") || res.url().includes("/api/media")) &&
      res.status() < 500,
    { timeout: 30_000 },
  );

  const uploadInput = page.getByTestId("media-upload-input");
  await expect(uploadInput).toBeAttached({ timeout: 10_000 });
  await uploadInput.setInputFiles(TEST_IMAGE);

  const res = await uploadResponse;
  expect(res.ok() || res.status() === 200 || res.status() === 303).toBeTruthy();

  await expect(page.getByText(/testthumb\.png/i).first()).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });

  const cell = page
    .getByRole("gridcell")
    .filter({ hasText: /testthumb\.png/i })
    .first();
  await expect(cell).toBeVisible({ timeout: ACTION_TIMEOUT });
  await cell.scrollIntoViewIfNeeded();
}

async function openImageEditor(page: Page) {
  const cell = page
    .getByRole("gridcell")
    .filter({ hasText: /testthumb\.png/i })
    .first();
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();

  const editButton = page
    .getByTestId("media-edit-button")
    .or(cell.getByRole("button", { name: /edit/i }))
    .first();
  await expect(editButton).toBeVisible({ timeout: ACTION_TIMEOUT });
  await editButton.evaluate((btn) => (btn as HTMLButtonElement).click());
}

async function waitForEditorReady(page: Page) {
  const dialog = page.getByRole("dialog", { name: /image editor/i });
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });

  await expect(dialog.getByText("Loading editor..."))
    .toBeHidden({ timeout: 60_000 })
    .catch(() => undefined);

  await expect(
    dialog.getByRole("toolbar").or(dialog.getByRole("tablist")).or(dialog.getByRole("tab")).first(),
  ).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe("Image Editor", () => {
  test.setTimeout(120_000);

  test("opens editor modal after upload", async ({ page }) => {
    await uploadTestImage(page);
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });
    await expect(
      dialog
        .locator("canvas")
        .or(dialog.locator(".editor-canvas-frame"))
        .or(dialog.locator(".canvas-wrapper"))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("activates crop and focal point tools", async ({ page }) => {
    await uploadTestImage(page);
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

  test("saves edits via manipulate API and shows success toast", async ({ page }) => {
    await uploadTestImage(page);
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });

    // Apply a tool so save has a non-empty manipulation payload when possible
    const rotateTab = dialog.getByRole("tab", { name: /^rotate/i });
    if (await rotateTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rotateTab.click();
      await expect(rotateTab).toHaveAttribute("aria-selected", "true");
    } else {
      await dialog.getByRole("tab", { name: /^crop/i }).click();
    }

    const manipulateResponse = page.waitForResponse(
      (res) => res.request().method() === "POST" && /\/api\/media\/manipulate\//.test(res.url()),
      { timeout: 45_000 },
    );

    const saveBtn = dialog.getByRole("button", { name: /save edited image/i });
    await expect(saveBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
    await saveBtn.click();

    const res = await manipulateResponse;
    expect(res.ok()).toBe(true);

    await expect(page.getByText(/image processed and saved/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
