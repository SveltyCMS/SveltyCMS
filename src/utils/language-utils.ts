/**
 * @file src/utils/language-utils.ts
 * @description Display language names using browser's native Intl API with high-performance caching.
 *
 * ### Hardening (audit 2026-07):
 * - Instance caching: Intl.DisplayNames instances cached per locale (prevents O(n) CPU on lists)
 * - Title casing: capitalize() ensures "español" → "Español" for UI consistency
 * - BCP 47 normalization: auto-corrects en_US → en-US before Intl processing
 * - Validation firewall: getCanonicalLocales validates before expensive construction
 * - Production-safe: only logs in dev (prevents log poisoning / DoS in production)
 */

import { logger } from "@utils/logger";

// Cache Intl.DisplayNames instances to prevent massive CPU overhead on lists
const displayNamesCache = new Map<string, Intl.DisplayNames>();
const SUPPORTS_INTL = typeof Intl !== "undefined" && "DisplayNames" in Intl;

function normalizeTag(tag: string): string {
  return tag.trim().replace(/_/g, "-");
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Gets the native or localized name of a language using the browser's Intl.DisplayNames API.
 *
 * @param tag - Language code (ISO 639-1 like 'en', 'de' or extended like 'zh-CN')
 * @param displayLocale - Optional locale to display the name in (defaults to native name)
 * @returns The language name in native form or specified display locale
 */
export function getLanguageName(tag: string, displayLocale?: string): string {
  if (!tag || typeof tag !== "string") return "";

  const safeTag = normalizeTag(tag);
  if (!safeTag) return tag;

  if (!SUPPORTS_INTL) return safeTag;

  try {
    const locale = displayLocale ? normalizeTag(displayLocale) : safeTag;

    // Validate BCP 47 tags before attempting to construct formatters
    const validLocale = Intl.getCanonicalLocales(locale)[0];
    const validTag = Intl.getCanonicalLocales(safeTag)[0];

    if (!displayNamesCache.has(validLocale)) {
      displayNamesCache.set(
        validLocale,
        new Intl.DisplayNames([validLocale], { type: "language", fallback: "none" }),
      );
    }

    const formatter = displayNamesCache.get(validLocale)!;
    const name = formatter.of(validTag);

    return name ? capitalize(name) : safeTag;
  } catch {
    // Only log in dev to prevent production log spam from bad user-provided URLs/locales
    if (process.env.NODE_ENV === "development") {
      logger.warn(
        `[languageUtils] Invalid language tag/locale: tag="${tag}", locale="${displayLocale}"`,
      );
    }
    return safeTag;
  }
}
