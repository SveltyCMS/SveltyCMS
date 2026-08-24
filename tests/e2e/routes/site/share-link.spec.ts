/**
 * @file tests/e2e/routes/site/share-link.spec.ts
 * @description Public media share links — /share/[token]?id=<mediaId>.
 *
 * Routes covered (previously untested): /share/[token] (+ /api/media/share gate).
 * Token validation contract: valid → 200 render, unknown token → 404,
 * expired link → 410, missing id → 404.
 *
 * Seed-first policy (control-map): media rows carrying metadata.sharedLinks are
 * provisioned via the testing API in beforeAll; seed success is asserted.
 */

import { expect, test } from "@playwright/test";
import { seedMediaWithMetadata } from "../../helpers/api";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";

const RUN_STAMP = Date.now().toString(36);
const VALID_TOKEN = `e2e-share-${RUN_STAMP}`;
const EXPIRED_TOKEN = `e2e-share-expired-${RUN_STAMP}`;

test.describe("Public media share links", () => {
  // Guests must not inherit the admin storageState — blank context per test.
  test.use({ storageState: { cookies: [], origins: [] } });

  let validMediaId = "";
  let expiredMediaId = "";
  let sharedFilename = "";

  test.beforeAll(async ({ request }) => {
    const seeded = await seedMediaWithMetadata(
      { request },
      {
        items: [
          {
            filename: `e2e-share-${RUN_STAMP}.png`,
            originalFilename: `e2e-share-${RUN_STAMP}.png`,
            hash: `e2eshare${RUN_STAMP}`,
            path: `global/e2e-share-${RUN_STAMP}.png`,
            size: 2048,
            mimeType: "image/png",
            metadata: {
              sharedLinks: [
                { token: VALID_TOKEN, expiry: new Date(Date.now() + 24 * 3600e3).toISOString() },
              ],
            },
          },
          {
            filename: `e2e-share-expired-${RUN_STAMP}.png`,
            originalFilename: `e2e-share-expired-${RUN_STAMP}.png`,
            hash: `e2esharex${RUN_STAMP}`,
            path: `global/e2e-share-expired-${RUN_STAMP}.png`,
            size: 2048,
            mimeType: "image/png",
            metadata: {
              sharedLinks: [
                { token: EXPIRED_TOKEN, expiry: new Date(Date.now() - 3600e3).toISOString() },
              ],
            },
          },
        ],
      },
    );
    expect(
      seeded.items.length,
      "seed-media-with-metadata must create ≥2 items",
    ).toBeGreaterThanOrEqual(2);
    validMediaId = String(seeded.items[0]._id);
    sharedFilename = String(seeded.items[0].filename);
    expiredMediaId = String(seeded.items[1]._id);
    expect(validMediaId, "seeded media must return an _id").toBeTruthy();
  });

  test("valid token + id renders the share page with a download button", async ({ page }) => {
    // The app is SPA-shell (`ssr = false` in src/routes/+layout.ts): the server
    // always answers page routes with the shell (200); the load runs
    // client-side. Assert the rendered outcome, not the server status.
    await page.goto(`/share/${VALID_TOKEN}?id=${validMediaId}`, {
      waitUntil: "domcontentloaded",
    });

    await dismissCookieBannerIfPresent(page);
    // The filename renders as the page's <h1 class="file-title">.
    await expect(page.getByText(sharedFilename, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    // Non-password link renders a direct download control (rendered as a
    // <button> — the Button component with href + onclick prefers button).
    await expect(page.getByRole("button", { name: /download file/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("unknown token shows the not-found page", async ({ page }) => {
    await page.goto(`/share/does-not-exist-${RUN_STAMP}?id=${validMediaId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissCookieBannerIfPresent(page);
    // The load throws error(404) client-side; +error.svelte renders the
    // generic 404 page (status + "Page not found").
    await expect(page.getByText(/404|page not found/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("expired link shows the gone page", async ({ page }) => {
    await page.goto(`/share/${EXPIRED_TOKEN}?id=${expiredMediaId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissCookieBannerIfPresent(page);
    // error(410) → the generic error page renders the status 410.
    await expect(page.getByText(/410|expired|gone/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("missing media id shows the not-found page", async ({ page }) => {
    await page.goto(`/share/${VALID_TOKEN}`, { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfPresent(page);
    await expect(page.getByText(/404|page not found|invalid share link/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
