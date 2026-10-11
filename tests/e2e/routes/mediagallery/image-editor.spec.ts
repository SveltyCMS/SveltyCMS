/**
 * @file tests/e2e/routes/mediagallery/image-editor.spec.ts
 * @description E2E for media image editor — open, tools, and save via manipulate API.
 * Hard-fails on upload/open (no soft-skip) so CI cannot green-pass empty paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent } from "../../helpers/cookie-consent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");
const ACTION_TIMEOUT = 25_000;

async function openGallery(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(
    page
      .getByTestId("admin-page-title")
      .or(page.getByTestId("media-gallery-toolbar"))
      .or(page.getByTestId("media-gallery-content"))
      .or(page.getByRole("heading", { name: /media/i }))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  // Upload input + card actions are inert until the client hydrates.
  await waitForHydration(page);
  await dismissCookieConsent(page);
}

async function uploadTestImage(page: Page) {
  await openGallery(page);

  const uploadInput = page.getByTestId("media-upload-input");
  await expect(uploadInput).toBeAttached({ timeout: 10_000 });
  await uploadInput.setInputFiles(TEST_IMAGE);

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

  const editButton = cell
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

    // The editor must POST the instruction set under `manipulations` (the exact
    // key POST /api/media/manipulate requires) and nothing else at top level.
    const posted = res.request().postDataJSON() as Record<string, unknown>;
    expect(posted).toHaveProperty("manipulations");
    expect(Object.keys(posted)).toEqual(["manipulations"]);

    await expect(page.getByText(/image processed and saved/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("opens every tool, compare, zoom, and the discard confirm", async ({ page }) => {
    await uploadTestImage(page);
    await openImageEditor(page);
    await waitForEditorReady(page);

    const dialog = page.getByRole("dialog", { name: /image editor/i });
    const mod = process.platform === "darwin" ? "Meta" : "Control";

    // Each tool's dock is rendered once the tab is selected. The proof target
    // differs per tool: most are buttons, but the focal-point X/Y are inputs.
    const tools: Array<{ tab: RegExp; role: "button" | "spinbutton"; proof: string }> = [
      { tab: /^crop/i, role: "button", proof: "Aspect ratio Free" },
      { tab: /^focal/i, role: "spinbutton", proof: "Focal X" },
      { tab: /^rotate/i, role: "button", proof: "Rotate left 90°" },
      { tab: /^fine-tune/i, role: "button", proof: "Auto" },
      { tab: /^blur/i, role: "button", proof: "Add blur region" },
      { tab: /^annotate/i, role: "button", proof: "Text" },
      { tab: /^watermark/i, role: "button", proof: "Add text" },
      { tab: /^zoom/i, role: "button", proof: "Fit image to screen" },
    ];

    for (const tool of tools) {
      const tab = dialog.getByRole("tab", { name: tool.tab });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(dialog.getByRole(tool.role, { name: tool.proof }).first()).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
    }

    await dialog.getByRole("tab", { name: /^crop/i }).click();
    await page.keyboard.press("1");
    await expect(dialog.getByRole("button", { name: "Aspect ratio 1:1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // `F` is the crop tool's free-crop key — pressing it must release 1:1.
    await page.keyboard.press("f");
    await expect(dialog.getByRole("button", { name: "Aspect ratio 1:1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const readout = dialog.getByRole("button", { name: "Fit image in view" });
    const beforeZoom = (await readout.innerText()).trim();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(readout).not.toHaveText(beforeZoom);
    await page.keyboard.press(`${mod}+Digit1`);
    await expect(readout).toHaveText("100%");

    const compare = dialog.getByRole("button", { name: "Toggle compare mode" });
    await compare.click();
    await expect(compare).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Backslash");
    await expect(compare).toHaveAttribute("aria-pressed", "false");

    page.once("dialog", (confirm) => confirm.dismiss());
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    page.once("dialog", (confirm) => confirm.accept());
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT });
  });
});
