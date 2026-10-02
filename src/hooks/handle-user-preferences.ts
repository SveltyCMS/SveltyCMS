/**
 * @file src/hooks/handle-user-preferences.ts
 * @description
 * Synchronizes user preferences (language and theme) from cookies to stores and handles SSR theme rendering.
 * Combining these reduces middleware Promise chain overhead for better performance.
 *
 * ### Performance:
 * - Uses pre-computed request flags from Turbo Pipeline to skip API/static routes
 * - Stamps html lang/dir from the system-language cookie (RTL via getTextDirection)
 * - Adds class="dark" in transformPageChunk to prevent FOUC when the theme cookie is dark
 * - Skips theme retrieval when ThemeManager is not initialized
 */

import { ThemeManager } from "@src/databases/theme-manager";
import { getSystemState } from "@src/stores/system/state.svelte.ts";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { getRequestFlags, shouldSkipRouteMiddleware } from "@utils/hook-utils";
import { isIso6391LanguageCode, languageBase, systemHtmlAttrs } from "@utils/system-locale";

// --- MAIN HOOK ---

export const handleUserPreferences: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  if (pathname.startsWith("/api/")) return resolve(event);

  const { cookies, locals } = event;

  // Bootstrap / login / setup: route spec skips preference cookie+theme work.
  if (shouldSkipRouteMiddleware(locals, "preferences")) return resolve(event);

  // 🧪 TERMINAL BYPASS: Verified benchmarks skip UI preference sync
  if ((locals as any).__testBypass) return resolve(event);

  // 🚀 FAST-PATH: Skip entirely for static assets using pre-computed flags
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
  const systemLangValid = isIso6391LanguageCode(systemLangCookie);
  if (systemLangCookie && !systemLangValid) {
    logger.debug("Removing invalid systemLanguage cookie");
    cookies.delete("systemLanguage", { path: "/" });
  }

  const contentLangCookie = cookies.get("contentLanguage");
  const contentLangValid = isIso6391LanguageCode(contentLangCookie);
  if (contentLangCookie && !contentLangValid) {
    logger.debug("Removing invalid contentLanguage cookie");
    cookies.delete("contentLanguage", { path: "/" });
  }

  // Request-scoped SSR language (no global store mutation)
  event.locals.systemLanguage = systemLangValid ? languageBase(systemLangCookie) : undefined;
  event.locals.contentLanguage = contentLangValid ? languageBase(contentLangCookie) : undefined;

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

  const { lang, dir } = systemHtmlAttrs(event.locals.systemLanguage);
  const applyHtmlLangDir = (html: string): string =>
    html.replace(/\blang="[^"]*"/, `lang="${lang}"`).replace(/\bdir="[^"]*"/, `dir="${dir}"`);

  // Always stamp html lang/dir (RTL included).
  // app.html hardcodes class="dark"; swap it for light so a light-mode user
  // does not get a dark flash (and does not end up dark if theme-init.js fails).
  if (themePreference === "light") {
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        const withLang = applyHtmlLangDir(html);
        if (/\bclass="dark"/.test(withLang)) {
          return withLang.replace(/\bclass="dark"/, 'class="light"');
        }
        if (/\bclass="light"/.test(withLang)) {
          return withLang;
        }
        return withLang.replace(/<html\b([^>]*)>/, '<html$1 class="light">');
      },
    });
  }

  if (themePreference === "dark") {
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        const withLang = applyHtmlLangDir(html);
        if (/\bclass="dark"/.test(withLang)) return withLang;
        return withLang.replace(/<html\b([^>]*)>/, `<html$1 class="dark">`);
      },
    });
  }

  // system: keep the app.html default; theme-init.js resolves the OS preference.
  return resolve(event, {
    transformPageChunk: ({ html }) => applyHtmlLangDir(html),
  });
};
