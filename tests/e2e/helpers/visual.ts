/**
 * @file tests/e2e/helpers/visual.ts
 * @description Shared helpers for Playwright visual regression screenshots.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { dismissCookieConsent } from "./cookie-consent";

/** Fixed viewport for comparable admin-theme screenshots */
export const STABLE_VIEWPORT = { width: 1280, height: 720 } as const;

/** Default screenshot options — tolerates minor font raster differences */
export const SCREENSHOT_OPTS = {
  animations: "disabled" as const,
  maxDiffPixelRatio: 0.05,
  threshold: 0.25,
};

/** Disable motion and hide flaky dynamic widgets before screenshots */
export async function prepareForScreenshot(page: Page) {
  await page.addInitScript(() => {
    // Pre-set cookie consent so the GDPR banner never appears during screenshots
    try {
      localStorage.setItem(
        "sveltycms_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true }),
      );
    } catch {
      /* ignore */
    }

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
  // Deterministic settle: wait for webfonts instead of a fixed 500ms sleep
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

/** Open the sign-in form from the login chooser screen.
 *
 * `resetAndSeedDatabase` (called by the spec's `beforeEach`) already seeds the
 * admin user, so `/login` renders the chooser with `hasAdminUser = true`. We
 * clear ALL context cookies first so no leftover session from a prior test
 * causes `/login` to redirect to the dashboard, then click the chooser's
 * "Go to Sign In" icon (stable `signin-icon` testid) to reveal the form.
 */
export async function openLoginSignInForm(page: Page) {
  // 1. Clear ALL cookies so /login renders the chooser, not a redirect.
  await page.context().clearCookies();

  // 2. Navigate to /login.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);

  const emailField = page.getByTestId("signin-email");
  // Already on the sign-in form (returningUser fast path) — done.
  if (await emailField.isVisible({ timeout: 3_000 }).catch(() => false)) {
    return;
  }

  // 3. Chooser screen — click the "Go to Sign In" icon to reveal the form.
  //    Prefer the stable testid; the element is a div[role="button"] with
  //    aria-label="Go to Sign In", so a role+name locator also resolves to it.
  const signInIcon = page.getByTestId("signin-icon");
  await expect(signInIcon).toBeVisible({ timeout: 15_000 });
  await signInIcon.click({ force: true });
  await dismissCookieConsent(page);
  await emailField.waitFor({ state: "visible", timeout: 15_000 });
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
