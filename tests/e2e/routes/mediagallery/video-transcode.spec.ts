/**
 * @file tests/e2e/routes/mediagallery/video-transcode.spec.ts
 * @description Video surface contract: the details modal mounts a player for any
 * video, swaps in the adaptive HLS player when `metadata.hls.master` exists, and
 * the transcode dialog posts the exact `POST /api/media/transcode` payload.
 *
 * `ffmpeg` availability is environment-dependent (absent locally, present on some
 * CI images), so the submit assertion accepts both real outcomes: `202` closes
 * the dialog, `503` explains the missing binary inline. The request payload is
 * asserted unconditionally.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { seedMediaWithMetadata } from "../../helpers/api";

const ACTION_TIMEOUT = 25_000;
const API_TIMEOUT = 60_000;

async function openGallery(page: Page): Promise<void> {
  await seedCookieConsent(page);
  await loginAsAdmin(page, "/mediagallery");
  await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("media-gallery-content")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await waitForHydration(page);
  await dismissCookieConsent(page);
}

async function openDetails(page: Page, filename: string) {
  const item = page.getByTestId("media-item").filter({ hasText: filename }).first();
  await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
  await item.hover();
  await item
    .getByTestId("media-grid-actions")
    .getByLabel(`Details for ${filename}`)
    .first()
    .click({ timeout: ACTION_TIMEOUT });

  const modal = page.getByTestId("media-details-modal");
  await expect(modal).toBeVisible({ timeout: ACTION_TIMEOUT });
  return modal;
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Media gallery — video playback + transcoding", () => {
  test.setTimeout(180_000);

  test("plays the stored source when no HLS derivative exists", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const plainName = `e2e-video-plain-${stamp}.mp4`;
    let createdIds: string[] = [];

    try {
      const seeded = await seedMediaWithMetadata(page, {
        items: [
          {
            filename: plainName,
            hash: `e2evidplain${stamp}`,
            path: `global/${plainName}`,
            size: 4096,
            mimeType: "video/mp4",
            metadata: {},
          },
          {
            filename: `e2e-video-filler-${stamp}.mp4`,
            hash: `e2evidfill${stamp}`,
            path: `global/e2e-video-filler-${stamp}.mp4`,
            size: 4096,
            mimeType: "video/mp4",
            metadata: {},
          },
        ],
      });
      createdIds = seeded.items.map((item) => item._id);
      const plainId = seeded.items.find((item) => item.filename === plainName)?._id;
      expect(plainId, "seeded video id").toBeTruthy();

      await openGallery(page);
      const modal = await openDetails(page, plainName);

      const player = modal.getByTestId("media-video-player");
      await expect(player).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(player).toHaveAttribute("data-mode", "direct");
      await expect(modal.getByTestId("media-hls-status")).toContainText(/original/i);

      // ── Transcode dialog ────────────────────────────────────────────────
      await modal.getByTestId("media-transcode-open").click();
      const form = page.getByTestId("transcode-form");
      await expect(form).toBeVisible({ timeout: ACTION_TIMEOUT });

      const requestPromise = page.waitForRequest(
        (request) => request.url().includes("/api/media/transcode") && request.method() === "POST",
        { timeout: API_TIMEOUT },
      );
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/media/transcode") && response.request().method() === "POST",
        { timeout: API_TIMEOUT },
      );

      await form.getByTestId("transcode-submit").click();

      const request = await requestPromise;
      const payload = request.postDataJSON() as {
        mediaId?: string;
        format?: string;
        resolutions?: string[];
        bitrate?: string;
      };
      expect(payload.mediaId).toBe(plainId);
      expect(payload.format).toBe("hls");
      expect(payload.resolutions).toEqual(["1080p", "720p", "480p"]);
      expect(payload.bitrate).toBe("auto");

      const response = await responsePromise;
      if (response.status() === 202) {
        const body = (await response.json()) as { data?: { status?: string } };
        expect(body.data?.status).toBe("processing");
        await expect(form).toBeHidden({ timeout: ACTION_TIMEOUT });
      } else {
        expect(response.status(), await response.text()).toBe(503);
        await expect(page.getByTestId("transcode-error")).toContainText(/ffmpeg/i);
      }
    } finally {
      for (const id of createdIds) {
        await page.request.delete(`/api/media/${encodeURIComponent(id)}`).catch(() => undefined);
      }
    }
  });

  test("uses the adaptive HLS player when metadata.hls.master exists", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const hlsName = `e2e-video-hls-${stamp}.mp4`;
    let createdIds: string[] = [];

    try {
      const seeded = await seedMediaWithMetadata(page, {
        items: [
          {
            filename: hlsName,
            hash: `e2evidhls${stamp}`,
            path: `global/${hlsName}`,
            size: 8192,
            mimeType: "video/mp4",
            metadata: {
              hls: {
                master: `/files/hls/e2e-${stamp}/master.m3u8`,
                variants: [{ resolution: "720p", height: 720, playlist: "v720/index.m3u8" }],
                createdAt: "2026-10-22T00:00:00.000Z",
              },
              transcode: { status: "ready", format: "hls" },
            },
          },
          {
            filename: `e2e-video-filler2-${stamp}.mp4`,
            hash: `e2evidfill2${stamp}`,
            path: `global/e2e-video-filler2-${stamp}.mp4`,
            size: 4096,
            mimeType: "video/mp4",
            metadata: {},
          },
        ],
      });
      createdIds = seeded.items.map((item) => item._id);

      await openGallery(page);
      const modal = await openDetails(page, hlsName);

      const player = modal.getByTestId("media-video-player");
      await expect(player).toBeVisible({ timeout: ACTION_TIMEOUT });
      // Chromium has no native HLS → hls.js attaches (mode "hls"); Safari reports
      // "native". Either way the player must not stay in its loading state.
      await expect
        .poll(async () => (await player.getAttribute("data-mode")) ?? "", {
          timeout: 20_000,
        })
        .not.toBe("loading");

      await expect(modal.getByTestId("media-hls-status")).toContainText(/ready/i);
      await expect(modal.getByTestId("media-hls-status")).toContainText(/1 rendition/i);
    } finally {
      for (const id of createdIds) {
        await page.request.delete(`/api/media/${encodeURIComponent(id)}`).catch(() => undefined);
      }
    }
  });
});
