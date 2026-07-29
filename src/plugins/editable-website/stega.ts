/**
 * @file src/plugins/editable-website/stega.ts
 * @description Steganography cleaning utilities for preview content.
 *
 * During visual editing / Live Preview mode, invisible zero-width Unicode
 * markers (steganography) are embedded in text content to enable
 * click-to-edit field identification. These markers MUST be stripped
 * before the content is parsed or rendered in production — they are
 * invisible but affect string equality, search indexing, and payload size.
 *
 * ### Features:
 * - strip zero-width stego markers from any string
 * - detect whether a string contains stego markers
 * - fast regex-based, zero-allocation where possible
 */

// ============================================================================
// Stego Marker Constants
// ============================================================================

/** Zero-width space (U+200B) — primary stego delimiter. */
const ZWSP = "\u200B";

/** Zero-width non-joiner (U+200C). */
const ZWNJ = "\u200C";

/** Zero-width joiner (U+200D). */
const ZWJ = "\u200D";

/** Byte order mark / zero-width no-break space (U+FEFF). */
const BOM = "\uFEFF";

/** Left-to-right mark (U+200E). */
const LRM = "\u200E";

/** Right-to-left mark (U+200F). */
const RLM = "\u200F";

// ============================================================================
// Compiled Regex (created once, reused)
// ============================================================================

// eslint-disable-next-line no-misleading-character-class -- each escape is a separate code point in the character class
const STEGA_PATTERN = /[\u200B\u200C\u200D\uFEFF]/g;
const STEGA_BIDI_PATTERN = /[\u200E\u200F]/g;
// eslint-disable-next-line no-misleading-character-class -- each escape is a separate code point in the character class
const HAS_STEGA_PATTERN = /[\u200B\u200C\u200D\uFEFF\u200E\u200F]/;

// ============================================================================
// Public API
// ============================================================================

/**
 * Strip all invisible steganography markers from a string.
 *
 * Removes zero-width spaces, joiners, non-joiners, BOM, and
 * bidirectional markers that are used as field-identification
 * delimiters during visual editing.
 *
 * @param text - The string to clean.
 * @returns The input string with all stego markers removed.
 *
 * @example
 *   stegaClean("Hello\u200B World") // → "Hello World"
 *   stegaClean("plain text")        // → "plain text"
 */
export function stegaClean(text: string): string {
  if (!text) return text;
  return text.replace(STEGA_PATTERN, "").replace(STEGA_BIDI_PATTERN, "");
}

/**
 * Check whether a string contains any steganography markers.
 *
 * Useful for conditional processing — skip the regex replacement
 * when the string is clean.
 *
 * @param text - The string to inspect.
 * @returns `true` if the string contains at least one stego marker.
 *
 * @example
 *   hasStegaMarkers("Hello\u200B World") // → true
 *   hasStegaMarkers("plain text")        // → false
 */
export function hasStegaMarkers(text: string): boolean {
  if (!text) return false;
  return HAS_STEGA_PATTERN.test(text);
}

/**
 * Clean an object's string values recursively.
 *
 * Traverses the object tree and runs `stegaClean` on every string
 * leaf. Arrays, nested objects, and primitive values are handled.
 * Non-string primitives pass through unchanged.
 *
 * @param value - Any value potentially containing stego-marked strings.
 * @returns A deep-cloned copy with all string values cleaned.
 *
 * @example
 *   stegaCleanDeep({ title: "Hello\u200B", tags: ["a\u200Bb"] })
 *   // → { title: "Hello", tags: ["ab"] }
 */
export function stegaCleanDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stegaClean(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stegaCleanDeep(item)) as unknown as T;
  }

  if (value !== null && typeof value === "object") {
    // Preserve the prototype chain so class instances (Date, custom
    // classes, etc.) retain their methods after cleaning. Plain `{}`
    // would discard the constructor and any inherited behaviour.
    const result = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = stegaCleanDeep((value as Record<string, unknown>)[key]);
    }
    return result as unknown as T;
  }

  return value;
}

export { ZWSP, ZWNJ, ZWJ, BOM, LRM, RLM };
