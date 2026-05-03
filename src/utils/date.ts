/**
 * @file src/utils/date.ts
 * @description Unified date and time utility system for SveltyCMS.
 * 
 * Consolidates:
 * - ISO conversion and validation (isISODateString, toISOString)
 * - Display formatting (Intl.DateTimeFormat, Intl.RelativeTimeFormat)
 * - Uptime and expiration calculators
 * - ISO duration parsing
 */

import { logger } from "./logger";
import { app } from "@src/stores/store.svelte";
import type { ISODateString } from "../content/types";

// --- ISO Date Utilities (Merged from date-utils.ts) ---

/**
 * Type guard for ISODateString.
 */
export function isISODateString(value: unknown): value is ISODateString {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

// Backward compatibility wrappers
export const nowISODateString = (): ISODateString => dateToISODateString(new Date());

export function stringToISODateString(value: string): ISODateString {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date string");
  return date.toISOString() as ISODateString;
}

export function isoDateStringToDate(isoString: ISODateString): Date {
  return new Date(isoString);
}


/**
 * Convert Date to ISODateString with validation.
 */
export function dateToISODateString(date: Date): ISODateString {
  return date.toISOString() as ISODateString;
}

/**
 * Safe conversion of unknown value to ISODateString.
 * Handles Date objects, timestamps, and ISO strings from various databases.
 */
export function toISOString(value: unknown): ISODateString {
  if (value && typeof value === "object" && "toISOString" in value && typeof (value as any).toISOString === "function") {
    const date = value as any;
    if (!Number.isNaN(date.getTime?.() ?? NaN)) return date.toISOString() as ISODateString;
  }
  if (typeof value === "string" && isISODateString(value)) return value;
  if (value && (typeof value === "string" || typeof value === "number")) {
    try {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString() as ISODateString;
    } catch {
      logger.warn("Failed to convert value to ISODateString, using current date", { value });
    }
  }
  return new Date().toISOString() as ISODateString;
}

/**
 * Normalizes date input (Date, timestamp, or string) to ISODateString.
 */
export function normalizeDateInput(dateInput: Date | ISODateString | number | string): ISODateString {
  if (!dateInput) return dateToISODateString(new Date());
  if (dateInput instanceof Date) return dateToISODateString(dateInput);
  if (typeof dateInput === "number") {
    return dateToISODateString(new Date(dateInput < 1e12 ? dateInput * 1000 : dateInput));
  }
  if (typeof dateInput === "string") {
    const num = Number(dateInput);
    if (!Number.isNaN(num)) return dateToISODateString(new Date(num < 1e12 ? num * 1000 : num));
    return dateToISODateString(new Date(dateInput));
  }
  return dateToISODateString(new Date());
}

// --- Display Formatting (Merged from date.ts & date-utils.ts) ---

/**
 * Standard date formatting with pattern replacement (e.g. "yyyy-MM-dd").
 */
export function formatDateString(dateInput: Date | number | string, pattern = "yyyy-MM-dd", fallback = ""): string {
  try {
    const date = new Date(typeof dateInput === "number" ? (dateInput > 1e12 ? dateInput : dateInput * 1000) : dateInput);
    if (Number.isNaN(date.getTime())) return fallback;

    const yyyy = date.getFullYear().toString();
    const MM = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const HH = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");

    return pattern.replace("yyyy", yyyy).replace("MM", MM).replace("dd", dd).replace("HH", HH).replace("mm", mm).replace("ss", ss);
  } catch {
    return fallback;
  }
}

/**
 * Format date for localized display.
 */
export function formatDisplayDate(
  dateInput: Date | number | string,
  locale = app.contentLanguage || "en",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
): string {
  try {
    const date = new Date(typeof dateInput === "number" ? (dateInput > 1e12 ? dateInput : dateInput * 1000) : dateInput);
    if (Number.isNaN(date.getTime())) return "Invalid Date";
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return "Invalid Date";
  }
}

export const formatDate = formatDisplayDate;

/**
 * Relative date formatting (e.g. "2 hours ago").
 */
export function formatRelativeDate(dateInput: Date | number | string, locale = app.contentLanguage || "en"): string {
  try {
    const date = new Date(typeof dateInput === "number" ? (dateInput > 1e12 ? dateInput : dateInput * 1000) : dateInput);
    if (Number.isNaN(date.getTime())) return "Invalid Date";

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
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
  const expirationTime = expiresInNumber ? new Date(Date.now() + expiresInNumber * 1000) : new Date();
  const diff = expirationTime.getTime() - Date.now();

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
  const minutes = Math.floor(diff / (1000 * 60)) % 60;

  return `${days > 0 ? `${days}d ` : ""}${hours > 0 ? `${hours}h ` : ""}${minutes > 0 ? `${minutes}m` : ""}`.trim();
}

export function formatIsoDuration(isoDuration: string | undefined): string | undefined {
  if (!isoDuration) return undefined;
  const matches = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return undefined;
  const h = matches[1] || "0";
  const m = matches[2] || "0";
  const s = matches[3] || "0";
  return (h !== "0" ? [h, m.padStart(2, "0"), s.padStart(2, "0")] : [m, s.padStart(2, "0")]).join(":");
}

export const getCurrentDate = () => formatDateString(new Date(), "yyyy-MM-dd");
