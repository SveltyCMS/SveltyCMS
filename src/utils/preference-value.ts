/**
 * @file src/utils/preference-value.ts
 * @description Preference value codec shared by the SQL preference adapter and config sync.
 *
 * SQL adapters persist preference primitives as text (`String(value)`), so the
 * raw `system_preferences` row and the decoded `system.preferences` read return
 * different types for the same value (`"600"` vs `600`). Any consumer that
 * compares or hashes both paths must apply the same rule.
 *
 * ### Features:
 * - conservative JSON detection (objects, arrays, quoted strings, literals, numbers)
 * - at most two decode passes, so double-encoded legacy rows still surface as data
 */

const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;

/** Whether a string looks like a JSON-encoded value worth parsing. */
function looksJsonEncoded(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith('"') ||
    trimmed === "null" ||
    trimmed === "true" ||
    trimmed === "false" ||
    NUMERIC_LITERAL.test(trimmed)
  );
}

/** Decodes a stored preference value (no-op for already-typed values). */
export function decodePreferenceValue<T>(value: unknown): T {
  let current = value;

  for (let depth = 0; depth < 2; depth++) {
    if (typeof current !== "string" || !looksJsonEncoded(current)) {
      break;
    }

    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
  }

  return current as T;
}
