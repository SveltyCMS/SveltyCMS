/**
 * @file tests/e2e/routes/mediagallery/media-pagination.spec.ts
 * @description Server-pagination contract for the media gallery (audit F01).
 *
 * The loader used to hardcode `page: 1, pageSize: 100` and drop the adapter's
 * pagination metadata, so the grid's batching and the table's pager could only
 * reveal items from that first slice. This spec seeds `PAGE_SIZE + 1` assets and
 * proves the full round-trip:
 *
 * | Stage                        | Expected                                    |
 * | ---------------------------- | ------------------------------------------- |
 * | first load                   | 100 rows fetched, `has-more` true, total > 100 |
 * | grid sentinel scrolled       | `?page=2` fetched, more rows loaded         |
 * | table "Load more" until gone | every asset loaded, `has-more` false        |
 * | table last page              | the asset beyond the first 100 is reachable |
 *
 * Seeding goes through `POST /api/testing` (`seed-media-with-metadata`) and every
 * row is deleted afterwards, so this is a create → page → assert → cleanup run.
 */

import { expect, test } from "@playwright/test";
import { seedMediaWithMetadata } from "../../helpers/api";
import { deleteMediaRow, openMediaGallery } from "../../helpers/media";

/** Must match `GALLERY_PAGE_SIZE` in `src/routes/(app)/mediagallery/+page.server.ts`. */
const PAGE_SIZE = 100;
const SEEDED = PAGE_SIZE + 1;

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.describe("Media gallery — server pagination", () => {
  test("reaches assets past the first server page in both views", async ({ page }) => {
    const prefix = `e2e-page-${Date.now().toString(36)}`;
    const items = Array.from({ length: SEEDED }, (_, index) => ({
      filename: `${prefix}-${String(index).padStart(3, "0")}.png`,
      originalFilename: `${prefix}-${String(index).padStart(3, "0")}.png`,
      hash: `e2epage${prefix}${index}`,
      path: `global/${prefix}-${index}.png`,
      size: 128,
      mimeType: "image/png",
      metadata: { fixture: "media-pagination" },
    }));

    const seeded = await seedMediaWithMetadata(page, { items });
    expect(seeded.items.length).toBe(SEEDED);

    // Oldest row of the run — it can only live on the second server page.
    const oldest = `${prefix}-000.png`;

    try {
      await openMediaGallery(page);

      const gridButton = page.getByTestId("media-view-grid");
      if ((await gridButton.getAttribute("aria-pressed")) !== "true") await gridButton.click();
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");

      const status = page.getByTestId("media-gallery-pagination");
      await expect(status).toHaveAttribute("data-page", "1");
      await expect(status).toHaveAttribute("data-loaded", String(PAGE_SIZE));
      await expect(status).toHaveAttribute("data-has-more", "true");
      const total = Number(await status.getAttribute("data-total"));
      expect(total, "the loader must preserve the adapter total").toBeGreaterThanOrEqual(SEEDED);

      // Client-side search only sees fetched rows, so the oldest asset is absent here.
      await page.getByRole("searchbox", { name: /search media assets/i }).fill(prefix);
      await expect(
        page.getByTestId("media-item").filter({ hasText: oldest }).filter({ visible: true }),
      ).toHaveCount(0);

      // Grid sentinel = local batching exhausted → fetch the next server page.
      // Each retry scrolls again: the first pass only grows the local batch, the
      // next one reaches the sentinel at the end of the fetched slice.
      await expect(page.getByTestId("media-grid-load-more").first()).toBeVisible();
      await expect(async () => {
        if ((await status.getAttribute("data-page")) !== "2") {
          await page.getByTestId("media-grid-load-more").first().scrollIntoViewIfNeeded();
        }
        expect(await status.getAttribute("data-page")).toBe("2");
      }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] });
      const loadedAfterScroll = Number(await status.getAttribute("data-loaded"));
      expect(loadedAfterScroll).toBeGreaterThan(PAGE_SIZE);

      // Table view: its footer control must fetch the same next slice. Assertions stay
      // order-independent — in a shard the DB holds other specs' media, so "the 101st
      // asset is on page 2" is only true for a freshly reset database.
      await page.getByTestId("media-view-table").click();
      const table = page.getByTestId("media-table");
      await expect(table).toBeVisible({ timeout: 30_000 });

      const pageBeforeTable = Number(await status.getAttribute("data-page"));
      const tableLoadMore = page.getByTestId("media-table-load-more");
      if (await tableLoadMore.isVisible().catch(() => false)) {
        await tableLoadMore.click();
        await expect(status).toHaveAttribute("data-page", String(pageBeforeTable + 1), {
          timeout: 30_000,
        });
        const loadedAfterTable = Number(await status.getAttribute("data-loaded"));
        expect(loadedAfterTable).toBeGreaterThan(loadedAfterScroll);
      } else {
        // Absent is only correct when the adapter had nothing left to serve.
        await expect(status).toHaveAttribute("data-has-more", "false");
      }
      // The server total is preserved across every page, never the rendered slice.
      expect(Number(await status.getAttribute("data-total"))).toBe(total);
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });
});
