/**
 * @file tests/e2e/helpers/visual.ts
 * @description Shared helpers for Playwright visual regression screenshots.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./auth";
import { TEST_API_HEADERS } from "./test-api";

/** Fixed viewport for comparable admin-theme screenshots */
export const STABLE_VIEWPORT = { width: 1280, height: 720 } as const;

/** Default screenshot options — tolerates minor font raster differences */
export const SCREENSHOT_OPTS = {
  animations: "disabled" as const,
  maxDiffPixelRatio: 0.02,
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
  // resetAndSeedDatabase sets a session cookie via the seed endpoint's Set-Cookie response,
  // which causes login/+page.server.ts to redirect authenticated users away from /login.
  await page.context().clearCookies();

  // Navigate first to establish origin, then clear sessionStorage to remove any stale
  // "login_active" token (saved by +page.svelte's $effect) that would otherwise set
  // active=0 and keep the signin-icon permanently hidden. Same pattern as auth.ts.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.clear()).catch(() => {});

  // Reload with clean storage so the login page's $effect sees no login_active
  // and shows the chooser state (active=undefined → signin-icon visible).
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // CRITICAL: Wait for SvelteKit hydration before interacting.
  // Prevents clicks on SSR-only DOM nodes from being silently absorbed
  // before Svelte attaches event handlers (same pattern as auth.ts's prepareLoginForm).
  await page.waitForLoadState("networkidle");

  const signInIcon = page.getByTestId("signin-icon");
  if (!(await signInIcon.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "networkidle" });
  }

  const openSignIn = async () => {
    const icon = page.getByTestId("signin-icon");
    if (await icon.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await icon.click({ force: true });
      return;
    }

    await page
      .getByRole("button", { name: /go to sign in|sign in/i })
      .first()
      .click({
        force: true,
        timeout: 5_000,
      });
  };

  await openSignIn();
  if (
    !(await page
      .getByTestId("signin-email")
      .isVisible({ timeout: 3_000 })
      .catch(() => false))
  ) {
    await page
      .getByRole("button", { name: /go back/i })
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(300);
    await openSignIn();
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
    page.locator('[aria-live="polite"]'),
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
