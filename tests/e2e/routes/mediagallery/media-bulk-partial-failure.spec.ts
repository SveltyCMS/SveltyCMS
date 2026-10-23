/**
 * @file tests/e2e/routes/mediagallery/media-bulk-partial-failure.spec.ts
 * @description Multi-select delete must report per-file outcomes (audit F07).
 *
 * The batch handler used to fire one fetch per selected asset, ignore the HTTP
 * status and the action result, then remove every row locally and announce
 * "Batch delete complete". A server error therefore looked like success and hid
 * an asset that still existed until the next reload.
 *
 * This spec fails exactly one delete at the network boundary (route interception
 * for the page action only — the other requests reach the real server), then
 * asserts:
 *
 * | Contract                     | Expectation                                     |
 * | ---------------------------- | ----------------------------------------------- |
 * | toast                        | partial-failure summary, not "complete"          |
 * | grid                         | the failed asset stays visible                   |
 * | reload (persistence)         | failed asset exists, confirmed-deleted one is gone |
 */

import { expect, test } from "@playwright/test";
import { seedMediaWithMetadata } from "../../helpers/api";
import { openMediaGallery } from "../../helpers/media";

const ACTION_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Media gallery — bulk delete partial failure", () => {
  test("keeps failed assets selected and reports the partial outcome", async ({ page }) => {
    const prefix = `e2e-partial-${Date.now().toString(36)}`;
    const items = ["a", "b"].map((suffix) => ({
      filename: `${prefix}-${suffix}.png`,
      originalFilename: `${prefix}-${suffix}.png`,
      hash: `e2epartial${prefix}${suffix}`,
      path: `global/${prefix}-${suffix}.png`,
      size: 128,
      mimeType: "image/png",
      metadata: { fixture: "media-bulk-partial-failure" },
    }));

    const seeded = await seedMediaWithMetadata(page, { items });
    expect(seeded.items.length).toBe(items.length);

    try {
      await openMediaGallery(page);
      await page.getByTestId("media-view-grid").click();
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");

      const search = page.getByRole("searchbox", { name: /search media assets/i });
      await search.fill(prefix);

      const tiles = page.getByTestId("media-item").filter({ hasText: prefix }).filter({
        visible: true,
      });
      await expect(tiles).toHaveCount(items.length, { timeout: ACTION_TIMEOUT });

      // Select both assets through the native checkbox labels.
      await page.getByTestId("media-selection-toggle").click();
      for (let i = 0; i < items.length; i++) {
        await tiles.nth(i).locator("label").first().click({ timeout: ACTION_TIMEOUT });
      }
      await expect(page.getByTestId("media-bulk-count")).toContainText(/2 selected/i);

      // Fail the FIRST delete only; the rest must reach the real server so the
      // assertion covers a genuine partial outcome.
      let deleteRequests = 0;
      await page.route(
        (url) => /^\/mediagallery\/?$/.test(url.pathname) && url.search.includes("deleteMedia"),
        async (route) => {
          deleteRequests += 1;
          if (deleteRequests === 1) {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                type: "error",
                status: 500,
                error: { message: "Simulated delete failure" },
              }),
            });
            return;
          }
          await route.continue();
        },
      );

      // Move focus off the checkbox inputs: the Delete hotkey ignores form fields.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Delete");
      const dialog = page
        .getByRole("dialog")
        .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i })
        .filter({ hasText: /delete/i })
        .first();
      await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
      await dialog.getByRole("button", { name: /confirm/i }).click();

      // Partial outcome is announced as such — never as "Batch delete complete".
      await expect(page.getByText(/1 of 2 files deleted/i)).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      await expect(page.getByText(/1 failed/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(page.getByText(/batch delete complete/i)).toHaveCount(0);

      // The failed asset stays in the list for a retry.
      await expect(tiles).toHaveCount(1, { timeout: ACTION_TIMEOUT });
      const remainingText = await tiles.first().innerText();
      const survivor = items
        .map((item) => item.filename)
        .find((name) => remainingText.includes(name));
      expect(survivor, `unexpected remaining tile: ${remainingText}`).toBeTruthy();
      const deleted = items.map((item) => item.filename).find((name) => name !== survivor)!;

      // Persistence: reload re-reads the folder from the server.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("searchbox", { name: /search media assets/i }).fill(prefix);
      const afterReload = page.getByTestId("media-item").filter({ hasText: prefix }).filter({
        visible: true,
      });
      await expect(afterReload).toHaveCount(1, { timeout: ACTION_TIMEOUT });
      await expect(afterReload.filter({ hasText: survivor! })).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      await expect(afterReload.filter({ hasText: deleted })).toHaveCount(0);
    } finally {
      // Clean up whichever row survived (the request below is not the page action).
      for (const item of seeded.items) {
        await page.request
          .delete(`/api/media/${encodeURIComponent(item._id)}`)
          .catch(() => undefined);
      }
    }
  });
});
