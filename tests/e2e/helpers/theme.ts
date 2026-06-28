/**
 * @file tests/e2e/helpers/theme.ts
 * @description Admin theme API helpers for E2E tests.
 */

import { expect, type Page } from "@playwright/test";

export interface AdminThemePatch {
  density?: "compact" | "cozy" | "spacious";
  variant?: "flat" | "bordered" | "elevated";
  customCss?: string;
  features?: {
    brandedLogin?: boolean;
    stickyActionBar?: boolean;
    collapsibleSidebar?: boolean;
    highContrastMode?: boolean;
    reducedMotion?: boolean;
  };
  lockedSettings?: {
    density?: boolean;
    variant?: boolean;
    reducedMotion?: boolean;
    highContrast?: boolean;
    layoutState?: boolean;
  };
}

/** Save admin theme settings via authenticated API (TEST_MODE skips CSRF) */
export async function saveAdminTheme(page: Page, settings: AdminThemePatch) {
  const res = await page.request.post("/api/theme/admin-theme", {
    data: settings,
  });
  expect(res.ok()).toBeTruthy();
}

/** Enable tenant-branded login with a distinctive variant for assertions */
export async function enableBrandedLogin(
  page: Page,
  variant: "bordered" | "elevated" = "elevated",
) {
  await saveAdminTheme(page, {
    variant,
    features: { brandedLogin: true },
    customCss: "/* e2e-branded-login */ .admin-theme-container { outline: none; }",
  });
}

/** Reset admin theme to factory defaults */
export async function resetAdminTheme(page: Page) {
  const res = await page.request.delete("/api/theme/admin-theme");
  expect(res.ok()).toBeTruthy();
}
