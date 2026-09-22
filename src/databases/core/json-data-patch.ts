/**
 * @file src/databases/core/json-data-patch.ts
 * @description
 * Partial-update plumbing for the JSON `data` blob shared by every SQL adapter.
 *
 * A PATCH must not destroy the fields it does not mention. MongoDB gets that for
 * free (`$set` merges per field); the SQL adapters build one whole-column
 * assignment for the `data` blob, which made a partial patch replace every other
 * dynamic field (measured externally: 30,940 of 100,000 documents collapsed from
 * ~1.5 KB to 61-byte stubs).
 *
 * The prepared values therefore carry their patch in a `WeakMap` — invisible to
 * `Object.keys`, spreads and Drizzle's `.set()` — and each dialect's SQL builder
 * turns it into a merge expression. This module is a leaf (no adapter imports) so
 * both `sql-adapter-core` and `batch-module` can use it without a cycle.
 *
 * ### Features:
 * - patch marker: set / get / clear, keyed by the prepared-values object
 * - `jsonPatchNeedsJsMerge`: exactness boundary for the dialect operators
 * - `parseJsonDataBlob`: TEXT vs decoded object vs double-encoded payloads
 */

const jsonDataPatches = new WeakMap<object, Record<string, unknown>>();

/** Mark prepared values as a partial-update patch of the JSON `data` column. */
export function setJsonDataPatch(values: object, patch: Record<string, unknown>): void {
  jsonDataPatches.set(values, patch);
}

/** The patch to merge into `data`, or `undefined` when this is a full-document write. */
export function getJsonDataPatch(values: object): Record<string, unknown> | undefined {
  return jsonDataPatches.get(values);
}

/** Drop the marker — the caller has already produced a complete blob. */
export function clearJsonDataPatch(values: object): void {
  jsonDataPatches.delete(values);
}

/**
 * Does this patch contain values that `json_patch` / `JSON_MERGE_PATCH` express
 * differently from a shallow merge? RFC 7396 merges objects recursively and
 * removes keys patched with `null`; the contract here (MongoDB `$set` parity) is a
 * shallow merge that keeps explicit nulls. Everything else — strings, numbers,
 * booleans, dates, arrays — is replaced identically by both, so those patches can
 * use the SQL operator at zero cost.
 */
export function jsonPatchNeedsJsMerge(patch: Record<string, unknown>): boolean {
  for (const key in patch) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = patch[key];
    if (value === null) return true;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Uint8Array)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a stored JSON `data` column into a plain object. SQLite hands JSON back as
 * TEXT; MariaDB returns TEXT or an already-decoded object depending on the column
 * type, and can double-encode (see `mariaDoubleParseJson`). NULL, empty, malformed,
 * or non-object payloads return `null`, which callers treat as fail-closed.
 */
export function parseJsonDataBlob(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  let value: unknown = raw;
  for (let pass = 0; pass < 2; pass++) {
    if (typeof value !== "string") break;
    if (value === "") return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
