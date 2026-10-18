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
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";

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
] as const;

const ACTION_TIMEOUT = 20_000;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // The wizard/auth-setup phase resets the DB, so the shared storageState is
  // intentionally stale here (all feature specs re-authenticate the same way).
  await loginAsAdmin(page);
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
    });
  }
});
