/**
 * @file tests/e2e/routes/mediagallery/media-resilience.spec.ts
 * @description E2E for the gallery's rendition ladder and missing-file state.
 *
 * The grid tries `preferred → thumbnail → sm → md → lg → original` and only
 * shows the "File missing" pill once every candidate 404s. These tests upload
 * through the real API so the stored row (path + thumbnails) is available, then
 * remove files from the harness-owned media root BEFORE the first navigation —
 * an already-loaded `<img>` URL is immutable-cached and would mask the deletion.
 *
 * ### Features:
 * - Deletes only the `sm` rendition and proves the M grid falls back to a live one
 * - Deletes the original plus every thumbnail and proves the missing state renders
 * - Guards every deletion to `process.env.MEDIA_FOLDER` ending in `tests/e2e/.media`
 * - Deletes every uploaded DB row in `finally`
 */

import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { test, expect, type Page } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/api";
import { deleteMediaRow, mediaCard, openMediaGallery } from "../../helpers/media";

const ACTION_TIMEOUT = 25_000;

/** Shape of `data` in POST /api/media/upload (the created row, before URL enrichment). */
interface UploadedMedia {
  _id: string | number;
  path?: string;
  url?: string;
  thumbnail?: { url?: string } | null;
  thumbnails?: Record<string, { url?: string; path?: string } | undefined>;
}

/**
 * The harness-owned media root. Anything outside `tests/e2e/.media` is refused
 * so a mis-set env can never delete a developer's real uploads.
 */
function requireMediaRoot(): string {
  const configured = process.env.MEDIA_FOLDER;
  expect(configured, "MEDIA_FOLDER must be set to the E2E harness media root").toBeTruthy();

  const root = path.resolve(configured!);
  const expectedSuffix = `${path.sep}tests${path.sep}e2e${path.sep}.media`;
  expect(
    root.endsWith(expectedSuffix),
    `refusing to delete outside the E2E media root (${expectedSuffix}): ${root}`,
  ).toBe(true);
  return root;
}

/** Resolve a `/files/...` URL to its on-disk path, refusing anything outside the root. */
function toMediaDiskPath(url: string, root: string): string {
  expect(url.startsWith("/files/"), `expected a /files/ URL, got: ${url}`).toBe(true);

  const relative = decodeURIComponent(url.slice("/files/".length)).replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  expect(
    resolved.startsWith(root + path.sep),
    `refusing to delete a path outside the E2E media root: ${resolved}`,
  ).toBe(true);
  return resolved;
}

async function removeMediaFile(filePath: string, mustExist = false): Promise<void> {
  if (mustExist) {
    try {
      await stat(filePath);
    } catch {
      throw new Error(`uploaded media file is missing from disk: ${filePath}`);
    }
  }

  try {
    await unlink(filePath);
  } catch (err) {
    // A clamped rendition may never have been written; anything else is a real failure.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Unique 1200×900 PNG so sm/md/lg derivatives are generated and dedupe cannot reuse a row. */
async function uniqueLargePng(filename: string) {
  const bytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(bytes);
  const seed = (bytes[0]! % 200) + 20;

  const buffer = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: {
        r: seed,
        g: (seed * 7 + bytes[1]!) % 255,
        b: (seed * 13 + bytes[2]!) % 255,
      },
    },
  })
    .png()
    .toBuffer();

  return { name: filename, mimeType: "image/png", buffer };
}

/** Upload through the API so the full row (`path`, `thumbnails`) is available. */
async function uploadViaApi(page: Page, filename: string): Promise<UploadedMedia> {
  const file = await uniqueLargePng(filename);
  const origin = new URL(page.url()).origin;

  const response = await page.request.post("/api/media/upload", {
    headers: { ...TEST_API_HEADERS, Origin: origin },
    multipart: { files: file },
  });
  const text = await response.text();

  expect(response.status(), `direct upload failed: ${text.slice(0, 400)}`).toBe(200);
  const body = JSON.parse(text) as {
    success?: boolean;
    data?: Array<{ success?: boolean; message?: string; data?: UploadedMedia }>;
  };
  const uploaded = body.data?.[0];
  expect(uploaded?.success, `direct upload rejected: ${text.slice(0, 400)}`).toBe(true);
  expect(uploaded?.data?._id, "direct upload must return the stored row").toBeTruthy();

  return uploaded!.data!;
}

/** The original URL as stored/enriched on the row. */
function originalUrl(media: UploadedMedia): string {
  if (media.url) return media.url;

  const stored = (media.path ?? "").replace(/^\/files\//, "").replace(/^\/+/, "");
  expect(stored, "uploaded row must expose a path or url").toBeTruthy();
  return `/files/${stored}`;
}

/** Every URL the grid tile can try for this image, original included. */
function previewCandidates(media: UploadedMedia): string[] {
  const urls = new Set<string>([originalUrl(media)]);
  if (media.thumbnail?.url) urls.add(media.thumbnail.url);
  for (const thumbnail of Object.values(media.thumbnails ?? {})) {
    if (thumbnail?.url) urls.add(thumbnail.url);
  }
  return [...urls];
}

/**
 * Cycle the single grid-size control to `medium` (S/thumbnail → M/sm → L/md).
 * Each click waits for `data-size` to change, so a fast loop cannot skip a step.
 */
async function ensureGridSize(page: Page, size: "medium"): Promise<void> {
  const toggle = page.getByTestId("media-grid-size-toggle");
  await expect(toggle).toBeVisible({ timeout: 10_000 });

  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await toggle.getAttribute("data-size");
    if (current === size) return;

    await toggle.click();
    await expect(toggle).not.toHaveAttribute("data-size", current ?? "");
  }
  await expect(toggle).toHaveAttribute("data-size", size);
}

test.describe("Media gallery resilience", () => {
  test.setTimeout(180_000);

  test("falls back to the next rendition when the preferred one is missing", async ({ page }) => {
    const mediaRoot = requireMediaRoot();
    await loginAsAdmin(page);

    const filename = `e2e-fallback-${randomUUID().slice(0, 8)}.png`;
    const media = await uploadViaApi(page, filename);

    try {
      const smUrl = media.thumbnails?.sm?.url;
      expect(
        smUrl,
        `upload must generate an sm rendition: ${JSON.stringify(media.thumbnails)}`,
      ).toBeTruthy();

      const smPath = toMediaDiskPath(smUrl!, mediaRoot);
      await removeMediaFile(smPath, true);

      await openMediaGallery(page);
      const card = mediaCard(page, filename);
      await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
      await card.scrollIntoViewIfNeeded();

      // Default density is S (thumbnail). The switch to M prefers `sm`, so the
      // deleted rendition is the first candidate the tile requests.
      const toggle = page.getByTestId("media-grid-size-toggle");
      await expect(toggle).toHaveAttribute("data-size", "small");

      const smMiss = page.waitForResponse(
        (res) => new URL(res.url()).pathname === smUrl && res.status() === 404,
        { timeout: 30_000 },
      );
      await ensureGridSize(page, "medium");
      const missed = await smMiss;
      expect(missed.status(), `grid must request the deleted sm rendition ${smUrl}`).toBe(404);

      const image = card.locator("img").first();
      await expect(image).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(image).toHaveAttribute("src", /\/(thumbnail|md|lg)\//, {
        timeout: 20_000,
      });
      const decoded = await image.evaluate((element) => (element as HTMLImageElement).naturalWidth);
      expect(
        decoded,
        "the fallback rendition must decode, not paint a broken image",
      ).toBeGreaterThan(0);
      await expect(card.getByText("File missing", { exact: true })).toHaveCount(0);
    } finally {
      await deleteMediaRow(page, String(media._id));
    }
  });

  test("shows File missing when the original and every thumbnail are gone", async ({ page }) => {
    const mediaRoot = requireMediaRoot();
    await loginAsAdmin(page);

    const filename = `e2e-missing-${randomUUID().slice(0, 8)}.png`;
    const media = await uploadViaApi(page, filename);

    try {
      const original = originalUrl(media);
      const candidates = previewCandidates(media);
      expect(
        candidates.length,
        "upload must expose the original plus at least one generated thumbnail",
      ).toBeGreaterThan(1);

      // Delete before the first gallery navigation: a cached `<img>` response
      // would otherwise keep painting the file the test just removed.
      for (const url of candidates) {
        await removeMediaFile(toMediaDiskPath(url, mediaRoot), url === original);
      }

      await openMediaGallery(page);
      const card = mediaCard(page, filename);
      await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
      await card.scrollIntoViewIfNeeded();

      await expect(card.getByText("File missing", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(card.locator('iconify-icon[icon="mdi:image-off-outline"]').first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await deleteMediaRow(page, String(media._id));
    }
  });
});
