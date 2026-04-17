/**
 * @file src/utils/file.ts
 * @description File and media operation utilities.
 */

/**
 * Sanitizes a string for use as a safe filename.
 */
export function sanitize(str: string) {
  return str.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0 || Number.isNaN(bytes)) {
    return "0 bytes";
  }

  if (bytes < 0) {
    throw new Error("Input size cannot be negative");
  }

  const units = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB"];
  let power = 0;

  while (bytes >= 1024 && power < units.length - 1) {
    bytes /= 1024;
    power++;
  }

  return `${bytes.toFixed(2)} ${units[power]}`;
}

/**
 * Removes the extension from a filename.
 */
export function removeExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}
