/**
 * @file tests/e2e/routes/mobile/layout.spec.ts
 * @description Phone-viewport layout contracts: no horizontal page overflow and
 * a usable physical size for the mobile navigation controls.
 *
 * Both assertions are cheap, deterministic and viewport-specific — exactly the
 * class of defect a 1280×720 run cannot see:
 *
 *   - horizontal overflow: one wide table or a fixed `min-width` in a card makes
 *     the whole page scroll sideways on a phone. `documentElement.scrollWidth`
 *     against `window.innerWidth` is the measured contract (the desktop run in
 *     `routes/config/route-breadth.spec.ts` checks the same thing at 1280 px).
 *   - touch target size: WCAG 2.5.8 (AA) asks for at least 24×24 CSS px. The
 *     mobile navigation is the one control set that only exists on a phone, so
 *     it is measured here instead of being trusted to `h-9`/`h-10` classes.
 */

import { expect, test, type Page } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { seedCookieConsent } from "../../helpers/cookie-consent";

const ACTION_TIMEOUT = 20_000;
/** WCAG 2.5.8 minimum target size (AA), in CSS pixels. */
const MIN_TOUCH_TARGET = 24;

/** Routes that render a full admin layout (shell + content column). */
const ROUTES = [
  "/dashboard",
  "/config",
  "/config/collectionbuilder",
  "/user",
  "/mediagallery",
] as const;

async function goto(page: Page, path: string): Promise<void> {
  await loginAsAdmin(page, path);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, path);
  }
  await waitForHydration(page);
}

/** Horizontal overflow of the document, in CSS pixels (0 = none). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - window.innerWidth);
  });
}

test.describe("mobile layout", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
  });

  for (const path of ROUTES) {
    test(`${path} does not overflow horizontally on a phone`, async ({ page }) => {
      await goto(page, path);
      const overflow = await horizontalOverflow(page);
      expect(
        overflow,
        `${path} scrolls ${overflow}px sideways at ${JSON.stringify(page.viewportSize())}`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("/login does not overflow horizontally on a phone", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForHydration(page);
    const overflow = await horizontalOverflow(page);
    expect(
      overflow,
      `/login scrolls ${overflow}px sideways at ${JSON.stringify(page.viewportSize())}`,
    ).toBeLessThanOrEqual(1);
  });

  test("the mobile navigation controls meet the minimum touch target", async ({ page }) => {
    await goto(page, "/dashboard");

    const controls = [
      page.getByRole("button", { name: "Open Sidebar" }),
      page.getByRole("button", { name: "Open Navigation Menu" }),
    ];

    for (const control of controls) {
      await expect(control).toBeVisible({ timeout: ACTION_TIMEOUT });
      const box = await control.boundingBox();
      expect(box, "control has no box").not.toBeNull();
      expect(
        Math.min(box!.width, box!.height),
        `control ${(await control.getAttribute("aria-label")) ?? "?"} is ${box!.width}×${box!.height} CSS px`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  test("dashboard dropdown menus fit within the mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await goto(page, "/dashboard");
    const vp = page.viewportSize()!;

    const presetsBtn = page.getByTestId("dashboard-presets-btn");
    if (await presetsBtn.isVisible().catch(() => false)) {
      await presetsBtn.click();
      const presetsMenu = page.getByTestId("dashboard-presets-menu");
      await expect(presetsMenu).toBeVisible({ timeout: ACTION_TIMEOUT });
      const box = await presetsMenu.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      await page.keyboard.press("Escape");
    }

    const addWidgetBtn = page.getByTestId("dashboard-add-widget");
    if (await addWidgetBtn.isVisible().catch(() => false)) {
      await addWidgetBtn.click();
      const widgetMenu = page.getByTestId("dashboard-widget-menu");
      await expect(widgetMenu).toBeVisible({ timeout: ACTION_TIMEOUT });
      const box = await widgetMenu.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      await page.keyboard.press("Escape");
    }
  });
});
