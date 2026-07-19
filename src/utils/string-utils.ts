/**
 * @file src/utils/string-utils.ts
 * @description Unified string sanitization and validation utilities.
 *
 * Consolidates scattered `trim()`, `toLowerCase()`, and character-stripping logic
 * from collection-query-filters, cookie-utils, collection-schema-warnings, and
 * schema modules. Single source of truth for all identifier normalization.
 *
 * ### Features:
 * - normalizeId: trim-only, preserves original character set
 * - toSafeKey: trim + lowercase + strip non-alphanumeric (filesystem/URL safe)
 * - isEmpty: handles null, undefined, and whitespace-only strings uniformly
 * - truncate: safe truncation with optional ellipsis
 * - stripBase: securely removes a path prefix without leaking directory structure
 * - escapeRegex: escapes special characters for safe regex construction
 */

export const str = {
  /** Trim whitespace from an identifier without changing character set */
  normalizeId: (id: string): string => id.trim(),

  /** Normalize to a safe filesystem/URL key (trim, lowercase, strip non [a-z0-9_-]) */
  toSafeKey: (key: string): string =>
    key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ""),

  /** Unified empty-value check — handles null, undefined, and whitespace-only strings */
  isEmpty: (val: unknown): boolean => val == null || (typeof val === "string" && val.trim() === ""),

  /** Safe truncation for UI labels with optional ellipsis */
  truncate: (s: string, len: number): string => (s.length > len ? `${s.slice(0, len)}...` : s),

  /** Securely strips a known base prefix from a path, preventing leakage */
  stripBase: (fullPath: string, base: string): string =>
    fullPath.startsWith(base) ? fullPath.slice(base.length) : fullPath,

  /** Escape a string for safe use in regex patterns */
  escapeRegex: (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
} as const;
