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
  const uploadResponse = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().includes("?/upload") && res.ok(),
    { timeout: 30_000 },
  );
  await page.getByTestId("media-upload-input").setInputFiles(TEST_IMAGE);
  await uploadResponse;
  // Upload handler reloads the page once the file is persisted
  await page.waitForLoadState("load");
  const cell = page.getByRole("gridcell", { name: /testthumb\.png/i }).first();
  await expect(cell).toBeVisible({ timeout: 20_000 });
  // Grid renders the thumbnail image with an empty alt inside a labelled preview button.
  const thumb = cell
    .locator('button[aria-label*="testthumb.png" i] img:not([aria-hidden="true"])')
    .first();
  await expect(thumb).toBeVisible({ timeout: 10_000 });
  const imgSrc = await thumb.getAttribute("src");
  expect(imgSrc).toBeTruthy();
  expect(imgSrc).not.toMatch(/^data:/);
  expect(imgSrc).toMatch(/^\/files\/global\/[^/]+\/original\/.+\.(png|jpe?g|webp)$/i);

  // Wait until the browser has loaded the real file (not the blur placeholder).
  await expect
    .poll(
      async () =>
        thumb.evaluate((img: HTMLImageElement) =>
          img.complete && img.naturalWidth > 0 ? img.naturalWidth : 0,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  await cell.scrollIntoViewIfNeeded();
}

/** Hover overlay actions sit outside the scrollport; programmatic click avoids viewport flakes. */
async function openImageEditor(page: import("@playwright/test").Page) {
  const cell = page.getByRole("gridcell", { name: /testthumb\.png/i }).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();
  const editButton = cell.getByTestId("media-edit-button");
  await editButton.evaluate((btn) => (btn as HTMLButtonElement).click());
}

async function waitForEditorReady(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: /image editor/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  // Editor has two overlays: "Loading editor..." (pending imageElement) and
  // "Processing image..." (pending takeSnapshot + fit calculation)
  await expect(dialog.getByText("Loading editor...")).toBeHidden({
    timeout: 60_000,
  });
  await expect(dialog.getByText("Processing image...")).toBeHidden({
    timeout: 30_000,
  });
  await expect(dialog.getByText(/failed to load image/i).first()).toBeHidden({
    timeout: 5_000,
  });
  await expect(dialog.getByRole("tablist", { name: /image editing tools/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByRole("tab", { name: /^crop/i })).toBeEnabled({
    timeout: 30_000,
  });
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
    await expect(page.getByLabel("Image editor canvas")).toBeVisible({
      timeout: 15_000,
    });
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
