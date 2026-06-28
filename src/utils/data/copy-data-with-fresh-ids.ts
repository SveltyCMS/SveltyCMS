/**
 * @file src/utils/data/copy-data-with-fresh-ids.ts
 * @description Regenerates internal row/block IDs in array and repeater data to prevent
 * key conflicts during bulk updates, DnD reorder, and duplication operations.
 *
 * ### Features:
 * - regenerates _dndId for array/block rows
 * - recursively walks nested structures (repeaters inside repeaters)
 * - preserves data shape and values
 */

/** Known internal ID field names used by array/repeater widgets */
const ROW_ID_FIELDS = new Set(["_dndId", "_rowId", "uuid", "key"]);

/**
 * Generate a secure UUID using Web Crypto API (available globally in Node/Bun/edge).
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Recursively regenerates internal row IDs in array/repeater data.
 * Assigns new UUIDs to each element's row identifier while preserving all other data.
 */
export function copyDataWithFreshRowIds(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => copyDataWithFreshRowIds(item));
  }

  if (data && typeof data === "object") {
    const obj = { ...data } as Record<string, unknown>;

    // Regenerate row IDs for this object
    for (const key of ROW_ID_FIELDS) {
      if (key in obj) {
        obj[key] = generateUUID();
      }
    }

    // Recurse into all properties
    for (const [key, value] of Object.entries(obj)) {
      if (
        Array.isArray(value) ||
        (value && typeof value === "object" && !(value instanceof Date))
      ) {
        obj[key] = copyDataWithFreshRowIds(value);
      }
    }

    return obj;
  }

  return data;
}
