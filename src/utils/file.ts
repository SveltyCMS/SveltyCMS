/**
 * @file src/utils/file.ts
 * @description File and media operation utilities.
 *
 * ### Features:
 * - Safe filename sanitization (preserves dots, hyphens, trims whitespace)
 * - Human-readable file size formatting (O(1) math, trailing-zero stripping)
 * - Extension removal that respects hidden files and directory paths
 */

/**
 * Sanitizes a string for use as a safe filename.
 * Preserves alphanumeric characters, underscores, hyphens, and dots.
 * Leading/trailing whitespace is trimmed to avoid unnecessary underscores.
 */
export function sanitize(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "");
}

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

/**
 * Removes the extension from a filename.
 *
 * Leaves hidden files (`.env`, `.gitignore`) and dot-directories intact:
 * - `"my document.txt"`  → `"my document"`
 * - `".env"`            → `".env"`        (hidden file, no extension to strip)
 * - `"path/to/.env"`    → `"path/to/.env"` (same)
 * - `"dir.name/file"`   → `"dir.name/file"` (dot in directory, not filename)
 */
export function removeExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  const lastSlashIndex = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));

  if (lastDotIndex <= 0 || lastDotIndex === lastSlashIndex + 1 || lastDotIndex < lastSlashIndex) {
    return fileName;
  }

  return fileName.substring(0, lastDotIndex);
}
