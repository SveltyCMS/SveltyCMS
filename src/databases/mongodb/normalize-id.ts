/**
 * @file src/databases/mongodb/methods/normalizeId.ts
 * @description Shared helper for safely normalizing identifier-like values into strings.
 *
 * Optimized check order prioritizes most common cases (string, ObjectId) first.
 */

import type { Types } from "mongoose";

/**
 * Type guard for Mongoose ObjectId.
 * Checks both instanceof and duck-typing for maximum compatibility.
 */
function isObjectId(value: unknown): value is Types.ObjectId {
  if (!value || typeof value !== "object") {
    return false;
  }
  // Check for Mongoose's _bsontype property and toHexString method
  if ((value as any)._bsontype === "ObjectId" && typeof (value as any).toHexString === "function") {
    // Perform a regex check on the hex string representation for the 24-char hex format
    const hexString = (value as Types.ObjectId).toHexString();
    return hexString.length === 24 && /^[0-9a-fA-F]{24}$/.test(hexString);
  }
  return false;
}

/**
 * Safely normalizes various ID formats into strings.
 * Handles: string, ObjectId, number, object with _id/id properties, etc.
 *
 * @param id - The value to normalize
 * @param depth - Internal recursion depth tracking
 * @returns A string representation or null if normalization fails
 */
export function normalizeId(id: unknown, depth = 0): string | null {
  // Prevent stack overflow from circular references or deep nesting
  if (depth > 2) {
    return null;
  }

  // Fast path: null/undefined
  if (id === null || id === undefined) {
    return null;
  }

  // Fast path: string (most common case after database reads)
  if (typeof id === "string") {
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  // Fast path: Mongoose ObjectId (extremely common in MongoDB operations)
  if (isObjectId(id)) {
    return (id as Types.ObjectId).toHexString();
  }

  // Handle numbers/bigints that can be safely stringified
  // Note: Booleans are REJECTED as they are never valid IDs and common sources of bugs
  if (typeof id === "number" || typeof id === "bigint") {
    return String(id);
  }

  // Handle objects with nested ID properties
  if (typeof id === "object" && id !== null) {
    const candidate = id as Record<string, unknown> & {
      valueOf?: () => unknown;
      toString?: () => string;
    };

    // Check for _id property (primary MongoDB identifier)
    if (candidate._id !== undefined && candidate._id !== id) {
      const nested = normalizeId(candidate._id, depth + 1);
      if (nested) return nested;
    }

    // Check for id property (common in API responses/virtual IDs)
    if (candidate.id !== undefined && candidate.id !== id) {
      const nested = normalizeId(candidate.id, depth + 1);
      if (nested) return nested;
    }

    // Try valueOf() for wrapped primitives (e.g. new Number(123))
    if (typeof candidate.valueOf === "function") {
      const val = candidate.valueOf();
      if (val !== null && val !== undefined && val !== id) {
        const nested = normalizeId(val, depth + 1);
        if (nested) return nested;
      }
    }

    // Last resort: toString() (but avoid [object Object])
    if (typeof candidate.toString === "function") {
      const asString = candidate.toString();
      if (asString && asString !== "[object Object]" && asString.trim().length > 0) {
        return asString;
      }
    }
  }

  // If we reach here, normalization failed.
  // We explicitly DO NOT fallback to String(id) which produces "[object Object]"
  // or garbage strings that cause silent secondary failures in DB queries.
  return null;
}
