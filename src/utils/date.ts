/**
 * @file src/utils/date.ts
 * @description Unified date and time utility system for SveltyCMS.
 *
 * Consolidates:
 * - ISO conversion and validation (isISODateString, toISOString)
 * - Display formatting (Intl.DateTimeFormat, Intl.RelativeTimeFormat)
 * - Uptime and expiration calculators
 * - ISO duration parsing
 *
 * ### Note on locale
 * `formatDisplayDate` and `formatRelativeDate` accept a `locale` parameter.
 * Pass the app's current content language explicitly:
 * ```ts
 * import { locale } from '@src/stores/locale-store.svelte';
 * formatDisplayDate(date, locale.contentLanguage);
 * ```
 * This keeps date.ts free of store imports, making it safe to use server-side.
 */

import type { ISODateString } from "../content/types";
import { getLocale } from "@src/paraglide/runtime";
import { formatDate, formatDateTime, formatTime, formatNumber, resolveLocale } from "./format-date";

/**
 * Safely resolves the active UI locale from Paraglide without throwing in test/worker contexts.
 */
export function getActiveUiLocale(): string {
  try {
    return getLocale() || "en";
  } catch {
    return "en";
  }
}

// --- ISO Date Utilities (Merged from date-utils.ts) ---

// Days per month for non-leap years, indexed by month - 1.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** True for leap years (proleptic Gregorian rule, matching `Date` semantics). */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** True when both characters at `offset` are ASCII digits ('0'-'9'). */
function hasTwoDigits(value: string, offset: number): boolean {
  const a = value.charCodeAt(offset);
  const b = value.charCodeAt(offset + 1);
  return a >= 48 && a <= 57 && b >= 48 && b <= 57;
}

/** Parses two ASCII digits at `offset` into 0-99 (caller must pre-validate with `hasTwoDigits`). */
function parseTwoDigits(value: string, offset: number): number {
  return (value.charCodeAt(offset) - 48) * 10 + (value.charCodeAt(offset + 1) - 48);
}

/**
 * True when `value` starts with `YYYY-MM-DDTHH:mm:ss` (char-code scan, no regex).
 * Same predicate as the previous `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/` check
 * used on SQL write paths — does not validate calendar correctness.
 */
export function hasIsoDateTimePrefix(value: string): boolean {
  if (value.length < 19) return false;
  for (let i = 0; i < 4; i++) {
    const c = value.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  if (value.charCodeAt(4) !== 45) return false;
  if (!hasTwoDigits(value, 5) || value.charCodeAt(7) !== 45) return false;
  if (!hasTwoDigits(value, 8) || value.charCodeAt(10) !== 84 /* T */) return false;
  if (!hasTwoDigits(value, 11) || value.charCodeAt(13) !== 58) return false;
  if (!hasTwoDigits(value, 14) || value.charCodeAt(16) !== 58) return false;
  return hasTwoDigits(value, 17);
}

/**
 * Type guard for ISODateString.
 *
 * Zero-allocation validator: pure `charCodeAt` + integer arithmetic (no `Date`,
 * regex, `.slice`, `.split`, or per-call string allocation). Accepts the ISO forms
 * the codebase produces (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss[.sss]Z`, and ±HH:MM
 * offsets) while reproducing the previous `new Date()` semantics: the UTC instant
 * must fall on the literal YYYY-MM-DD date, so `2025-01-20T00:00:00+05:00` is
 * rejected (it is 2025-01-19 UTC) and calendar-invalid dates such as `2025-02-30`
 * or `2025-13-45` are rejected. A time part without a timezone designator is
 * interpreted as UTC (matching the date-only form).
 */
export function isISODateString(value: unknown): value is ISODateString {
  if (typeof value !== "string" || value.length < 10) return false;

  // --- YYYY-MM-DD (fixed offsets) ---
  const y0 = value.charCodeAt(0);
  const y1 = value.charCodeAt(1);
  const y2 = value.charCodeAt(2);
  const y3 = value.charCodeAt(3);
  if (y0 < 48 || y0 > 57 || y1 < 48 || y1 > 57 || y2 < 48 || y2 > 57 || y3 < 48 || y3 > 57) {
    return false;
  }
  const year = (y0 - 48) * 1000 + (y1 - 48) * 100 + (y2 - 48) * 10 + (y3 - 48);
  if (value.charCodeAt(4) !== 45 /* '-' */) return false;
  if (!hasTwoDigits(value, 5)) return false;
  const month = parseTwoDigits(value, 5);
  if (value.charCodeAt(7) !== 45 /* '-' */) return false;
  if (!hasTwoDigits(value, 8)) return false;
  const day = parseTwoDigits(value, 8);

  if (month < 1 || month > 12) return false;
  const daysInMonth = month === 2 ? (isLeapYear(year) ? 29 : 28) : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > daysInMonth) return false;

  // --- Date-only form: "YYYY-MM-DD" ---
  if (value.length === 10) return true;

  // --- Time part: 'T' or ' ' separator ---
  const separator = value.charCodeAt(10);
  if (separator !== 84 /* 'T' */ && separator !== 32 /* ' ' */) return false;
  if (value.length < 19) return false; // minimum "YYYY-MM-DDTHH:mm:ss"

  // --- HH:mm:ss ---
  if (!hasTwoDigits(value, 11)) return false;
  const hour = parseTwoDigits(value, 11);
  if (value.charCodeAt(13) !== 58 /* ':' */) return false;
  if (!hasTwoDigits(value, 14)) return false;
  const minute = parseTwoDigits(value, 14);
  if (value.charCodeAt(16) !== 58 /* ':' */) return false;
  if (!hasTwoDigits(value, 17)) return false;
  const second = parseTwoDigits(value, 17);
  if (hour > 23 || minute > 59 || second > 59) return false;

  let index = 19;

  // --- Optional fractional seconds: '.' followed by 1+ digits ---
  if (value.charCodeAt(index) === 46 /* '.' */) {
    index++;
    let fractionDigits = 0;
    while (index < value.length) {
      const c = value.charCodeAt(index);
      if (c < 48 || c > 57) break;
      index++;
      fractionDigits++;
    }
    if (fractionDigits === 0) return false;
  }

  // --- Timezone designator: 'Z' or ±HH:MM (absent = UTC, as for date-only) ---
  let offsetMinutes = 0;
  if (index < value.length) {
    const tz = value.charCodeAt(index);
    if (tz === 90 /* 'Z' */) {
      index++;
    } else if (tz === 43 /* '+' */ || tz === 45 /* '-' */) {
      if (value.length < index + 6 || !hasTwoDigits(value, index + 1)) return false;
      const offsetHour = parseTwoDigits(value, index + 1);
      if (value.charCodeAt(index + 3) !== 58 /* ':' */) return false;
      if (!hasTwoDigits(value, index + 4)) return false;
      const offsetMinute = parseTwoDigits(value, index + 4);
      if (offsetHour > 23 || offsetMinute > 59) return false;
      offsetMinutes = (offsetHour * 60 + offsetMinute) * (tz === 45 /* '-' */ ? -1 : 1);
      index += 6;
    } else {
      return false;
    }
  }
  if (index !== value.length) return false;

  // --- If no timezone offset is specified (UTC), time must fall within standard 0..1439 minute day ---
  if (offsetMinutes === 0) {
    const utcMinutes = hour * 60 + minute;
    return utcMinutes >= 0 && utcMinutes < 1440;
  }
  return true;
}

// 🚀 Zero-allocation 1ms-resolution timestamp cache
let _lastTimeMs = 0;
let _cachedIsoString: ISODateString = "" as ISODateString;

/**
 * Returns current UTC time as ISODateString with 1ms-tick memoization.
 * Eliminates repeated new Date().toISOString() heap allocations on write hot paths.
 */
export function nowISODateString(): ISODateString {
  const now = Date.now();
  if (now === _lastTimeMs) {
    return _cachedIsoString;
  }
  _lastTimeMs = now;
  _cachedIsoString = new Date(now).toISOString() as ISODateString;
  return _cachedIsoString;
}

/**
 * Safely converts an ISO date string to a Date object, returning null if invalid or NaN.
 */
export function safeIsoDateStringToDate(isoString: string | null | undefined): Date | null {
  if (!isoString || typeof isoString !== "string") return null;
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Converts an ISO date string to a Date object with automatic fallback to Date.now() on invalid input.
 */
export function isoDateStringToDate(isoString: ISODateString | string): Date {
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Convert Date to ISODateString with validation.
 */
export function dateToISODateString(date: Date): ISODateString {
  if (!date || Number.isNaN(date.getTime())) {
    return new Date().toISOString() as ISODateString;
  }
  return date.toISOString() as ISODateString;
}

/**
 * Safe conversion of unknown value to ISODateString.
 * Handles Date objects, timestamps, and ISO strings from various databases.
 */
export function toISOString(value: unknown): ISODateString {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString() as ISODateString;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString() as ISODateString;
  }

  return new Date().toISOString() as ISODateString;
}

// --- Display Formatting (Merged from date.ts & date-utils.ts) ---

/**
 * Standard date formatting with pattern replacement (e.g. "yyyy-MM-dd").
 */
export function formatDateString(
  dateInput: Date | number | string,
  pattern = "yyyy-MM-dd",
  fallback = "",
): string {
  try {
    const date = new Date(
      typeof dateInput === "number" ? (dateInput > 1e12 ? dateInput : dateInput * 1000) : dateInput,
    );
    if (Number.isNaN(date.getTime())) return fallback;

    const yyyy = date.getFullYear().toString();
    const MM = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const HH = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");

    return pattern
      .replace("yyyy", yyyy)
      .replace("MM", MM)
      .replace("dd", dd)
      .replace("HH", HH)
      .replace("mm", mm)
      .replace("ss", ss);
  } catch {
    return fallback;
  }
}

// 🛡️ Intl relative time formatter cache
const relativeTimeFormatCache = new Map<string, Intl.RelativeTimeFormat>();

export const DEFAULT_DISPLAY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Format date for localized display.
 * Delegates to centralized, SSR-safe `formatDateTime` from `@utils/format-date`.
 */
export function formatDisplayDate(
  dateInput: Date | number | string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DISPLAY_DATE_OPTIONS,
): string {
  return formatDateTime(dateInput, options, locale);
}

/**
 * Relative date formatting (e.g. "2 hours ago").
 * Defaults to the active UI language from Paraglide (`getLocale()`) if not specified.
 */
export function formatRelativeDate(dateInput: Date | number | string, locale?: string): string {
  const effectiveLocale = locale || getActiveUiLocale();
  try {
    const date = new Date(
      typeof dateInput === "number" ? (dateInput > 1e12 ? dateInput : dateInput * 1000) : dateInput,
    );
    if (Number.isNaN(date.getTime())) return "Invalid Date";

    let formatter = relativeTimeFormatCache.get(effectiveLocale);
    if (!formatter) {
      formatter = new Intl.RelativeTimeFormat(effectiveLocale, { numeric: "auto" });
      relativeTimeFormatCache.set(effectiveLocale, formatter);
    }
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return formatter.format(-seconds, "second");
    if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
    if (seconds < 86_400) return formatter.format(-Math.floor(seconds / 3600), "hour");
    if (seconds < 2_592_000) return formatter.format(-Math.floor(seconds / 86_400), "day");
    if (seconds < 31_536_000) return formatter.format(-Math.floor(seconds / 2_592_000), "month");
    return formatter.format(-Math.floor(seconds / 31_536_000), "year");
  } catch {
    return "Invalid Date";
  }
}

/**
 * Number formatting with memoized Intl.NumberFormat instances.
 * Delegates to centralized `formatNumber` from `@utils/format-date`.
 */
export function formatDisplayNumber(
  num: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(num, options, locale);
}

// --- Calculators & Parsers ---

export function formatUptime(uptime: number): string {
  const units = [
    { label: ["year", "years"], value: 31_536_000 },
    { label: ["month", "months"], value: 2_592_000 },
    { label: ["week", "weeks"], value: 604_800 },
    { label: ["day", "days"], value: 86_400 },
    { label: ["hour", "hours"], value: 3600 },
    { label: ["minute", "minutes"], value: 60 },
    { label: ["second", "seconds"], value: 1 },
  ];
  const result: string[] = [];
  for (const unit of units) {
    const quotient = Math.floor(uptime / unit.value);
    if (quotient > 0) {
      result.push(`${quotient} ${unit.label[quotient > 1 ? 1 : 0]}`);
      uptime %= unit.value;
    }
  }
  return result.join(" ");
}

export function ReadableExpireIn(expiresIn: string): string {
  const expiresInNumber = Number.parseInt(expiresIn, 10);
  const expirationTime = expiresInNumber
    ? new Date(Date.now() + expiresInNumber * 1000)
    : new Date();
  const diff = expirationTime.getTime() - Date.now();

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
  const minutes = Math.floor(diff / (1000 * 60)) % 60;

  return `${days > 0 ? `${days}d ` : ""}${hours > 0 ? `${hours}h ` : ""}${minutes > 0 ? `${minutes}m` : ""}`.trim();
}

export function formatIsoDuration(isoDuration: string | undefined): string | undefined {
  if (!isoDuration) return undefined;
  // 🛡️ Anchored regex prevents ReDoS on long attacker-crafted strings
  const matches = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!matches) return undefined;
  const h = matches[1] || "0";
  const m = matches[2] || "0";
  const s = matches[3] || "0";
  return h !== "0"
    ? `${h}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`
    : `${m}:${s.padStart(2, "0")}`;
}

export const getCurrentDate = () => formatDateString(new Date(), "yyyy-MM-dd");

export { formatDate, formatDateTime, formatTime, formatNumber, resolveLocale };
