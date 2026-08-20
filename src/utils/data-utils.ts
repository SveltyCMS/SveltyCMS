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
