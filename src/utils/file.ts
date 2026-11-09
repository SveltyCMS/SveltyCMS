/**
 * @file src/utils/file.ts
 * @description File and media operation utilities.
 *
 * ### Features:
 * - Canonical human-readable file size formatting (O(1) math, trailing-zero
 *   stripping, never throws)
 */

/** Options for {@link formatBytes}. */
export interface FormatBytesOptions {
  /** Decimal places for non-byte units (default: 2). */
  decimals?: number;
  /** Label returned for zero, negative, or non-finite input (default: "0 Bytes"). */
  zeroLabel?: string;
}

const BYTE_UNITS = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB"] as const;

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * Uses O(1) `Math.log` instead of a while-loop, strips trailing zeros
 * (e.g., "1.00 MB" → "1 MB") via `parseFloat`, and renders raw bytes as a
 * whole number.
 *
 * Never throws: negative and non-finite values are clamped to zero, and the
 * unit index is clamped so huge inputs cannot fall off the unit ladder.
 *
 * @param bytes - The file size in bytes.
 * @param opts  - `{ decimals, zeroLabel }`, or a number for legacy callers
 *                (treated as `decimals`).
 */
export function formatBytes(bytes: number, opts?: FormatBytesOptions | number): string {
  const options: FormatBytesOptions = typeof opts === "number" ? { decimals: opts } : (opts ?? {});
  const zeroLabel = options.zeroLabel ?? "0 Bytes";
  // Clamp to `toFixed`'s valid range so a bad caller value can never throw.
  const decimals = Math.min(Math.max(Math.trunc(options.decimals ?? 2), 0), 20);

  if (!Number.isFinite(bytes) || bytes <= 0) return zeroLabel;

  const k = 1024;
  const rawIndex = Math.floor(Math.log(bytes) / Math.log(k));
  const i = Math.min(Math.max(rawIndex, 0), BYTE_UNITS.length - 1);
  const value = i === 0 ? bytes : parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

  return `${value} ${BYTE_UNITS[i]}`;
}
