/**
 * @file tests/e2e/helpers/cookie-consent.ts
 * @description Shared cookie-consent helpers for Playwright E2E.
 *
 * The GDPR banner is a role="dialog" with high z-index and intercepts clicks /
 * collides with strict-mode getByRole('dialog') lookups. Prefer pre-seeding
 * localStorage before navigation; fall back to force-click Accept All.
 */

import type { Page, BrowserContext } from "@playwright/test";

/** Value written by the product consent store when the user has responded. */
export const CONSENT_STORAGE_KEY = "sveltycms_consent";
export const CONSENT_VALUE = JSON.stringify({
  necessary: true,
  analytics: false,
  marketing: false,
  responded: true,
});

/**
 * Inject consent into localStorage before any page scripts run.
 * Call once per test (or once per context) before first navigation.
 */
export async function seedCookieConsent(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
        sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
        localStorage.setItem("sveltycms-welcome-seen", "true");
      } catch {
        /* storage may be restricted in some contexts */
      }
    },
    { key: CONSENT_STORAGE_KEY, value: CONSENT_VALUE },
  );
}

/**
 * Same as seedCookieConsent but for a whole BrowserContext (new pages inherit it).
 */
export async function seedCookieConsentOnContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
        sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
        localStorage.setItem("sveltycms-welcome-seen", "true");
      } catch {
        /* ignore */
      }
    },
    { key: CONSENT_STORAGE_KEY, value: CONSENT_VALUE },
  );
}

/**
 * Dismiss the banner if it still appears (e.g. storage was cleared mid-test).
 * Uses force:true so z-index / intercepting ancestors cannot block the click.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    const acceptBtn = page.getByRole("button", { name: /accept all/i });
    if (await acceptBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await acceptBtn.click({ force: true });
      await page.waitForTimeout(200);
      return;
    }
    const rejectBtn = page.getByRole("button", { name: /reject all/i });
    if (await rejectBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await rejectBtn.click({ force: true });
      await page.waitForTimeout(200);
      return;
    }
    const dialogBtn = page
      .getByRole("dialog", { name: /privacy|cookie|consent/i })
      .getByRole("button")
      .first();
    if (await dialogBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dialogBtn.click({ force: true });
      await page.waitForTimeout(200);
    }
  } catch {
    /* banner not present */
  }
}

/**
 * Preferred app dialog locator that excludes the GDPR cookie banner.
 */
export function appDialog(page: Page, name?: string | RegExp) {
  const cookie = page.getByRole("dialog", { name: /privacy|cookie|we value your privacy/i });
  if (name) {
    return page.getByRole("dialog", { name }).filter({ hasNot: cookie }).first();
  }
  // Any non-cookie dialog (native <dialog> or ARIA dialog without privacy copy)
  return page
    .getByRole("dialog")
    .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i })
    .first();
}
