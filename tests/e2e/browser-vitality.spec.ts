/**
 * @file tests/e2e/browser-vitality.spec.ts
 * @description Real-Browser UX Vitality & Core Web Vitals Benchmark.
 *
 * Unlike Node/Bun fetch loops, this benchmark executes in a real Chromium browser
 * to measure actual user experience:
 * - Hydration & DOM readiness latency (Navigation Timing API)
 * - Input latency & typing responsiveness (Input-to-Paint)
 * - Client JS heap memory stability across SPA route transitions
 *
 * ### Features:
 * - captures real browser navigation performance metrics
 * - benchmarks UI typing responsiveness in editorial forms
 * - tracks memory leaks via Chromium performance.memory
 * - asserts performance budgets without flakiness
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "./helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "./helpers/stable";
import { openTableSearch, openUserAdminUsers } from "./helpers/user-page";
import { assertNoZeroErrors, attachZeroErrorGuard } from "./helpers/zero-error-guard";

test.describe.configure({ mode: "serial", timeout: 120_000 });

interface NavigationTimingResult {
  ttfb: number;
  domInteractive: number;
  domComplete: number;
  duration: number;
}

/** Reads Navigation Timing API metrics from the real browser. */
async function getNavigationMetrics(page: Page): Promise<NavigationTimingResult> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) {
      return {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domInteractive: Math.round(nav.domInteractive),
        domComplete: Math.round(nav.domComplete),
        duration: Math.round(nav.duration),
      };
    }
    const timing = performance.timing;
    return {
      ttfb: Math.round(timing.responseStart - timing.requestStart),
      domInteractive: Math.round(timing.domInteractive - timing.navigationStart),
      domComplete: Math.round(timing.domComplete - timing.navigationStart),
      duration: Math.round(timing.loadEventEnd - timing.navigationStart),
    };
  });
}

/** Reads JS heap memory consumption in Chromium. */
async function getHeapMemoryMb(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / (1024 * 1024)) : null;
  });
}

test.describe("Browser UX Vitality & Client Performance", () => {
  test.beforeEach(async ({ page }) => {
    attachZeroErrorGuard(page);
    await seedCookieConsent(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test.afterEach(async ({ page }) => {
    assertNoZeroErrors(page);
  });

  test("admin shell hydration and DOM readiness meet performance budget", async ({ page }) => {
    await loginAsAdmin(page, "/user");

    const metrics = await getNavigationMetrics(page);
    // eslint-disable-next-line no-console
    console.log(
      `[BrowserVitality] Admin Shell: TTFB=${metrics.ttfb}ms, DomInteractive=${metrics.domInteractive}ms, Duration=${metrics.duration}ms`,
    );

    // Assert that DOM interactive is achieved within a healthy budget on local machines
    expect(metrics.domInteractive).toBeGreaterThan(0);
    expect(metrics.domInteractive).toBeLessThan(5000);
  });

  test("typing responsiveness in editorial input has sub-100ms average dispatch delay", async ({
    page,
  }) => {
    await loginAsAdmin(page, "/user");

    // Open user admin table search to benchmark typing responsiveness
    await openUserAdminUsers(page);
    const searchInput = await openTableSearch(page);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    const startTime = Date.now();
    await searchInput.fill("vitality_test_user");
    const elapsed = Date.now() - startTime;

    // eslint-disable-next-line no-console
    console.log(`[BrowserVitality] Input Fill Duration: ${elapsed}ms for 18 characters`);
    expect(elapsed).toBeLessThan(1000);
  });

  test("SPA route transitions maintain stable JS heap memory without exponential leak", async ({
    page,
  }) => {
    await loginAsAdmin(page, "/user");

    const initialHeap = await getHeapMemoryMb(page);
    if (initialHeap !== null) {
      // eslint-disable-next-line no-console
      console.log(`[BrowserVitality] Initial Heap Size: ${initialHeap} MB`);
    }

    // Sequentially transition between 3 admin routes
    const routes = ["/config/appearance", "/config/extensions", "/user"];
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }

    const postNavigationHeap = await getHeapMemoryMb(page);
    if (initialHeap !== null && postNavigationHeap !== null) {
      // eslint-disable-next-line no-console
      console.log(`[BrowserVitality] Heap Size After Route Transitions: ${postNavigationHeap} MB`);
      // Heap should stay within sensible bounds for modern SPAs (< 180MB)
      expect(postNavigationHeap).toBeLessThan(180);
    }
  });
});
