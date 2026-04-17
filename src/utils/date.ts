/**
 * @file src/utils/date.ts
 * @description Date and time formatting utilities.
 */

import { app } from "@src/stores/store.svelte";

/**
 * Converts a Unix timestamp to a readable date string based on the current locale.
 */
export function convertTimestampToDateString(timestamp: number) {
  if (timestamp === null || timestamp === undefined) {
    return "-";
  }

  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const locale = app.contentLanguage;
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(locale, options);
}

/**
 * Formats uptime in seconds to a human-readable string.
 */
export function formatUptime(uptime: number) {
  const units = [
    { label: ["year", "years"], value: 365 * 24 * 60 * 60 },
    { label: ["month", "months"], value: 30 * 24 * 60 * 60 },
    { label: ["week", "weeks"], value: 7 * 24 * 60 * 60 },
    { label: ["day", "days"], value: 24 * 60 * 60 },
    { label: ["hour", "hours"], value: 60 * 60 },
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

/**
 * Converts a relative expiration time string (in seconds) to a human-readable duration.
 */
export function ReadableExpireIn(expiresIn: string) {
  const expiresInNumber = Number.parseInt(expiresIn, 10);
  const expirationTime = expiresInNumber
    ? new Date(Date.now() + expiresInNumber * 1000)
    : new Date();

  const daysDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const hoursDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60 * 60)) % 24;
  const minutesDiff = Math.floor((expirationTime.getTime() - Date.now()) / (1000 * 60)) % 60;

  const daysText = daysDiff > 0 ? `${daysDiff} day${daysDiff > 1 ? "s" : ""}` : "";
  const hoursText = hoursDiff > 0 ? `${hoursDiff} hour${hoursDiff > 1 ? "s" : ""}` : "";
  const minutesText = minutesDiff > 0 ? `${minutesDiff} minute${minutesDiff > 1 ? "s" : ""}` : "";

  return `${daysText} ${hoursText} ${minutesText}`.trim();
}

/**
 * Gets the current date in YYYY-MM-DD format.
 */
export function getCurrentDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
