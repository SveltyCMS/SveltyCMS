/**
 * @file tests/e2e/routes/mediagallery/upload-optimization.spec.ts
 * @description Client-side image optimization contract for the local upload page.
 *
 * The upload page defaults `optimizeBeforeUpload` to ON and runs
 * `optimizeImage()` from `canvas-image-optimizer.ts` (Canvas 2D — the file was
 * historically named `webgpu-processor.ts`, a label that never matched the
 * implementation) before the bytes leave the browser: a 2400×1600 source is
 * clamped to the processor's 1920×1080 ceiling and re-encoded. This spec uploads
 * a real oversized PNG through the real dropzone and asserts the STORED
 * dimensions, so an optimizer regression cannot pass by only checking the
 * request succeeded.
 */

import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { waitForHydration } from "../../helpers/auth";
import { deleteMediaRow, openUploadMediaPage } from "../../helpers/media";

const SOURCE_WIDTH = 2400;
const SOURCE_HEIGHT = 1600;
/** `optimizeImage()` defaults: maxWidth 1920 / maxHeight 1080. */
const MAX_WIDTH = 1920;

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Media upload — client-side optimization", () => {
  test("downsizes an oversized image before storing it", async ({ page }) => {
    // Unique pixels per run: content-hash dedupe must not adopt a prior upload.
    const bytes = new Uint8Array(3);
    globalThis.crypto.getRandomValues(bytes);
    const source = await sharp({
      create: {
        width: SOURCE_WIDTH,
        height: SOURCE_HEIGHT,
        channels: 3,
        background: { r: bytes[0]!, g: bytes[1]!, b: bytes[2]! },
      },
    })
      .png()
      .toBuffer();

    await openUploadMediaPage(page);

    // The optimizer is ON by default and is the only checkbox on the dropzone.
    const optimizeToggle = page.locator('input[type="checkbox"]').first();
    await expect(optimizeToggle).toBeChecked();

    const filename = `e2e-optimized-${Date.now().toString(36)}.png`;
    await page
      .getByTestId("media-upload-dropzone")
      .locator('input[type="file"]')
      .setInputFiles({ name: filename, mimeType: "image/png", buffer: source });

    await expect(page.getByTestId("media-upload-queued").first()).toBeVisible({
      timeout: 15_000,
    });

    const uploadResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        (res.url().includes("?/upload") || res.url().includes("/api/media")),
      { timeout: 60_000 },
    );
    await page.getByTestId("media-upload-submit").click();
    const response = await uploadResponse;
    expect(response.ok(), `upload POST ${response.status()} ${response.url()}`).toBe(true);

    // Queue drains once the server accepted the file.
    await expect(page.getByTestId("media-upload-queued")).toHaveCount(0, { timeout: 60_000 });

    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const search = page.getByRole("searchbox", { name: /search media assets/i });
    await search.fill(filename);

    const card = page.getByTestId("media-item").filter({ hasText: filename }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const id = await card.getAttribute("data-media-id");
    expect(id, "uploaded card must expose a data-media-id").toBeTruthy();

    try {
      const detail = await page.request.get(`/api/media/${encodeURIComponent(id!)}`);
      expect(detail.ok(), `media detail ${detail.status()}`).toBe(true);
      const body = (await detail.json()) as {
        data?: { metadata?: { width?: number; height?: number } };
      };
      const storedWidth = body.data?.metadata?.width ?? 0;
      const storedHeight = body.data?.metadata?.height ?? 0;

      expect(storedWidth, "stored width").toBeGreaterThan(0);
      expect(storedWidth, "optimizer must clamp the width").toBeLessThanOrEqual(MAX_WIDTH);
      expect(storedHeight, "stored height").toBeGreaterThan(0);
      // Aspect ratio preserved by the Canvas pass (2400×1600 → 1920×1280).
      expect(storedHeight / storedWidth).toBeCloseTo(SOURCE_HEIGHT / SOURCE_WIDTH, 2);
    } finally {
      await deleteMediaRow(page, id!);
    }
  });
});
