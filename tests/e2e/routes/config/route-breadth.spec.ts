/**
 * @file tests/e2e/routes/config/route-breadth.spec.ts
 * @description Breadth smoke for the admin route surface: every static (app)
 *   route must render its shell without a 5xx, a login redirect, or an error page.
 *
 * This is intentionally shallow — it proves routing/layout/hydration wiring for
 * routes whose deep features live in dedicated specs. It is the cheapest way to
 * catch a broken import, a layout crash, or a page-level 500 across the admin.
 *
 * Features:
 * - iterates the static admin routes (excluding parameterized paths)
 * - asserts HTTP < 400, non-login URL, visible main/heading shell
 * - rejects SvelteKit error-page markers in the rendered body
 * - fails on any uncaught browser exception, console error or failed request
 *   raised while the route hydrates (one assertion per route, so the failure
 *   names the page that broke)
 */

import { expect, test } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { assertNoZeroErrors, attachZeroErrorGuard } from "../../helpers/zero-error-guard";

/** Static admin routes only — parameterized pages are covered by their feature specs. */
const ADMIN_ROUTES = [
  "/dashboard",
  "/mediagallery",
  "/user",
  "/config",
  "/config/access-management",
  "/config/api",
  "/config/automations",
  "/config/collectionbuilder",
  "/config/design-system",
  "/config/extensions",
  "/config/monitor",
  "/config/queue",
  "/config/redirects",
  "/config/sync",
  "/config/system-settings",
  "/config/trash",
  "/config/webhooks",
  "/config/workflows",
  "/email-previews",
] as const;

const ACTION_TIMEOUT = 20_000;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // The wizard/auth-setup phase resets the DB, so the shared storageState is
  // intentionally stale here (all feature specs re-authenticate the same way).
  await loginAsAdmin(page);
  // After login: the sign-in page has its own accessibility spec, and a login
  // failure here would mask the route under test.
  attachZeroErrorGuard(page);
});

test.describe("Admin route breadth", () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route} renders its shell`, async ({ page }) => {
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      expect(response?.status() ?? 0, `HTTP status for ${route}`).toBeLessThan(400);
      expect(page.url(), `${route} redirected to login`).not.toContain("/login");

      await waitForHydration(page);

      const shell = page.locator("main, [role='main'], h1").first();
      await expect(shell, `visible shell for ${route}`).toBeVisible({ timeout: ACTION_TIMEOUT });

      const body = await page.locator("body").innerText();
      expect(body, `${route} rendered an error page`).not.toMatch(
        /System Error|Internal Server Error|Application Error/i,
      );

      assertNoZeroErrors(page);
    });
  }

  test("config hub search filters the tile grid and clears", async ({ page }) => {
    await page.goto("/config", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForHydration(page);

    const search = page.getByTestId("config-search");
    const settingsTile = page.locator('a[href="/config/system-settings"]');
    const trashTile = page.locator('a[href="/config/trash"]');
    await expect(search).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(trashTile).toBeVisible({ timeout: ACTION_TIMEOUT });

    // "cache" is an alias for System Settings, so the grid narrows to one tile.
    await search.fill("cache");
    await expect(page.getByTestId("config-search-results")).toContainText("Matching pages: 1", {
      timeout: ACTION_TIMEOUT,
    });
    await expect(settingsTile).toBeVisible();
    await expect(trashTile).toHaveCount(0);

    // No match → empty state; clearing restores the full grid.
    await search.fill("zzzz no match");
    await expect(page.getByTestId("config-search-empty")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.getByTestId("config-search-clear").click();
    await expect(trashTile).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(search).toHaveValue("");
  });
});
