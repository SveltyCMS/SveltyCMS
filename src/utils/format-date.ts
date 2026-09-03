/**
 * @file src/utils/format-date.ts
 * @description Centralized, SSR-safe date, time, and number formatting utilities for SveltyCMS.
 *
 * Features:
 * - Deterministic SSR & client hydration parity via request-scoped systemLanguage
 * - Fallbacks to Paraglide getLocale() and 'en'
 * - High-throughput memoized Intl.DateTimeFormat and Intl.NumberFormat instances
 * - Polymorphic input support: Date instances, ISO strings, numeric timestamps (ms or s)
 * - Safe fallback on null, undefined, or invalid date values without throwing
 */

import { page } from "$app/state";
import { getLocale } from "@src/paraglide/runtime";

/**
 * Resolves the active UI locale deterministically for SSR and hydration.
 *
 * Priority order:
 * 1. Explicitly provided locale argument
 * 2. `page.data.systemLanguage` (request-scoped from SvelteKit layout)
 * 3. Paraglide `getLocale()` (AsyncLocalStorage on server, active locale on client)
 * 4. Fallback: "en"
 */
export function resolveLocale(explicitLocale?: string): string {
  if (explicitLocale && typeof explicitLocale === "string" && explicitLocale.trim().length > 0) {
    return explicitLocale.trim();
  }

  try {
    const pageLang = page?.data?.systemLanguage;
    if (pageLang && typeof pageLang === "string" && pageLang.trim().length > 0) {
      return pageLang.trim();
    }
  } catch {
    // Outside SvelteKit render tree or in standalone worker/test context
  }

  try {
    const paraglideLang = getLocale();
    if (paraglideLang && typeof paraglideLang === "string" && paraglideLang.trim().length > 0) {
      return paraglideLang.trim();
    }
  } catch {
    // Paraglide context not yet initialized
  }

  return "en";
}

// 🛡️ Format caches — avoids repeated instantiation on high-frequency rendering loops
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

/**
 * Safely parses input into a valid Date instance.
 * Returns null if the input is null, undefined, empty, or cannot be parsed.
 */
export function parseDateInput(input: Date | number | string | null | undefined): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number") {
    // Heuristic: seconds vs milliseconds timestamp
    const ms = input > 1e11 ? input : input * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Normalizes options and locale arguments when callers pass either (options, locale)
 * or (locale, options) or just (locale).
 */
function normalizeDateArgs(
  optionsOrLocale?: Intl.DateTimeFormatOptions | string,
  explicitLocale?: string,
): { options: Intl.DateTimeFormatOptions | undefined; locale: string } {
  if (typeof optionsOrLocale === "string") {
    return {
      options: undefined,
      locale: resolveLocale(optionsOrLocale),
    };
  }
  return {
    options: optionsOrLocale,
    locale: resolveLocale(explicitLocale),
  };
}

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
};

const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
};

/**
 * Format date and time (drop-in replacement for `date.toLocaleString()`).
 *
 * @param dateInput - Date, timestamp ms/s, or ISO string.
 * @param optionsOrLocale - Intl.DateTimeFormatOptions or locale string.
 * @param explicitLocale - Optional locale override (if options was passed as 2nd arg).
 * @param fallback - String returned when dateInput is null, undefined, or invalid (default: "").
 */
export function formatDateTime(
  dateInput: Date | number | string | null | undefined,
  optionsOrLocale?: Intl.DateTimeFormatOptions | string,
  explicitLocale?: string,
  fallback = "",
): string {
  const date = parseDateInput(dateInput);
  if (!date) return fallback;

  const { options = DEFAULT_DATETIME_OPTIONS, locale } = normalizeDateArgs(
    optionsOrLocale,
    explicitLocale,
  );

  const cacheKey = `${locale}:dt:${JSON.stringify(options)}`;
  let formatter = dateTimeFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(cacheKey, formatter);
  }

  try {
    return formatter.format(date);
  } catch {
    return fallback;
  }
}

/**
 * Format date only (drop-in replacement for `date.toLocaleDateString()`).
 *
 * @param dateInput - Date, timestamp ms/s, or ISO string.
 * @param optionsOrLocale - Intl.DateTimeFormatOptions or locale string.
 * @param explicitLocale - Optional locale override.
 * @param fallback - String returned when dateInput is null, undefined, or invalid (default: "").
 */
export function formatDate(
  dateInput: Date | number | string | null | undefined,
  optionsOrLocale?: Intl.DateTimeFormatOptions | string,
  explicitLocale?: string,
  fallback = "",
): string {
  const date = parseDateInput(dateInput);
  if (!date) return fallback;

  const { options, locale } = normalizeDateArgs(optionsOrLocale, explicitLocale);

  const cacheKey = `${locale}:d:${options ? JSON.stringify(options) : "default"}`;
  let formatter = dateTimeFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = options
      ? new Intl.DateTimeFormat(locale, options)
      : new Intl.DateTimeFormat(locale);
    dateTimeFormatCache.set(cacheKey, formatter);
  }

  try {
    return formatter.format(date);
  } catch {
    return fallback;
  }
}

/**
 * Format time only (drop-in replacement for `date.toLocaleTimeString()`).
 *
 * @param dateInput - Date, timestamp ms/s, or ISO string.
 * @param optionsOrLocale - Intl.DateTimeFormatOptions or locale string.
 * @param explicitLocale - Optional locale override.
 * @param fallback - String returned when dateInput is null, undefined, or invalid (default: "").
 */
export function formatTime(
  dateInput: Date | number | string | null | undefined,
  optionsOrLocale?: Intl.DateTimeFormatOptions | string,
  explicitLocale?: string,
  fallback = "",
): string {
  const date = parseDateInput(dateInput);
  if (!date) return fallback;

  const { options = DEFAULT_TIME_OPTIONS, locale } = normalizeDateArgs(
    optionsOrLocale,
    explicitLocale,
  );

  const cacheKey = `${locale}:t:${JSON.stringify(options)}`;
  let formatter = dateTimeFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(cacheKey, formatter);
  }

  try {
    return formatter.format(date);
  } catch {
    return fallback;
  }
}

/**
 * Format number with deterministic locale.
 */
export function formatNumber(
  num: number | null | undefined,
  optionsOrLocale?: Intl.NumberFormatOptions | string,
  explicitLocale?: string,
  fallback = "—",
): string {
  if (num == null || Number.isNaN(num)) return fallback;

  let options: Intl.NumberFormatOptions | undefined;
  let locale: string;

  if (typeof optionsOrLocale === "string") {
    options = undefined;
    locale = resolveLocale(optionsOrLocale);
  } else {
    options = optionsOrLocale;
    locale = resolveLocale(explicitLocale);
  }

  const cacheKey = `${locale}:num:${options ? JSON.stringify(options) : "default"}`;
  let formatter = numberFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = options ? new Intl.NumberFormat(locale, options) : new Intl.NumberFormat(locale);
    numberFormatCache.set(cacheKey, formatter);
  }

  try {
    return formatter.format(num);
  } catch {
    return String(num);
  }
}
