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
 *
 * Canonical dual-variant dismisser for the whole E2E suite:
 * 1. role-based GDPR dialog (Accept all / Reject all buttons)
 * 2. testid fallback (`cookie-accept-all` / `cookie-accept`)
 * plus a last-resort click on the first button of any cookie/privacy dialog.
 *
 * Uses force:true so z-index / intercepting ancestors cannot block the click,
 * and bounded waits so an absent banner costs at most a few seconds. Storage
 * is stamped first so the banner does not reappear after navigation.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // Stamp storage so the banner does not reappear after invalidateAll / navigation
    await page
      .evaluate((value) => {
        try {
          window.localStorage.setItem("sveltycms_consent", value);
          window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
          window.localStorage.setItem("sveltycms-welcome-seen", "true");
        } catch {
          /* storage restricted */
        }
      }, CONSENT_VALUE)
      .catch(() => {});

    // Variant 1: role-based dialog accept
    const acceptBtn = page.getByRole("button", { name: /accept all/i });
    if (await acceptBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await acceptBtn.click({ force: true });
      await acceptBtn.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
      return;
    }
    const rejectBtn = page.getByRole("button", { name: /reject all/i });
    if (await rejectBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await rejectBtn.click({ force: true });
      await rejectBtn.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
      return;
    }
    // Variant 2: testid fallback (cookie consent component)
    const testIdAccept = page
      .getByTestId("cookie-accept-all")
      .or(page.getByTestId("cookie-accept"));
    if (
      await testIdAccept
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await testIdAccept
        .first()
        .click({ force: true })
        .catch(() => {});
      await testIdAccept
        .first()
        .waitFor({ state: "hidden", timeout: 2_000 })
        .catch(() => {});
      return;
    }
    // Last resort: any button inside a cookie/privacy dialog
    const dialogBtn = page
      .getByRole("dialog", { name: /privacy|cookie|consent/i })
      .getByRole("button")
      .first();
    if (await dialogBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dialogBtn.click({ force: true });
      await dialogBtn.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
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
