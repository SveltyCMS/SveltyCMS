/**
 * @file src/utils/array-utils.ts
 * @description Array manipulation utilities.
 */

/**
 * Deduplicates an array of objects by a specified key.
 * Last-write-wins for duplicate keys.
 */
export function uniqueItems<T extends Record<string, unknown>>(items: T[], key: string): T[] {
  const uniqueMap = new Map(items.map((item) => [item[key], item]));
  return Array.from(uniqueMap.values());
}
