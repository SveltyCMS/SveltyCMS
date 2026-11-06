/**
 * @file tests/e2e/routes/mediagallery/batch-processing.spec.ts
 * @description Batch resize/filter contract for the gallery's selection panel.
 *
 * Uploads real oversized images, drives the mounted `batch-processor.svelte`
 * panel, waits for `POST /api/media/batch-process`, then reads the stored file
 * back through Sharp — a regression in the resize cannot pass by asserting the
 * toast alone.
 */

import { expect, test, type Page } from "../../fixtures";
import sharp from "sharp";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { seedMediaWithMetadata } from "../../helpers/api";
import { deleteMediaRow } from "../../helpers/media";

const ACTION_TIMEOUT = 25_000;
const API_TIMEOUT = 60_000;
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 480;

interface UploadedAsset {
  id: string;
  name: string;
}

async function openGallery(page: Page): Promise<void> {
  await seedCookieConsent(page);
  await loginAsAdmin(page, "/mediagallery");
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("media-gallery-content")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await waitForHydration(page);
  await dismissCookieConsent(page);
}

/** CSPRNG + per-call pixels so content-hash dedupe cannot collapse two uploads. */
async function uniqueSource(seed: number): Promise<Buffer> {
  const bytes = new Uint8Array(1);
  globalThis.crypto.getRandomValues(bytes);
  const offset = bytes[0]! % 120;
  return sharp({
    create: {
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
      channels: 3,
      background: { r: (seed + offset) % 255, g: (seed * 7 + offset) % 255, b: 40 },
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function uploadImages(page: Page, prefix: string, count: number): Promise<UploadedAsset[]> {
  const stamp = Date.now().toString(36);
  const files = await Promise.all(
    Array.from({ length: count }, async (_, index) => ({
      name: `${prefix}-${stamp}-${index}.jpg`,
      mimeType: "image/jpeg",
      buffer: await uniqueSource(index * 31 + 17),
    })),
  );

  const uploaded: UploadedAsset[] = [];
  for (const file of files) {
    // Upload one file per request: a multi-file `setInputFiles` fires several
    // POSTs, and waiting for the first then reloading aborts the rest.
    //
    // Wait on the OUTCOME (the rendered card), not on a response event: the
    // uploader disables/swaps the input while the previous upload revalidates,
    // so a fixed `waitForResponse` predicate can miss the request shape entirely
    // and hang for the whole timeout (the CI retried-pass flake). The card is
    // only rendered from a persisted row, so it is the stronger assertion.
    const input = page.getByTestId("media-upload-input");
    await expect(input).toBeEnabled({ timeout: ACTION_TIMEOUT });
    await input.setInputFiles(file);
    await expect(
      page.getByTestId("media-item").filter({ hasText: file.name }).first(),
      `upload of ${file.name} must render a media card`,
    ).toBeVisible({ timeout: API_TIMEOUT });
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  for (const file of files) {
    const card = page.getByTestId("media-item").filter({ hasText: file.name }).first();
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
    const id = await card.getAttribute("data-media-id");
    expect(id, `${file.name} must expose a data-media-id`).toBeTruthy();
    uploaded.push({ id: id!, name: file.name });
  }
  return uploaded;
}

async function selectAssets(page: Page, assets: UploadedAsset[]): Promise<void> {
  await page.getByTestId("media-selection-toggle").click();
  await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute("aria-pressed", "true");

  for (const asset of assets) {
    const item = page.getByTestId("media-item").filter({ hasText: asset.name }).first();
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
    // The native Checkbox input is sr-only — click its visible label.
    await item.locator("label").first().click({ timeout: ACTION_TIMEOUT });
  }

  await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("media-bulk-count")).toContainText(
    new RegExp(`^${assets.length} selected`, "i"),
  );
}

/** Read the persisted original and measure it — the response echo is not proof. */
async function storedDimensions(
  page: Page,
  mediaId: string,
): Promise<{ width: number; height: number }> {
  const res = await page.request.get(`/api/media/${encodeURIComponent(mediaId)}`);
  expect(res.ok(), `GET /api/media/${mediaId}`).toBe(true);
  const body = (await res.json()) as { data?: { url?: string; path?: string } };
  const fileUrl = body.data?.url ?? `/files/${body.data?.path ?? ""}`;
  const fileResponse = await page.request.get(fileUrl);
  expect(fileResponse.ok(), `GET ${fileUrl}`).toBe(true);
  const meta = await sharp(Buffer.from(await fileResponse.body())).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function deleteMedia(page: Page, assets: UploadedAsset[]): Promise<void> {
  for (const asset of assets) {
    await page.request.delete(`/api/media/${encodeURIComponent(asset.id)}`).catch(() => undefined);
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Media gallery — batch processing", () => {
  test.setTimeout(180_000);

  test("resizes a selection and persists the new pixel width", async ({ page }) => {
    let assets: UploadedAsset[] = [];

    try {
      await openGallery(page);
      assets = await uploadImages(page, "e2e-batch", 2);
      await selectAssets(page, assets);

      await page.getByTestId("media-bulk-batch-process").click();
      const panel = page.getByTestId("batch-processor");
      await expect(panel).toBeVisible({ timeout: ACTION_TIMEOUT });

      await panel.getByTestId("batch-operation-resize").click();
      await expect(panel.getByTestId("batch-operation-resize")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await panel.getByTestId("batch-width").fill("320");

      const batchResponse = page.waitForResponse(
        (res) =>
          res.url().includes("/api/media/batch-process") && res.request().method() === "POST",
        { timeout: API_TIMEOUT },
      );
      await panel.getByTestId("batch-run").click();

      const response = await batchResponse;
      expect(response.status(), await response.text()).toBe(200);
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { processed?: number; failed?: number };
      };
      expect(payload.success).toBe(true);
      expect(payload.data?.processed).toBe(2);
      expect(payload.data?.failed).toBe(0);

      await expect(page.getByText(/Processed 2 assets/i)).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      await expect(panel).toBeHidden({ timeout: ACTION_TIMEOUT });

      for (const asset of assets) {
        expect(await storedDimensions(page, asset.id)).toEqual({ width: 320, height: 240 });
      }
    } finally {
      await deleteMedia(page, assets);
    }
  });

  test("applies a filter preset to a single asset", async ({ page }) => {
    let assets: UploadedAsset[] = [];

    try {
      await openGallery(page);
      assets = await uploadImages(page, "e2e-filter", 1);
      await selectAssets(page, assets);

      await page.getByTestId("media-bulk-batch-process").click();
      const panel = page.getByTestId("batch-processor");
      await expect(panel).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(panel.getByTestId("batch-operation-filter")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const batchResponse = page.waitForResponse(
        (res) =>
          res.url().includes("/api/media/batch-process") && res.request().method() === "POST",
        { timeout: API_TIMEOUT },
      );
      await panel.getByTestId("batch-run").click();

      const response = await batchResponse;
      expect(response.status(), await response.text()).toBe(200);
      const payload = (await response.json()) as {
        data?: { processed?: number; failed?: number };
      };
      expect(payload.data?.processed).toBe(1);

      await expect(page.getByText(/Processed 1 asset/i)).toBeVisible({ timeout: ACTION_TIMEOUT });

      // Filtering keeps the frame; only the pixels change.
      expect(await storedDimensions(page, assets[0]!.id)).toEqual({
        width: SOURCE_WIDTH,
        height: SOURCE_HEIGHT,
      });
    } finally {
      await deleteMedia(page, assets);
    }
  });

  test("skips non-image selections before calling the batch API", async ({ page }) => {
    const stamp = Date.now().toString(36);
    let assets: UploadedAsset[] = [];
    let seededIds: string[] = [];

    try {
      await openGallery(page);
      assets = await uploadImages(page, "e2e-batch-mixed", 1);

      // Two document rows give the helper its ≥2 contract; both are non-images.
      const seeded = await seedMediaWithMetadata(page, {
        items: [0, 1].map((index) => ({
          filename: `e2e-batch-doc-${stamp}-${index}.pdf`,
          originalFilename: `e2e-batch-doc-${stamp}-${index}.pdf`,
          hash: `e2ebatchdoc${stamp}${index}`,
          path: `global/e2e-batch-doc-${stamp}-${index}.pdf`,
          size: 256,
          mimeType: "application/pdf",
          metadata: {},
        })),
      });
      seededIds = seeded.items.map((item) => item._id);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      await selectAssets(page, [
        ...assets,
        ...seeded.items.map((item) => ({ id: item._id, name: item.filename })),
      ]);

      await page.getByTestId("media-bulk-batch-process").click();
      const panel = page.getByTestId("batch-processor");
      await expect(panel).toBeVisible({ timeout: ACTION_TIMEOUT });

      // The pre-flight names the skipped documents and the run button counts images only.
      await expect(panel.getByTestId("batch-skipped-note")).toContainText(
        /2 non-image assets will be skipped/i,
      );
      await expect(panel.getByTestId("batch-run")).toContainText(/Run\s*1\s*image/i);

      const batchRequest = page.waitForRequest(
        (req) => req.url().includes("/api/media/batch-process") && req.method() === "POST",
        { timeout: API_TIMEOUT },
      );
      const batchResponse = page.waitForResponse(
        (res) =>
          res.url().includes("/api/media/batch-process") && res.request().method() === "POST",
        { timeout: API_TIMEOUT },
      );
      await panel.getByTestId("batch-run").click();

      const request = await batchRequest;
      const body = JSON.parse(request.postData() ?? "{}") as { ids?: string[] };
      expect(body.ids).toEqual([assets[0]!.id]);

      const response = await batchResponse;
      expect(response.status(), await response.text()).toBe(200);
      await expect(page.getByText(/Processed 1 asset/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
    } finally {
      await deleteMedia(page, assets);
      for (const id of seededIds) await deleteMediaRow(page, id);
    }
  });
});
