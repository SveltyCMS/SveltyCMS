/**
 * @file tests/e2e/helpers/stable.ts
 * @description CSS-stable Playwright helpers for E2E.
 *
 * Prefer role / name / data-testid over class selectors so refactors and
 * Tailwind class churn do not break journeys.
 *
 * ### Features:
 * - page shell readiness (testid or heading)
 * - toast assertions via role=alert / data-testid
 * - dialog helpers scoped by accessible name
 * - replace fixed sleeps with expect polling
 */

import { expect, type Locator, type Page } from "@playwright/test";

const DEFAULT_TIMEOUT = 20_000;

/** Wait until admin shell markers are present (not CSS-dependent). */
export async function waitForAdminShell(page: Page, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/, { timeout });
  const shell = page
    .getByTestId("page-title")
    .or(page.getByTestId("access-mgmt-page"))
    .or(page.getByRole("main"))
    .or(page.locator("[data-testid]").first());
  await expect(shell.first()).toBeVisible({ timeout });
}

/**
 * Assert a toast appears. Matches title, body text, or data-testid="app-toast".
 * Uses role=alert (a11y) — stable when toast styles change.
 */
export async function expectToast(
  page: Page,
  pattern: RegExp | string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const toast = page
    .getByTestId("app-toast")
    .filter({ hasText: re })
    .or(page.getByRole("alert").filter({ hasText: re }))
    .or(page.locator("[data-toast-region]").getByText(re));

  await expect(toast.first()).toBeVisible({ timeout });
}

/**
 * Prefer accessible dialog by aria-label/name (native <dialog> title prop),
 * not CSS classes. Falls back to any dialog excluding cookie banners.
 */
export function getAppDialog(page: Page, name?: RegExp | string): Locator {
  const re = typeof name === "string" ? new RegExp(name, "i") : (name ?? /./);
  // aria-label from Modal title prop — more reliable than nested heading markup
  return page
    .getByRole("dialog", { name: re })
    .or(
      page
        .getByRole("dialog")
        .filter({ hasText: re })
        .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i }),
    )
    .first();
}

/** Wait until loading markers disappear (testid-based). */
export async function waitForLoadingGone(
  page: Page,
  testId: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  await expect(page.getByTestId(testId)).toHaveCount(0, { timeout });
}

/**
 * Poll until a condition is true without fixed sleeps.
 * Prefer this over page.waitForTimeout for readiness.
 */
export async function waitUntil(
  fn: () => Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? 200;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(options.message || `waitUntil timed out after ${timeout}ms`);
}

/** Dismiss cookie banner if present (testid/role, not CSS). */
export async function dismissCookieBannerIfPresent(page: Page): Promise<void> {
  const accept = page
    .getByTestId("cookie-accept")
    .or(page.getByRole("button", { name: /accept|agree|got it|ok/i }));
  if (
    await accept
      .first()
      .isVisible({ timeout: 800 })
      .catch(() => false)
  ) {
    await accept
      .first()
      .click()
      .catch(() => undefined);
  }
}
