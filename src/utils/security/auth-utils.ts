/**
 * @file src/utils/auth-utils.ts
 * @description Shared authentication and session management utilities.
 *
 * ### Features:
 * - Flexible session duration parsing (`ms|s|m|h|d|w` units)
 * - Safe fallback to 1 day for invalid/missing input
 */

const SESSION_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DEFAULT_SESSION_MS = 86_400_000; // 1 day

/**
 * Parses a session duration string into milliseconds.
 *
 * Accepts any `<number><unit>` format where unit is one of:
 * `ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks).
 *
 * @example
 * parseSessionDuration("1h")  // 3_600_000
 * parseSessionDuration("7d")  // 604_800_000
 * parseSessionDuration("30m") // 1_800_000
 * parseSessionDuration("")    // 86_400_000 (default 1d)
 *
 * @param duration - e.g. "1h", "7d", "30m", "2w"
 * @returns Duration in milliseconds. Defaults to 1 day if invalid.
 */
export function parseSessionDuration(duration: string): number {
  if (!duration) return DEFAULT_SESSION_MS;
  const match = duration.trim().match(/^(\d+)(ms|s|m|h|d|w)$/);
  if (!match) return DEFAULT_SESSION_MS;
  const [, amount, unit] = match;
  return parseInt(amount, 10) * (SESSION_UNIT_MS[unit] ?? SESSION_UNIT_MS.d);
}
