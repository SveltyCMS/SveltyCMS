/**
 * @file src/databases/mongodb/methods/normalizeId.ts
 * @description Shared helper for safely normalizing identifier-like values into strings.
 *
 * Optimized check order prioritizes most common cases (string, ObjectId) first.
 */

import type { Types } from 'mongoose';

/**
 * Type guard for Mongoose ObjectId.
 * Checks both instanceof and duck-typing for maximum compatibility.
 */
function isObjectId(value: unknown): value is Types.ObjectId {
	if (!value || typeof value !== 'object') {
		return false;
	}
	// Check for toHexString method (most reliable for ObjectId)
	return typeof (value as any).toHexString === 'function';
}

/**
 * Safely normalizes various ID formats into strings.
 * Handles: string, ObjectId, number, object with _id/id properties, etc.
 *
 * @param id - The value to normalize
 * @returns A string representation or null if normalization fails
 */
export function normalizeId(id: unknown): string | null {
	// Fast path: null/undefined
	if (id === null || id === undefined) {
		return null;
	}

	// Fast path: string (most common case after database reads)
	if (typeof id === 'string') {
		return id;
	}

	// Fast path: Mongoose ObjectId (extremely common in MongoDB operations)
	// Check this BEFORE object property traversal
	if (isObjectId(id)) {
		return (id as Types.ObjectId).toHexString();
	}

	// Handle primitive types that can be safely stringified
	if (typeof id === 'number' || typeof id === 'bigint' || typeof id === 'boolean') {
		return String(id);
	}

	// Handle objects with nested ID properties
	if (typeof id === 'object') {
		const candidate = id as Record<string, unknown> & {
			valueOf?: () => unknown;
			toString?: () => string;
		};

		// Check for _id property (common in MongoDB documents)
		if (candidate._id !== undefined) {
			const nested = normalizeId(candidate._id);
			if (nested) {
				return nested;
			}
		}

		// Check for id property (common in API responses)
		if (candidate.id !== undefined) {
			const nested = normalizeId(candidate.id);
			if (nested) {
				return nested;
			}
		}

		// Try valueOf() for wrapped primitives
		if (typeof candidate.valueOf === 'function') {
			const value = candidate.valueOf();
			if (value && value !== id) {
				const nested = normalizeId(value);
				if (nested) {
					return nested;
				}
			}
		}

		// Last resort: toString() (but avoid [object Object])
		if (typeof candidate.toString === 'function') {
			const asString = candidate.toString();
			if (asString && asString !== '[object Object]') {
				return asString;
			}
		}
	}

	// Final fallback
	const fallback = String(id);
	return fallback === '[object Object]' ? null : fallback;
}
