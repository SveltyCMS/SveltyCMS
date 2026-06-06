/**
 * @file src/hooks/handle-user-preferences.ts
 * @description Synchronizes user preferences (language and theme) from cookies to stores and handles SSR theme rendering.
 * Combining these reduces middleware Promise chain overhead for better performance.
 *
 * Performance:
 * - Uses pre-computed request flags from Turbo Pipeline to skip API/static routes
 * - Only runs transformPageChunk for dark-mode to prevent FOUC (Flash of Unstyled Content)
 * - Skips theme retrieval when ThemeManager is not initialized
 */

import { ThemeManager } from "@src/databases/theme-manager";
import { getSystemState } from "@src/stores/system/state.svelte.ts";
import type { Locale } from "@src/paraglide/runtime";
import { locales } from "@src/paraglide/runtime";
import { app } from "@src/stores/store.svelte";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getRequestFlags } from "@utils/hook-utils";

// --- UTILITY FUNCTIONS ---

function isValidLocale(lang: string | undefined): lang is Locale {
  if (!lang) {
    return false;
  }
  return (locales as readonly string[]).includes(lang);
}

function safelySetLanguage(
  cookieName: string,
  cookieValue: string | undefined,
  setter: (value: Locale) => void,
): boolean {
  if (!cookieValue) {
    return false;
  }

  if (!isValidLocale(cookieValue)) {
    logger.warn(
      `Invalid ${cookieName} cookie value: "${cookieValue}". Supported locales: ${locales.join(", ")}`,
    );
    return false;
  }

  try {
    setter(cookieValue);
    logger.trace(`${cookieName} set to: ${cookieValue}`);
    return true;
  } catch (err: any) {
    logger.error(`Failed to set ${cookieName} store: ${err.message}`);
    return false;
  }
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
  if (app) {
    const systemLangCookie = cookies.get("systemLanguage");
    const systemLangSet = safelySetLanguage(
      "systemLanguage",
      systemLangCookie,
      (value) => (app.systemLanguage = value),
    );
    if (systemLangCookie && !systemLangSet) {
      logger.debug("Removing invalid systemLanguage cookie");
      cookies.delete("systemLanguage", { path: "/" });
    }

    const contentLangCookie = cookies.get("contentLanguage");
    const contentLangSet = safelySetLanguage(
      "contentLanguage",
      contentLangCookie,
      (value) => (app.contentLanguage = value),
    );
    if (contentLangCookie && !contentLangSet) {
      logger.debug("Removing invalid contentLanguage cookie");
      cookies.delete("contentLanguage", { path: "/" });
    }
  } else {
    logger.warn("Language stores not available on server, skipping locale sync");
  }

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
