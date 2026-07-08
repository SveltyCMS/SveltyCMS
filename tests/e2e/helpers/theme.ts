/**
 * @file tests/e2e/helpers/theme.ts
 * @description Admin theme API helpers for E2E tests.
 */

import type { Page } from "@playwright/test";

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

/**
 * Make an authenticated API call from within the browser context.
 * Uses page.evaluate so session cookies are automatically included.
 */
async function fetchFromBrowser(
  page: Page,
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return page.evaluate(
    async ({ url, method, body }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await fetch(url, init);
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* keep as text */
      }
      return { ok: res.ok, status: res.status, data };
    },
    {
      url,
      method: options.method || "GET",
      ...(options.body !== undefined ? { body: options.body } : {}),
    },
  );
}

/** Save admin theme settings via authenticated browser fetch */
export async function saveAdminTheme(page: Page, settings: AdminThemePatch) {
  const result = await fetchFromBrowser(page, "/api/theme/admin-theme", {
    method: "POST",
    body: settings,
  });
  if (!result.ok) {
    console.warn(
      `[Theme] saveAdminTheme failed with status ${result.status}: ${JSON.stringify(result.data)}`,
    );
  }
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

/** Get admin theme via authenticated browser fetch */
export async function getAdminTheme(page: Page): Promise<{ ok: boolean; data: unknown }> {
  return fetchFromBrowser(page, "/api/theme/admin-theme");
}

/** Reset admin theme to factory defaults */
export async function resetAdminTheme(page: Page) {
  const result = await fetchFromBrowser(page, "/api/theme/admin-theme", { method: "DELETE" });
  if (!result.ok) {
    console.warn(`[Theme] resetAdminTheme failed with status ${result.status}`);
  }
}
