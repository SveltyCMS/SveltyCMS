/**
 * @file src/utils/format-uptime.ts
 * @description Pure formatter for process uptime values expressed in MILLISECONDS.
 *
 * `metricsService.getSystemMetrics()` reports `uptime` as `Date.now() - startTime`,
 * i.e. always milliseconds. The admin monitor used to guess the unit from the
 * magnitude (`raw > 10_000_000` ⇒ seconds), so a 29-minute process rendered as
 * "20d". There is no heuristic here: callers pass milliseconds and the unit never
 * depends on the value.
 *
 * Features:
 * - deterministic `1d 2h 3m` / `29m` / `< 1m` output (no locale, SSR-safe)
 * - `Just started` for zero, negative, or non-finite input
 * - whole-second floor, matching the previous monitor output style
 */

/** Rendered when no measurable uptime exists (fresh boot, degraded metrics). */
const JUST_STARTED = "Just started";

/** Rendered when the process has been up for less than a full minute. */
const UNDER_A_MINUTE = "< 1m";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Formats a millisecond uptime as a compact human duration.
 *
 * @param ms Uptime in milliseconds (e.g. `Date.now() - startTime`).
 * @returns `Just started` for non-positive/non-finite input, `< 1m` below one
 *          minute, otherwise the non-zero day/hour/minute parts joined by spaces.
 *
 * @example
 * formatUptimeMs(1_784_889); // "29m"
 * formatUptimeMs(90_061_000); // "1d 1h 1m"
 */
export function formatUptimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return JUST_STARTED;

  const wholeMs = Math.floor(ms);
  const days = Math.floor(wholeMs / MS_PER_DAY);
  const hours = Math.floor((wholeMs % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((wholeMs % MS_PER_HOUR) / MS_PER_MINUTE);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : UNDER_A_MINUTE;
}
