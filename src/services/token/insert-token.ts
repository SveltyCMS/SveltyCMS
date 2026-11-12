/**
 * @file src/services/token/insert-token.ts
 * @description Caret-aware token insertion shared by the token picker and the
 * field-level `onInsert` handlers.
 *
 * ### Features:
 * - Pure splice: appends when no selection is supplied, replaces the selection otherwise
 * - Never re-concatenates surrounding text (the source of the "staticstatic" duplicate)
 * - Returns the caret offset so callers can restore focus without re-reading the DOM
 */

/** Collapsed or expanded selection inside a text control. */
export interface TokenSelection {
  /** Selection start (UTF-16 offset); defaults to the end of the value. */
  start?: number | null;
  /** Selection end; defaults to `start`. */
  end?: number | null;
}

/** Result of an insertion — the next value plus where the caret should land. */
export interface TokenInsertion {
  value: string;
  caret: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Insert `token` into `value` at `selection` (or append when it is missing).
 *
 * A separating space is added only when the caret follows a non-whitespace
 * character, so appending to an empty field yields the bare token.
 */
export function insertTokenAtSelection(
  value: string,
  token: string,
  selection?: TokenSelection | null,
): TokenInsertion {
  const current = value ?? "";
  const start = clamp(selection?.start ?? current.length, 0, current.length);
  const end = clamp(selection?.end ?? start, start, current.length);
  const needsSpace = start > 0 && !/\s$/.test(current.slice(0, start)) && !/^\s/.test(token);
  const inserted = needsSpace ? ` ${token}` : token;

  return {
    value: current.slice(0, start) + inserted + current.slice(end),
    caret: start + inserted.length,
  };
}
