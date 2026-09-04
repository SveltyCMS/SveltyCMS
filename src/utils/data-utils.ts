/**
 * @file src/utils/data-utils.ts
 * @description Unified data structure manipulation utilities (arrays, objects, cloning, deduplication).
 *
 * ### Features:
 * - uniqueItems: Deduplicates an array of objects by key (last-write-wins)
 * - deepCopy: Structured clone with fallback for non-serializable objects
 */

/**
 * Deduplicates an array of objects by a specified key.
 * Last-write-wins for duplicate keys.
 */
export function uniqueItems<T extends Record<string, unknown>>(items: T[], key: string): T[] {
  const uniqueMap = new Map(items.map((item) => [item[key], item]));
  return Array.from(uniqueMap.values());
}

/**
 * Deep-clones a value using `structuredClone` when available,
 * with a manual recursive fallback for non-serializable objects (Functions, DOM nodes).
 */
export function deepCopy<T>(obj: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch {
      // Fallback for objects that cannot be cloned via structuredClone
    }
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item)) as unknown as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  const copy = {} as T;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  return copy;
}

/** Known internal ID field names used by array/repeater widgets */
const ROW_ID_FIELDS = new Set(["_dndId", "_rowId", "uuid", "key"]);

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
        obj[key] = crypto.randomUUID();
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
