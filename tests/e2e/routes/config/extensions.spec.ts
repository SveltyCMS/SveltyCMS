/**
 * @file tests/e2e/routes/config/extensions.spec.ts
 * @description E2E for /config/extensions — tabs, plugins grid, marketplace type filter, widget cards.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function goExtensions(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/extensions", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("page-title")).toContainText(/extension/i);
  await expect(page.getByTestId("extensions-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

// Tests are independent (read-only shell assertions) — no serial mode needed,
// so the file parallelizes across workers on local runs.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Extension Management", () => {
  test.setTimeout(90_000);

  test("loads with three tabs and plugins panel", async ({ page }) => {
    await goExtensions(page);
    await expect(page.getByTestId("extensions-tabs")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-plugins")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-widgets")).toBeVisible();
    await expect(page.getByTestId("extensions-tab-themes")).toBeVisible();
    await expect(page.getByTestId("extensions-panel-plugins")).toBeVisible();
    await expect(page.getByTestId("plugins-view")).toBeVisible();
  });

  test("switching tabs updates panel", async ({ page }) => {
    await goExtensions(page);
    await page.getByTestId("extensions-tab-widgets").click();
    await expect(page.getByTestId("extensions-panel-widgets")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("extensions-tab-themes").click();
    await expect(page.getByTestId("extensions-panel-themes")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("extensions-tab-plugins").click();
    await expect(page.getByTestId("extensions-panel-plugins")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("plugins grid or empty state is present", async ({ page }) => {
    await goExtensions(page);
    await expect(
      page.getByTestId("plugins-grid").or(page.getByTestId("plugins-empty")).first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("marketplace type filter filters the catalog incl. dashboard", async ({ page }) => {
    await goExtensions(page);

    // The in-app marketplace fetches the remote catalog via GET /api/marketplace.
    // That is an external network boundary (no endpoint in this build) — mock it
    // so the type-filter journey is deterministic and offline.
    const catalog = [
      {
        id: "mock-dashboard-a",
        name: "Mock Dashboard Widget A",
        description: "A dashboard widget for tests",
        version: "1.0.0",
        author: "SveltyCMS",
        type: "dashboard",
        license: "free",
        price: 0,
        downloads: 42,
      },
      {
        id: "mock-dashboard-b",
        name: "Mock KPI Card",
        description: "Paid dashboard widget",
        version: "2.1.0",
        author: "SveltyCMS",
        type: "dashboard",
        license: "paid",
        price: 4.99,
        downloads: 7,
      },
      {
        id: "mock-plugin-a",
        name: "Mock Plugin",
        description: "A plugin for tests",
        version: "0.9.0",
        author: "SveltyCMS",
        type: "plugin",
        license: "freemium",
        price: 0,
        downloads: 3,
      },
      {
        id: "mock-theme-a",
        name: "Mock Theme",
        description: "A theme for tests",
        version: "3.0.0",
        author: "SveltyCMS",
        type: "theme",
        license: "free",
        price: 0,
        downloads: 11,
      },
    ];
    await page.route("**/api/marketplace**", async (route) => {
      const type = new URL(route.request().url()).searchParams.get("type");
      const items = type && type !== "all" ? catalog.filter((i) => i.type === type) : catalog;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items, remoteAvailable: false, source: "local" },
        }),
      });
    });

    await page.getByTestId("extensions-tab-marketplace").click();
    await expect(page.getByTestId("marketplace-catalog")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Type filter exists and offers the `dashboard` category.
    // Regression guard: the Select component previously dropped `data_testid`, so
    // `marketplace-type-filter` was missing from the DOM (fixed in
    // src/components/ui/select.svelte). Assert the real testid so the attribute
    // can never silently disappear again.
    const typeFilter = page.getByTestId("marketplace-type-filter");
    await expect(typeFilter).toBeVisible();
    // Native <select> options are never "visible" to Playwright — assert
    // presence (attached) + count instead of visibility.
    await expect(typeFilter.locator("option", { hasText: /dashboard widgets/i })).toHaveCount(1);

    // Unfiltered grid shows every mocked catalog card incl. license badges.
    await expect(page.getByTestId("marketplace-card-mock-dashboard-a")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("marketplace-card-mock-plugin-a")).toBeVisible();
    await expect(page.getByTestId("marketplace-license-mock-dashboard-b")).toContainText(/paid/i);
    await expect(page.getByTestId("marketplace-card-mock-dashboard-b")).toContainText("€4.99");

    // Select Dashboard widgets + refresh → only dashboard cards remain.
    await typeFilter.selectOption({ label: "Dashboard widgets" });
    await page.getByTestId("marketplace-refresh").click();
    await expect(page.getByTestId("marketplace-card-mock-dashboard-a")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("marketplace-card-mock-dashboard-b")).toBeVisible();
    await expect(page.getByTestId("marketplace-card-mock-plugin-a")).toHaveCount(0);
    await expect(page.getByTestId("marketplace-card-mock-theme-a")).toHaveCount(0);
  });

  test("widgets tab renders dashboard widget cards", async ({ page }) => {
    await goExtensions(page);
    await page.getByTestId("extensions-tab-widgets").click();

    // Widget dashboard: stats + grid with installed widget cards (core widgets
    // are registered per install, so the grid is never empty on a seeded system).
    await expect(page.getByTestId("widget-stats")).toBeVisible({ timeout: ACTION_TIMEOUT });
    const grid = page.getByTestId("widget-grid");
    await expect(grid).toBeVisible({ timeout: ACTION_TIMEOUT });
    const cardCount = await grid.locator(":scope > *").count();
    expect(cardCount, "widget grid must render at least one widget card").toBeGreaterThan(0);
  });
});
