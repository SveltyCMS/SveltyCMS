/**
 * @file src/utils/object-utils.ts
 * @description Object manipulation utilities — deep copy, merge, equality.
 */

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
