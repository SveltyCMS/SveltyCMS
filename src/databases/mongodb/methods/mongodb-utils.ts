/**
 * @file src/databases/mongodb/methods/mongodb-utils.ts
 * @description A comprehensive suite of shared utility functions for the MongoDB adapter.
 * This module provides robust, performant, and type-safe helpers for error handling,
 * data processing, performance monitoring, and intelligent caching.
 */

import type { DatabaseId } from '@src/content/types';
import { logger } from '@src/utils/logger.server';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseError, PaginatedResult, PaginationOptions } from '../../db-interface';

// Pre-compiled regex for UUIDv4 validation (with or without dashes) for performance.
const ID_VALIDATION_REGEX = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

// ===================================================================================
// Error Handling
// ===================================================================================

/**
 * Creates a structured DatabaseError with consistent, detailed logging.
 * @param error The original error caught.
 * @param code A unique code for the error type (e.g., 'FETCH_FAILED').
 * @param message A human-readable message describing the error.
 * @returns A standardized DatabaseError object.
 */
export function createDatabaseError(error: unknown, code: string, message: string): DatabaseError {
	const details = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;

	// Log with structured context for better diagnostics.
	logger.error(`[${code}] ${message}`, { details, stack });

	return { code, message, details, stack };
}

// ===================================================================================
// ID & Naming Conventions
// ===================================================================================

/**
 * Generates a compact, dash-less UUID, ideal for database identifiers.
 */
export function generateId(): DatabaseId {
	return uuidv4().replace(/-/g, '') as DatabaseId;
}

/**
 * Validates if a string is a UUIDv4 (with or without dashes).
 */
export function validateId(id: string): boolean {
	return ID_VALIDATION_REGEX.test(id);
}

/**
 * Normalizes collection names according to the CMS's conventions.
 * - `media_` and `auth_` prefixes are preserved.
 * - All other names are prefixed with `collection_` unless already present.
 */
export function normalizeCollectionName(collection: string): string {
	if (collection.startsWith('media_') || collection.startsWith('auth_') || collection.startsWith('system_')) {
		return collection;
	}
	return collection.startsWith('collection_') ? collection : `collection_${collection}`;
}

// ===================================================================================
// Data Processing & Transformation
// ===================================================================================

/**
 * Checks if a value is a Date-like object (i.e., has a .toISOString method).
 */
export function isDateLike(val: unknown): val is { toISOString: () => string } {
	// Using `!!val` handles null/undefined, and checking for the function is more robust
	// than `instanceof Date` as it supports date-like objects from other libraries.
	// We also ensure val is an object to avoid runtime errors on primitives.
	return !!val && typeof val === 'object' && typeof (val as any).toISOString === 'function';
}

/**
 * Recursively traverses an object or array and converts all Date-like values into ISO 8601 strings.
 * This is essential for ensuring consistent date serialization to and from the database.
 * @param data The data structure (object, array, primitive) to process.
 * @returns A deep copy of the data with all dates converted to strings.
 */
function isObjectIdLike(val: unknown): val is { toHexString: () => string } {
	if (!val || typeof val !== 'object') {
		return false;
	}

	const candidate = val as { toHexString?: unknown; _bsontype?: unknown };
	const hasToHexString = typeof candidate.toHexString === 'function';
	const bsonType = typeof candidate._bsontype === 'string' ? candidate._bsontype : undefined;

	return hasToHexString && (!bsonType || bsonType === 'ObjectId' || bsonType === 'ObjectID');
}

export function processDates<T>(data: T): T {
	if (!data) {
		return data;
	}

	if (isDateLike(data)) {
		return data.toISOString() as unknown as T;
	}

	if (isObjectIdLike(data)) {
		return data.toHexString() as unknown as T;
	}

	if (Array.isArray(data)) {
		return data.map(processDates) as unknown as T;
	}

	if (typeof data === 'object') {
		const result: Record<string, unknown> = {};
		for (const key in data as Record<string, unknown>) {
			// Ensure we only process own properties.
			if (Object.hasOwn(data, key)) {
				result[key] = processDates((data as Record<string, unknown>)[key]);
			}
		}
		return result as T;
	}

	return data;
}

// ===================================================================================
// Performance & Batching
// ===================================================================================

/**
 * A simple Least Recently Used (LRU) Cache to prevent memory leaks in long-running processes.
 */
class LRUCache<K, V> {
	private readonly capacity: number;
	private readonly cache: Map<K, V>;

	constructor(capacity = 500) {
		this.capacity = capacity;
		this.cache = new Map<K, V>();
	}

	get(key: K): V | undefined {
		if (!this.cache.has(key)) {
			return undefined;
		}
		// Move to end to mark as recently used
		const value = this.cache.get(key);
		if (value === undefined) {
			return undefined;
		}
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.capacity) {
			// Evict the least recently used item
			const firstKey = this.cache.keys().next().value as K | undefined;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}
}

const pathNormalizationCache = new LRUCache<string, string>(1000);

/**
 * Normalizes file paths for cross-platform compatibility (e.g., converting '\\' to '/').
 * Uses an LRU cache for high-performance repeated operations.
 */
export const normalizePath = (path: string): string => {
	const cached = pathNormalizationCache.get(path);
	if (cached) {
		return cached;
	}

	const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
	pathNormalizationCache.set(path, normalized);

	return normalized;
};

/**
 * A higher-order function that wraps an async operation to monitor its performance.
 * It logs warnings for slow operations, aiding in performance tuning.
 * @param operation A descriptive name for the operation being monitored.
 * @param fn The async function to execute and monitor.
 */
export const withPerformanceMonitoring = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
	const startTime = performance.now();
	try {
		const result = await fn();
		const duration = performance.now() - startTime;

		if (duration > 1000) {
			logger.warn(`Slow Operation: '${operation}' took ${duration.toFixed(2)}ms`);
		} else {
			logger.debug(`Operation: '${operation}' took ${duration.toFixed(2)}ms`);
		}
		return result;
	} catch (error) {
		const duration = performance.now() - startTime;
		logger.error(`Failed Operation: '${operation}' failed after ${duration.toFixed(2)}ms`, error);
		throw error;
	}
};

/**
 * Creates an in-memory paginated result from an array of items.
 * @param items The full array of items to paginate
 * @param options Pagination options (page, pageSize)
 */
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
	const page = options.page || 1;
	const pageSize = options.pageSize || 10;
	const total = items.length;
	const totalPages = Math.ceil(total / pageSize);
	const startIndex = (page - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, total);

	return {
		items: items.slice(startIndex, endIndex),
		page,
		pageSize,
		total,
		hasNextPage: page < totalPages,
		hasPreviousPage: page > 1
	};
}
