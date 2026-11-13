/**
 * @file tests/e2e/routes/mediagallery/large-library.spec.ts
 * @description Large-library rendering contract for the media gallery grid.
 *
 * `media-grid.svelte` renders the filtered list in bounded batches
 * (`BATCH_SIZE = 60`) and grows the visible window when an IntersectionObserver
 * sentinel enters the scroll root (600px rootMargin). This spec pins that
 * behaviour on a real 70-asset library:
 *
 * | Stage                | Expected DOM                        |
 * | -------------------- | ----------------------------------- |
 * | initial render       | exactly 60 `media-item` tiles       |
 * | scroll to the end    | the remaining 10 tiles are appended |
 *
 * Seeding goes through `POST /api/testing` (`seed-media-with-metadata`, which
 * inserts real `media_items` rows) and every row is deleted afterwards, so the
 * assertion is a create → render → scroll → cleanup round-trip.
 */

import { expect, test } from "../../fixtures";
import { seedMediaWithMetadata } from "../../helpers/api";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { deleteMediaRow } from "../../helpers/media";

/** Must match `BATCH_SIZE` in `src/routes/(app)/mediagallery/media-grid.svelte`. */
const BATCH_SIZE = 60;
const BULK_COUNT = 70;

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Media gallery — large library", () => {
  test("renders a bounded batch and appends the rest on scroll", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);
    await dismissCookieConsent(page);

    const prefix = `e2e-bulk-${Date.now().toString(36)}`;
    const items = Array.from({ length: BULK_COUNT }, (_, index) => ({
      filename: `${prefix}-${String(index).padStart(2, "0")}.png`,
      originalFilename: `${prefix}-${String(index).padStart(2, "0")}.png`,
      hash: `e2ebulk${prefix}${index}`,
      path: `global/${prefix}-${index}.png`,
      size: 128,
      mimeType: "image/png",
      metadata: { fixture: "large-library" },
    }));

    const seeded = await seedMediaWithMetadata(page, { items });
    expect(seeded.items.length).toBe(BULK_COUNT);

    try {
      await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      // Force the grid: the view preference persists across specs.
      const gridButton = page.getByTestId("media-view-grid");
      if ((await gridButton.getAttribute("aria-pressed")) !== "true") await gridButton.click();
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");

      // Filter to this run's fixtures so the batch count is deterministic.
      const search = page.getByRole("searchbox", { name: /search media assets/i });
      await search.fill(prefix);

      const grid = page.getByTestId("media-grid");
      const tiles = grid.getByTestId("media-item").filter({ hasText: prefix });

      // Bounded first paint: only BATCH_SIZE tiles exist in the DOM.
      await expect(tiles).toHaveCount(BATCH_SIZE, { timeout: 30_000 });

      // Drive the reveal through the scroll container itself. Scrolling the
      // sentinel with `scrollIntoViewIfNeeded` raced the observer/binding flush
      // (the grid appended one tick later, after the predicate had already read
      // 60), so the run failed intermittently. Setting scrollTop on the real
      // scroller exercises the same documented fallback and is deterministic.
      const scroller = page.getByTestId("media-grid");
      await expect(async () => {
        await scroller.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        expect(await tiles.count()).toBeGreaterThan(BATCH_SIZE);
      }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] });

      // Every match is eventually mounted.
      await expect(tiles).toHaveCount(BULK_COUNT, { timeout: 30_000 });

      await expect(grid.getByText(`${prefix}-${BULK_COUNT - 1}.png`)).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });
});
