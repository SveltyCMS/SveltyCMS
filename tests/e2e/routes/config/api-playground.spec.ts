/**
 * @file tests/e2e/routes/config/api-playground.spec.ts
 * @description `/config/api` GraphQL tab — the Yoga explorer entry point.
 *
 * The API Playground now defaults to the Visual Query Builder. The full Yoga
 * GraphiQL IDE still lives at `/api/graphql`, so the GraphQL tab must expose it
 * and the endpoint must answer an authenticated HTML navigation with the landing
 * page (not a 401 JSON envelope).
 */

import { test, expect } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("API Playground — GraphQL explorer", () => {
  // The landing page is a third-party GraphiQL document that loads its bundle
  // from unpkg; its CDN/favicon noise is not a SveltyCMS defect.
  test.use({ zeroErrorGuard: false });

  test("GraphQL tab links to the Yoga landing page and the endpoint serves it", async ({
    page,
  }) => {
    await loginAsAdmin(page, "/config/api?tab=graphql");

    // The dedicated GraphiQL IDE is one explicit action away, not a hidden link.
    const explorerLink = page.getByRole("link", { name: /open yoga explorer/i });
    await expect(explorerLink).toBeVisible({ timeout: 10_000 });
    await expect(explorerLink).toHaveAttribute("href", "/api/graphql");

    // An authenticated browser navigation (Accept: text/html) gets the landing
    // page; a stale/absent session would return the 401 JSON envelope instead.
    const landing = await page.request.get("/api/graphql", { headers: { Accept: "text/html" } });
    expect(landing.status()).toBe(200);
    expect(landing.headers()["content-type"] ?? "").toContain("text/html");
    expect(await landing.text()).toContain("Yoga GraphiQL");
  });

  test("config hub restores the direct GraphQL explorer tile", async ({ page }) => {
    await loginAsAdmin(page, "/config");

    // The pre-c14a3e6e1 tile opened `/api/graphql` in its own tab. Keep it
    // alongside the API Playground so the explorer is one click from /config.
    const tile = page.locator('a[href="/api/graphql"]').first();
    await expect(tile).toBeVisible({ timeout: 10_000 });
    await expect(tile).toHaveAttribute("target", "_blank");
    await expect(tile).toContainText(/graphql/i);
  });
});
