/**
 * @file src/hooks/handle-user-preferences.ts
 * @description
 * Synchronizes user preferences (language and theme) from cookies to stores and handles SSR theme rendering.
 * Combining these reduces middleware Promise chain overhead for better performance.
 *
 * ### Performance:
 * - Uses pre-computed request flags from Turbo Pipeline to skip API/static routes
 * - Only runs transformPageChunk for dark-mode to prevent FOUC (Flash of Unstyled Content)
 * - Skips theme retrieval when ThemeManager is not initialized
 */

import { ThemeManager } from "@src/databases/theme-manager";
import { getSystemState } from "@src/stores/system/state.svelte.ts";
import type { Locale } from "@src/paraglide/runtime";
import { locales } from "@src/paraglide/runtime";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { getRequestFlags } from "@utils/hook-utils";

// --- UTILITY FUNCTIONS ---

function isValidLocale(lang: string | undefined): lang is Locale {
  if (!lang) {
    return false;
  }
  return (locales as readonly string[]).includes(lang);
}

// --- MAIN HOOK ---

export const handleUserPreferences: Handle = async ({ event, resolve }) => {
  const { cookies, locals } = event;

  // 🧪 TERMINAL BYPASS: Verified benchmarks skip UI preference sync
  if ((locals as any).__testBypass) return resolve(event);

  // 🚀 FAST-PATH: Skip entirely for API routes and static assets using pre-computed flags
  const flags = getRequestFlags(locals as any);
  if (flags.isApi || flags.isStatic) return resolve(event);

  // --- 1. LOCALE LOGIC ---
  // 🚨 SSR-SAFETY: the `app` store is a module-level singleton ($state proxy).
  // Mutating it here during a request would leak the language preference to
  // other concurrent requests rendered in the same Node.js process (cross-user /
  // cross-tenant pollution). The locale is therefore carried request-scoped on
  // `event.locals`; SSR reads it from locals and the client hydrates its own
  // stores from the injected page data (see `+layout.server.ts`).
  const systemLangCookie = cookies.get("systemLanguage");
  const systemLangValid = systemLangCookie ? isValidLocale(systemLangCookie) : false;
  if (systemLangCookie && !systemLangValid) {
    logger.debug("Removing invalid systemLanguage cookie");
    cookies.delete("systemLanguage", { path: "/" });
  }

  const contentLangCookie = cookies.get("contentLanguage");
  const contentLangValid = contentLangCookie ? isValidLocale(contentLangCookie) : false;
  if (contentLangCookie && !contentLangValid) {
    logger.debug("Removing invalid contentLanguage cookie");
    cookies.delete("contentLanguage", { path: "/" });
  }

  // Request-scoped SSR language (no global store mutation)
  event.locals.systemLanguage = systemLangValid ? (systemLangCookie as Locale) : undefined;
  event.locals.contentLanguage = contentLangValid ? (contentLangCookie as Locale) : undefined;

  // --- 2. THEME LOGIC ---
  const themeManager = ThemeManager.getInstance();
  const themePreference = cookies.get("theme") as "system" | "light" | "dark" | undefined;

  let isDarkMode = false;
  if (themePreference === "dark") {
    isDarkMode = true;
  } else if (themePreference === "light") {
    isDarkMode = false;
  } else {
    isDarkMode = false; // Default for 'system', client script will fix
  }

  event.locals.darkMode = isDarkMode;

  if (themeManager.isInitialized()) {
    try {
      const currentTheme = await themeManager.getTheme(event.locals.tenantId);
      event.locals.theme = currentTheme;
      event.locals.customCss = currentTheme?.customCss || "";
    } catch (err) {
      const sysState = getSystemState();
      if (sysState.overallState === "READY" || sysState.overallState === "DEGRADED") {
        logger.error("Error retrieving custom CSS in handleUserPreferences hook:", err);
      } else {
        logger.debug("ThemeManager not ready, skipping custom CSS.");
      }
      event.locals.theme = null;
      event.locals.customCss = "";
    }
  } else {
    event.locals.theme = null;
    event.locals.customCss = "";
  }

  // 🚀 FAST-PATH: Skip transformPageChunk if not dark mode (no HTML transformation needed)
  if (themePreference !== "dark") {
    return resolve(event);
  }

  // Transform the HTML response to prevent dark-mode flickering
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      const htmlTag = '<html lang="en" dir="ltr">';
      return html.replace(htmlTag, '<html lang="en" dir="ltr" class="dark">');
    },
  });
};
