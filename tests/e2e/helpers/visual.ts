/**
 * @file tests/e2e/helpers/visual.ts
 * @description Shared helpers for Playwright visual regression screenshots.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** Fixed viewport for comparable admin-theme screenshots */
export const STABLE_VIEWPORT = { width: 1280, height: 720 } as const;

/** Default screenshot options — tolerates minor font raster differences */
export const SCREENSHOT_OPTS = {
  animations: "disabled" as const,
  // Cross-platform font rendering (ClearType vs FreeType) can cause ~3% pixel diff.
  // 4% threshold catches real regressions while allowing platform variance.
  maxDiffPixelRatio: 0.04,
  threshold: 0.25,
};

/** Disable motion and hide flaky dynamic widgets before screenshots */
export async function prepareForScreenshot(page: Page) {
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
}

/** Open the sign-in form from the login chooser screen */
export async function openLoginSignInForm(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const signInIcon = page.getByTestId("signin-icon");
  if (await signInIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signInIcon.click({ force: true });
  } else {
    await page
      .locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")')
      .first()
      .click({ force: true });
  }
  await page.getByTestId("signin-email").waitFor({ state: "visible", timeout: 15_000 });
}

/** Locators that change between runs (timers, version badges, live clocks) */
export function dynamicMasks(page: Page): Locator[] {
  return [
    page.locator('[role="status"]'),
    page.locator(".language-selector"),
    page.locator('[aria-label*="Demo mode"]'),
    page.locator("text=/Time remaining/i"),
  ];
}

/** Assert a region screenshot with shared stability settings */
export async function expectStableScreenshot(
  locator: Locator,
  name: string,
  page: Page,
  extraMasks: Locator[] = [],
) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  await expect(locator).toHaveScreenshot(name, {
    ...SCREENSHOT_OPTS,
    mask: [...dynamicMasks(page), ...extraMasks],
  });
}
