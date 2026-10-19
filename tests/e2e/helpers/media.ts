/**
 * @file tests/e2e/helpers/media.ts
 * @description Shared Playwright helpers for the media gallery surface.
 *
 * These are the same helpers the full chromium suite uses, so the pre-push
 * smoke gate exercises the identical upload / modal / cleanup code paths
 * instead of a parallel reimplementation that can drift.
 *
 * ### Features:
 * - `openMediaGallery()` — deterministic login + hydration barrier
 * - `uploadUniqueImage()` — content-unique upload, waits for the rendered card
 * - `mediaCard()` / `deleteMediaRow()` — idempotent lookup and cleanup
 * - `uniquePng()` — per-test bytes so content-hash dedupe cannot collapse rows
 */

import sharp from "sharp";
import { expect, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "./auth";
import { dismissCookieConsent, seedCookieConsent } from "./cookie-consent";

export type MediaRow = { _id: string; filename: string };

/** The rendered card for a specific filename (one per upload, deterministic). */
export function mediaCard(page: Page, filename: string) {
  return page.getByTestId("media-item").filter({ hasText: filename }).first();
}

/** Best-effort row cleanup; safe to call when the row was already removed. */
export async function deleteMediaRow(page: Page, id?: string): Promise<void> {
  if (!id) return;
  await page.request.delete(`/api/media/${encodeURIComponent(id)}`).catch(() => undefined);
}

/** Unique PNG per test — avoids the content-hash dedupe that shared fixtures hit. */
export async function uniquePng(filename: string) {
  // CSPRNG rather than Math.random(): the security scanners flag weak
  // randomness anywhere in the tree, and the cost is irrelevant in tests.
  const bytes = new Uint8Array(1);
  globalThis.crypto.getRandomValues(bytes);
  const seed = (bytes[0]! % 200) + 20;
  const buffer = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: { r: seed, g: (seed * 7) % 255, b: (seed * 13) % 255 },
    },
  })
    .png()
    .toBuffer();
  return { name: filename, mimeType: "image/png", buffer };
}

/** Upload through the real toolbar input and resolve once the card renders. */
export async function uploadUniqueImage(page: Page, filename: string): Promise<MediaRow> {
  const file = await uniquePng(filename);
  const uploadResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("?/upload") || res.url().includes("/api/media")),
    { timeout: 30_000 },
  );
  await page.getByTestId("media-upload-input").setInputFiles(file);
  const response = await uploadResponse;
  expect(response.ok(), `upload POST ${response.status()} ${response.url()}`).toBe(true);

  // The gallery revalidates after the action; the rendered card is the contract.
  const card = mediaCard(page, filename);
  await expect(card).toBeVisible({ timeout: 25_000 });
  const id = await card.getAttribute("data-media-id");
  expect(id, "uploaded card must expose a data-media-id").toBeTruthy();
  return { _id: id!, filename };
}

/**
 * Navigate to a hydrated gallery as admin. `loginAsAdmin` owns the redirect to
 * the target route, so there is no "goto, maybe land on /login, retry" branch
 * that could hide an auth regression.
 */
export async function openMediaGallery(page: Page): Promise<void> {
  await seedCookieConsent(page);
  await loginAsAdmin(page, "/mediagallery");
  await dismissCookieConsent(page);

  await expect(page).toHaveURL(/\/mediagallery/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  const shell = page
    .getByTestId("media-gallery-toolbar")
    .or(page.getByTestId("media-gallery-content"))
    .or(page.getByTestId("media-grid"))
    .or(page.getByTestId("admin-page-title"));
  await expect(shell.first()).toBeVisible({ timeout: 30_000 });
  // The shell renders in SSR HTML; search/filters/upload need the hydrated tree.
  await waitForHydration(page);
}
