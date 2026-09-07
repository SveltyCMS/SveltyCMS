/**
 * @file src/utils/locale-map.ts
 * @description Unwrap `{ en: … }` locale maps, including accidental double-wraps.
 *
 * Features:
 * - Detects BCP 47-ish locale keys (`en`, `de`, `en-US`)
 * - Walks nested maps up to a small depth
 * - Optional stop predicate so structured payloads (SEO, rich text) stay intact
 */

/** BCP 47 language tags used as object keys (`en`, `ar`, `en-US`). */
export const LOCALE_KEY = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;

export function isLocaleKey(key: string): boolean {
  return LOCALE_KEY.test(key);
}

export function isLocaleMap(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 && keys.every((key) => isLocaleKey(key));
}

export interface UnwrapLocaleLayersOptions {
  maxDepth?: number;
  /** Return immediately when this is true (e.g. an SEO payload). */
  stop?: (current: unknown) => boolean;
}

/**
 * Peel `{ en: value }` layers until a non-map (or `stop`) is reached.
 * Prefers `lang`, then the first remaining value. Empty-string lang hits are skipped.
 */
export function unwrapLocaleLayers(
  value: unknown,
  lang: string,
  options: UnwrapLocaleLayersOptions = {},
): unknown {
  const maxDepth = options.maxDepth ?? 4;
  let current: unknown = value;

  for (let i = 0; i < maxDepth; i++) {
    if (options.stop?.(current)) return current;
    if (!isLocaleMap(current)) return current;

    const langVal = current[lang];
    if (langVal !== undefined && langVal !== null && langVal !== "") {
      current = langVal;
      continue;
    }
    const values = Object.values(current);
    current =
      values.find((item) => item !== undefined && item !== null && item !== "") ?? values[0];
  }

  return current;
}
