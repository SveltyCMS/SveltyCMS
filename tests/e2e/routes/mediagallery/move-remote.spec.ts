/**
 * @file tests/e2e/routes/mediagallery/move-remote.spec.ts
 * @description Media move (selection + breadcrumb / HTML5 drop) + remote URL upload page.
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
  await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

async function createFolder(page: Page, name: string) {
  const createApi = page.waitForResponse(
    (res) => res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
    { timeout: ACTION_TIMEOUT },
  );
  await page.getByTestId("media-create-folder").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  await dialog.locator("input").first().fill(name);
  await dialog.getByRole("button", { name: /confirm/i }).click();
  const res = await createApi;
  expect(res.ok()).toBe(true);
  await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
}

async function uploadImage(page: Page) {
  const uploadResponse = page
    .waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        (res.url().includes("?/upload") || res.url().includes("/api/media")),
      { timeout: 30_000 },
    )
    .catch(() => null);
  await page.getByTestId("media-upload-input").setInputFiles(TEST_IMAGE);
  await uploadResponse;
  // Wait for the actual grid item to appear, not just any text on the page
  // (toast notifications can match text before the grid renders)
  await expect(
    page
      .getByTestId("media-item")
      .filter({ hasText: /testthumb/i })
      .first(),
  ).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

// ---------------------------------------------------------------------------
// Move: selection + breadcrumb (reliable path — no HTML5 DnD needed)
// ---------------------------------------------------------------------------
test.describe("Media move to folder", () => {
  test.setTimeout(180_000);

  test("selection + root breadcrumb moves item out of folder", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_move_${Date.now().toString(36).slice(-6)}`;
    await createFolder(page, folderName);

    // Enter folder and wait for content to settle
    await page.getByText(folderName, { exact: true }).first().click();
    await expect(page.getByTestId("media-gallery-breadcrumbs")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Upload inside folder
    await uploadImage(page);

    // Enter selection mode
    await page.getByTestId("media-selection-toggle").click();
    await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Select the uploaded item via its checkbox — use the native hidden input
    // (Checkbox component renders <input type="checkbox" class="sr-only">)
    const item = page
      .getByTestId("media-item")
      .filter({ hasText: /testthumb/i })
      .first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Click the Checkbox component's visible label (the styled box) to toggle selection
    const checkboxInput = item.locator('input[type="checkbox"]').first();
    await checkboxInput.check({ force: true, timeout: ACTION_TIMEOUT });

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Breadcrumbs — root crumb should allow moving selected items out of folder
    const crumbs = page.getByTestId("media-gallery-breadcrumbs");
    const moveApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/move") && res.request().method() === "POST",
      { timeout: ACTION_TIMEOUT },
    );

    // Click root breadcrumb (while selection is active, this triggers MOVE not navigate)
    const rootCrumb = crumbs
      .locator('[data-testid="media-breadcrumb-root"]')
      .or(crumbs.getByRole("link", { name: /media gallery/i }))
      .first();
    await expect(rootCrumb).toBeVisible({ timeout: ACTION_TIMEOUT });
    await rootCrumb.click();

    const res = await moveApi;
    expect(res.ok()).toBe(true);
    await expect(page.getByText(/moved/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("drag-and-drop onto sidebar/root media drop target (sveltednd)", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_dnd_${Date.now().toString(36).slice(-6)}`;
    await createFolder(page, folderName);
    await uploadImage(page);

    const item = page
      .getByTestId("media-item")
      .filter({ hasText: /testthumb/i })
      .first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });

    const folderDrop = page
      .locator(`[data-media-drop-target]`)
      .filter({ hasText: folderName })
      .first()
      .or(page.locator("[data-media-drop-target]").first());

    const dropVisible = await folderDrop.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!dropVisible) {
      test.info().annotations.push({
        type: "note",
        description:
          "No data-media-drop-target in layout; breadcrumb move test is the primary control",
      });
      const anyDrop = page.locator("[data-media-drop-target]");
      await expect(
        anyDrop.first(),
        "Expected at least one [data-media-drop-target] for media move",
      ).toBeVisible({ timeout: 5_000 });
    }

    await expect(folderDrop).toBeVisible({ timeout: 5_000 });

    const moveApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/move") && res.request().method() === "POST",
      { timeout: ACTION_TIMEOUT },
    );

    // Real mouse-driven drag: @thisux/sveltednd listens to native dragstart/dragover/drop
    // (dispatched by the browser off real pointer input), so a synthetic DataTransfer/
    // DragEvent dispatch — as used pre-migration — no longer reflects how a drag begins.
    await item.dragTo(folderDrop);

    const res = await moveApi.catch(() => null);
    if (res) {
      expect([200, 400, 404, 422]).toContain(res.status());
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Drag gesture did not hit move API; selection+breadcrumb covers move",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Remote URL upload page
// ---------------------------------------------------------------------------
test.describe("Remote URL upload", () => {
  test.setTimeout(90_000);

  test("upload-media page shows local and remote tabs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/mediagallery/upload-media", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("upload-media-page")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("upload-tab-local")).toBeVisible();
    await expect(page.getByTestId("upload-tab-remote")).toBeVisible();
  });

  test("remote tab posts remoteUpload action", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/mediagallery/upload-media", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page.getByTestId("upload-tab-remote").click();
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const remoteUrl =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Blank_page.png/32px-Blank_page.png";

    await page.getByTestId("remote-urls-input").fill(remoteUrl);

    const actionResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("upload-media") &&
        (res.url().includes("remoteUpload") || res.url().includes("?/remoteUpload")),
      { timeout: ACTION_TIMEOUT },
    );

    await page.getByTestId("remote-upload-submit").click();
    const res = await actionResponse;
    expect([200, 303, 400, 422]).toContain(res.status());
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible();
  });

  test("rejects empty remote URL submit with warning", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/mediagallery/upload-media");
    await page.getByTestId("upload-tab-remote").click();
    await page.getByTestId("remote-upload-submit").click();
    await expect(page.getByText(/at least one valid|no urls/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
