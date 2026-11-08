/**
 * @file src/utils/file.ts
 * @description File and media operation utilities.
 *
 * ### Features:
 * - Human-readable file size formatting (O(1) math, trailing-zero stripping)
 */

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * Uses O(1) Math.log calculation instead of a while-loop.
 * Strips trailing zeros (e.g., "1.00 MB" → "1 MB") via `parseFloat`.
 * Raw bytes are always rendered as whole numbers (no decimals).
 *
 * @param bytes   - The file size in bytes.
 * @param decimals - Number of decimal places for non-byte units (default: 2).
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0 || Number.isNaN(bytes)) return "0 Bytes";
  if (bytes < 0) throw new Error("Input size cannot be negative");

  const k = 1024;
  const units = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = i === 0 ? bytes : parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));

  return `${value} ${units[i]}`;
}
