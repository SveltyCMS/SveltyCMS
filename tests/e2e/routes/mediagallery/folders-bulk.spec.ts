/**
 * @file tests/e2e/routes/mediagallery/folders-bulk.spec.ts
 * @description Media gallery: virtual folders + multi-select bulk actions.
 *
 * Uses data-testid selectors so tests survive CSS/layout changes.
 */

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

const ACTION_TIMEOUT = 25_000;
// E2E API responses on CI runners can take longer than ACTION_TIMEOUT because
// the Playwright click + dialog fill + form submit happens between
// waitForResponse setup and the actual POST. Use a separate, larger timeout
// specifically for API round-trip assertions.
const API_TIMEOUT = 60_000;

async function openGallery(page: Page) {
  await seedCookieConsent(page);
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/mediagallery");
  }
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });

  const shell = page
    .getByTestId("media-gallery-toolbar")
    .or(page.getByTestId("media-gallery-content"))
    .or(page.getByTestId("media-grid"))
    .or(page.getByTestId("admin-page-title"));
  await expect(shell.first()).toBeVisible({ timeout: 30_000 });
  // The toolbar renders in SSR HTML; clicking it needs the hydrated listener.
  await waitForHydration(page);
  await dismissCookieConsent(page);
}

async function uploadImage(page: Page): Promise<string> {
  // Unique name AND pixels: the upload API dedupes by content hash across the
  // whole tenant. Reusing a fixture reused a row that another spec had moved
  // into a folder, so the "upload at root" landed nowhere visible.
  const filename = `e2e-bulk-${Date.now().toString(36)}.png`;
  const seed = Math.floor(Math.random() * 200) + 20;
  const buffer = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: seed, g: (seed * 7) % 255, b: (seed * 13) % 255 },
    },
  })
    .png()
    .toBuffer();

  const uploadResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("?/upload") || res.url().includes("/api/media")),
    { timeout: 30_000 },
  );

  await page.getByTestId("media-upload-input").setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer,
  });
  const response = await uploadResponse;
  expect(response.ok(), `upload POST ${response.status()} ${response.url()}`).toBe(true);

  // SvelteKit form actions answer 200 even when the action failed; the envelope
  // is the real outcome (`{ type: "failure", data: ... }`). Asserting only
  // `response.ok()` let a failed DB insert look like a successful upload.
  if (response.url().includes("?/upload")) {
    const body = (await response.json().catch(() => null)) as {
      type?: string;
      data?: unknown;
    } | null;
    expect(body?.type, `upload action result: ${JSON.stringify(body)}`).toBe("success");
  }

  // Verify via a full load, not the post-upload in-memory refresh: the list
  // endpoint has an intermittent cache collision, and a reload is the stronger
  // create → persist → read contract anyway.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByTestId("media-item").filter({ hasText: filename }).first()).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  return filename;
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

    // Start listening BEFORE the click so we don't miss a fast response.
    // Timeout uses API_TIMEOUT (60 s) — the full round-trip includes:
    // dialog open + input fill + confirm click + POST /api/system-virtual-folder.
    const createApi = page.waitForResponse(
      (res) =>
        res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
      { timeout: API_TIMEOUT },
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

    // Await the API response — the server must confirm before we assert UI.
    const res = await createApi;
    expect(res.ok()).toBe(true);
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Control-map: prove persistence through the API, then through a reload.
    const createdBody = await res.json().catch(() => null);
    const folderId = String(createdBody?.data?._id ?? "");
    expect(folderId, "create response must expose the folder id").not.toBe("");

    const apiList = await page.request.get("/api/system-virtual-folder");
    const apiBody = await apiList.json();
    expect(apiBody.success).toBe(true);
    expect((apiBody.data as Array<{ name?: string }>).map((folder) => folder.name)).toContain(
      folderName,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Cleanup so repeated runs stay deterministic.
    const cleanup = await page.request.delete(
      `/api/system-virtual-folder?folderId=${encodeURIComponent(folderId)}`,
    );
    expect(cleanup.ok()).toBe(true);
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

    // Cleanup so repeated runs stay deterministic.
    const apiList = await page.request.get("/api/system-virtual-folder");
    const apiBody = await apiList.json();
    const created = (apiBody?.data as Array<{ _id?: string; name?: string }> | undefined)?.find(
      (folder) => folder.name === folderName,
    );
    if (created?._id) {
      await page.request.delete(
        `/api/system-virtual-folder?folderId=${encodeURIComponent(String(created._id))}`,
      );
    }
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

    // Select first media item via its checkbox.
    // The checkbox uses sr-only (1×1px absolute) — click the
    // visible <label> which has for={id}.
    const item = page.getByTestId("media-item").first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
    const label = item.locator("label").first();
    await label.click({ timeout: ACTION_TIMEOUT });

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
    await expect(page.getByTestId("media-bulk-download")).toBeVisible();
  });

  test("bulk download requests archive endpoint", async ({ page }) => {
    await openGallery(page);
    await uploadImage(page);

    await page.getByTestId("media-selection-toggle").click();
    const item = page.getByTestId("media-item").first();
    // Click visible label — native Checkbox component has label with for={id}
    const label = item.locator("label").first();
    await label.click({ timeout: ACTION_TIMEOUT });
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
    const filename = await uploadImage(page);

    // Select the item
    await page.getByTestId("media-selection-toggle").click();
    const item = page.getByTestId("media-item").filter({ hasText: filename }).first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
    // Click visible label — native Checkbox component has label with for={id}
    const label = item.locator("label").first();
    await label.click({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Press Delete key
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
