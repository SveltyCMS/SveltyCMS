/**
 * @file src/utils/system-locale.ts
 * @description System-language helpers: ISO 639-1 validation, bundled Paraglide
 *              catalogs vs flexible UI locales, and HTML lang/dir application.
 *
 * Features:
 * - EN/DE ship compiled (Paraglide). Any other ISO 639-1 code is a valid system
 *   language: layout direction follows the language, UI copy falls back to English
 *   until a catalog is compiled via project.inlang + `bun translate`.
 * - Cookie + localStorage persistence for SSR (`systemLanguage`) and Paraglide
 *   (`PARAGLIDE_LOCALE` via setLocale, compiled locales only).
 */

import { baseLocale, locales, setLocale, type Locale } from "@src/paraglide/runtime";
import { getTextDirection } from "@utils/string";

/** ISO 639-1 two-letter language codes shipped with compiled UI catalogs. */
export const BUNDLED_SYSTEM_LOCALES = locales;

const ISO_639_1 = /^[a-z]{2}$/;
const SYSTEM_LANGUAGE_COOKIE = "systemLanguage";
const COOKIE_MAX_AGE = 31_536_000;

function normalizeLanguageTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

export function languageBase(tag: string): string {
  return normalizeLanguageTag(tag).split("-")[0] ?? "";
}

export function isIso6391LanguageCode(tag: string | undefined | null): tag is string {
  if (!tag || typeof tag !== "string") return false;
  return ISO_639_1.test(languageBase(tag));
}

export function isCompiledSystemLocale(tag: string | undefined | null): tag is Locale {
  if (!tag) return false;
  return (locales as readonly string[]).includes(languageBase(tag));
}

/** Paraglide locale used for message lookup (EN fallback when uncompiled). */
export function compiledUiLocale(tag: string | undefined | null): Locale {
  const base = tag ? languageBase(tag) : "";
  return isCompiledSystemLocale(base) ? (base as Locale) : (baseLocale as Locale);
}

export function systemHtmlAttrs(tag: string | undefined | null): {
  lang: string;
  dir: "ltr" | "rtl";
} {
  const lang = isIso6391LanguageCode(tag) ? languageBase(tag) : "en";
  return { lang, dir: getTextDirection(lang) };
}

export function applyDocumentLanguage(tag: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const { lang, dir } = systemHtmlAttrs(tag);
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

function persistSystemLanguageCookie(lang: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SYSTEM_LANGUAGE_COOKIE}=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Apply a system language for the admin UI.
 * Compiled catalogs (en/de) switch Paraglide messages; other ISO codes keep
 * English copy and still set `html lang` + `dir` (RTL included).
 */
export function applySystemLanguage(tag: string, options?: { reload?: boolean }): void {
  const lang = isIso6391LanguageCode(tag) ? languageBase(tag) : "en";
  const ui = compiledUiLocale(lang);

  if (typeof document !== "undefined") {
    setLocale(ui, { reload: options?.reload ?? false });
    persistSystemLanguageCookie(lang);
    try {
      globalThis.localStorage?.setItem(SYSTEM_LANGUAGE_COOKIE, lang);
    } catch {
      // Private mode / disabled storage
    }
    applyDocumentLanguage(lang);
  }
}

/** Merge bundled catalogs with operator-configured system languages (deduped). */
export function mergeSystemLanguages(
  configured: readonly string[] | undefined | null,
  bundled: readonly string[] = locales,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of [...bundled, ...(configured ?? [])]) {
    if (!isIso6391LanguageCode(code)) continue;
    const base = languageBase(code);
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out.length > 0 ? out : ["en"];
}
