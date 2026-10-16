/**
 * @file tests/e2e/routes/dashboard/responsive.spec.ts
 * @description E2E for the dashboard's responsive widget grid.
 *
 * The grid (`data-testid="dashboard-widget-grid"`, class
 * `responsive-dashboard-grid`) is styled purely with CSS media queries:
 *   - 4 column tracks ≥1024px
 *   - 2 column tracks 768–1023px
 *   - 1 column track <768px
 *
 * Each (viewport × theme) combo asserts the resolved
 * `grid-template-columns` track count plus the absence of horizontal page
 * overflow, and captures one screenshot into `tests/test-results/` for manual
 * review. The PASS/FAIL gate is the functional column-count + overflow
 * assertions — screenshots are non-blocking (no cross-OS pixel baselines).
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { seedCookieConsent } from "../../helpers/cookie-consent";

const ACTION_TIMEOUT = 20_000;

type ThemeName = "light" | "dark";

interface ViewportCase {
  name: string;
  viewport: { width: number; height: number };
  tracks: number;
}

// Deliberately avoid the exact 767/1023 boundary pixels so the assertions
// never depend on which side a tie-breaking browser rounds to.
const VIEWPORTS: ViewportCase[] = [
  { name: "mobile", viewport: { width: 390, height: 844 }, tracks: 1 },
  { name: "tablet", viewport: { width: 900, height: 1024 }, tracks: 2 },
  { name: "desktop", viewport: { width: 1440, height: 900 }, tracks: 4 },
];

const THEMES: ThemeName[] = ["light", "dark"];

test.describe.configure({ mode: "serial" });

/** Log in as admin and land on a hydrated dashboard shell. */
async function goDashboard(page: Page): Promise<void> {
  await loginAsAdmin(page, "/dashboard");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/dashboard");
  }
  await expect(async () => {
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/dashboard");
    }
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  await waitForHydration(page);
  await expect(page.getByTestId("dashboard-main")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

/**
 * Ensure ≥`count` widgets on the dashboard. Mirrors `dashboard.spec.ts`:
 * prefers existing widgets, only resets when the board is empty, then adds
 * distinct menu items so a one-type catalog still yields multiple tiles.
 */
async function ensureNWidgets(page: Page, count: number): Promise<number> {
  let n = await page.locator("[data-widget-id]").count();
  if (n >= count) return n;

  const reset = page.getByTestId("dashboard-reset-widgets");
  if (await reset.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await reset.click();
    await expect
      .poll(async () => page.locator("[data-widget-id]").count(), { timeout: 5_000 })
      .toBe(0)
      .catch(() => undefined);
    n = await page.locator("[data-widget-id]").count();
    if (n >= count) return n;
  }

  for (let i = 0; i < count + 2 && n < count; i++) {
    const addBtn = page
      .getByTestId("dashboard-add-widget")
      .or(page.getByTestId("dashboard-add-first-widget"));
    if (
      !(await addBtn
        .first()
        .isVisible({ timeout: 4_000 })
        .catch(() => false))
    ) {
      break;
    }
    await addBtn.first().click();
    const menu = page.getByTestId("dashboard-widget-menu");
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT });
    const items = menu.getByRole("menuitem");
    const itemCount = await items.count();
    if (itemCount === 0) {
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
    const item = items.nth(Math.min(i, itemCount - 1));
    if (!(await item.isVisible({ timeout: 2_000 }).catch(() => false))) {
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
    await item.click();
    await expect
      .poll(async () => page.locator("[data-widget-id]").count(), { timeout: 5_000 })
      .toBeGreaterThan(n)
      .catch(() => undefined);
    n = await page.locator("[data-widget-id]").count();
  }

  return page.locator("[data-widget-id]").count();
}

/**
 * Apply the canonical theme DOM state — mirrors `applyThemeToDom` in
 * `src/stores/theme-store.svelte.ts`. Dark mode flips CSS selectors under
 * `html.dark`; light mode removes `dark` and adds `light`.
 */
async function setColorScheme(page: Page, theme: ThemeName): Promise<void> {
  await page.evaluate((t) => {
    const h = document.documentElement;
    h.classList.toggle("dark", t === "dark");
    h.classList.toggle("light", t === "light");
  }, theme);
}

/** Count the resolved grid column tracks (0 when the grid is not mounted). */
async function gridTrackCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="dashboard-widget-grid"]');
    if (!el) return 0;
    const value = getComputedStyle(el).gridTemplateColumns.trim();
    // Chromium resolves `repeat(N, 1fr)` to explicit px tracks; the repeat()
    // branch keeps this robust if a browser ever returns the shorthand form.
    const repeat = /^repeat\((\d+)/.exec(value);
    if (repeat) return Number(repeat[1]);
    return value.split(/\s+/).filter(Boolean).length;
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

for (const vp of VIEWPORTS) {
  test.describe(`dashboard responsive grid — ${vp.name} (${vp.viewport.width}×${vp.viewport.height})`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const theme of THEMES) {
      test(`${theme} theme renders ${vp.tracks} column track(s) with no horizontal overflow`, async ({
        page,
      }) => {
        // Set the viewport explicitly (project-level `devices["Desktop Chrome"]`
        // pins a 1280×720 viewport that a describe-level `test.use({ viewport })`
        // does not reliably override in this config).
        await page.setViewportSize(vp.viewport);
        await seedCookieConsent(page);

        await goDashboard(page);

        // Populate the grid so it actually renders (the grid node only mounts
        // when there is at least one widget preference).
        const seeded = await ensureNWidgets(page, 2);
        expect(seeded).toBeGreaterThanOrEqual(2);

        const grid = page.getByTestId("dashboard-widget-grid");
        await expect(grid).toBeVisible({ timeout: ACTION_TIMEOUT });

        await setColorScheme(page, theme);

        // Functional gate: the resolved grid must expose the expected track
        // count at this viewport, independent of theme.
        await expect.poll(() => gridTrackCount(page), { timeout: 5_000 }).toBe(vp.tracks);

        // No horizontal page overflow at this viewport.
        expect(await hasHorizontalOverflow(page)).toBe(false);

        // Non-blocking screenshot for manual review.
        const screenshotPath = `tests/test-results/dashboard-responsive-${vp.name}-${theme}.png`;
        try {
          await page.screenshot({ path: screenshotPath });
        } catch (err) {
          console.warn(`[responsive] screenshot failed (non-blocking): ${screenshotPath}`, err);
        }
      });
    }
  });
}
