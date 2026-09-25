/**
 * @file src/utils/diff-utils.ts
 * @description Utilities for computing smart differences between content revisions.
 */

import type { FieldInstance } from "@src/content/types";

export interface DiffEntry {
  fieldName: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  type: "added" | "modified" | "removed" | "unchanged";
}

/**
 * Computes the difference between two data objects at the field level.
 * Uses fields array for human-readable labels and consistent ordering.
 */
export function computeFieldDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fields?: FieldInstance[],
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  // Create maps for quick lookup and field ordering without intermediate array allocations
  const fieldMap = new Map<string, FieldInstance>();
  const orderMap = fields ? new Map<string, number>() : null;
  const allKeys = new Set<string>();

  if (fields) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      fieldMap.set(f.db_fieldName, f);
      orderMap!.set(f.db_fieldName, i);
      if (!f.db_fieldName.startsWith("_") || f.db_fieldName === "_id") {
        allKeys.add(f.db_fieldName);
      }
    }
  }

  if (oldData) {
    for (const key in oldData) {
      if (!key.startsWith("_") || key === "_id") {
        allKeys.add(key);
      }
    }
  }

  if (newData) {
    for (const key in newData) {
      if (!key.startsWith("_") || key === "_id") {
        allKeys.add(key);
      }
    }
  }

  const keysToCompare = Array.from(allKeys);
  if (orderMap) {
    keysToCompare.sort((a, b) => {
      const orderA = orderMap.get(a) ?? 999;
      const orderB = orderMap.get(b) ?? 999;
      return orderA - orderB;
    });
  }

  for (const key of keysToCompare) {
    const field = fieldMap.get(key);
    const label = field?.label || key;
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];

    if (oldVal === undefined && newVal !== undefined) {
      diffs.push({
        fieldName: key,
        label,
        oldValue: null,
        newValue: newVal,
        type: "added",
      });
    } else if (oldVal !== undefined && newVal === undefined) {
      diffs.push({
        fieldName: key,
        label,
        oldValue: oldVal,
        newValue: null,
        type: "removed",
      });
    } else if (!isEqual(oldVal, newVal)) {
      diffs.push({
        fieldName: key,
        label,
        oldValue: oldVal,
        newValue: newVal,
        type: "modified",
      });
    } else {
      diffs.push({
        fieldName: key,
        label,
        oldValue: oldVal,
        newValue: newVal,
        type: "unchanged",
      });
    }
  }

  return diffs;
}

/**
 * Deep equality check for objects and arrays with circular reference protection.
 */
function isEqual(a: unknown, b: unknown, visited = new WeakSet<object>()): boolean {
  if (a === b) return true;

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    // Circular reference protection
    if (visited.has(a as object)) return true;
    visited.add(a as object);

    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!isEqual(a[i], b[i], visited)) return false;
      }
      return true;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (
        !Object.prototype.hasOwnProperty.call(objB, key) ||
        !isEqual(objA[key], objB[key], visited)
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
}
