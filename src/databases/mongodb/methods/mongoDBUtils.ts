/**
 * @file src/databases/mongodb/methods/mongoDBUtils.ts
 * @description A comprehensive suite of shared utility functions for the MongoDB adapter.
 * This module provides robust, performant, and type-safe helpers for error handling,
 * data processing, performance monitoring, and intelligent caching.
 */

import type { DatabaseId } from '@src/content/types';
import { logger } from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseError, PaginatedResult, PaginationOptions } from '../../dbInterface';
import { cacheService, CacheCategory } from '@src/databases/CacheService';
import { cacheMetrics } from '@src/databases/CacheMetrics';

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
	if (collection.startsWith('media_') || collection.startsWith('auth_')) {
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
	return !!val && typeof (val as Date).toISOString === 'function';
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
	if (!data) return data;

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
			if (Object.prototype.hasOwnProperty.call(data, key)) {
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
	private capacity: number;
	private cache: Map<K, V>;

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
		if (value === undefined) return undefined;
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

// ===================================================================================
// Smart Caching Utilities
// ===================================================================================

// Note: CacheCategory enum is imported from CacheService for consistency
// Re-export for convenience in this module
export { CacheCategory } from '@src/databases/CacheService';

/**
 * Options for cache operations
 */
export interface CacheWrapperOptions {
	category: CacheCategory;
	tenantId?: string;
	ttl?: number; // Override default TTL (uses category-based TTL from settings if not provided)
	forceRefresh?: boolean; // Bypass cache and force DB query
}

/**
 * Wraps a database query with intelligent caching logic
 *
 * Features:
 * - Automatic cache hit/miss tracking
 * - Multi-tenant isolation via CacheService
 * - Category-based TTL from database settings (dynamically configurable)
 * - Resilient fallback on cache failure
 * - Performance monitoring
 *
 * @param cacheKey Unique key for this query
 * @param queryFn Function that executes the actual database query
 * @param options Caching options (category, tenantId, ttl)
 * @returns Query result (from cache or fresh from DB)
 *
 * @example
 * ```typescript
 * const widgets = await withCache(
 *   'widgets:active',
 *   () => this.widgetRepo.findMany({ isActive: true }),
 *   { category: CacheCategory.WIDGET, tenantId: 'acme_corp' }
 * );
 * ```
 */
export async function withCache<T>(cacheKey: string, queryFn: () => Promise<T>, options: CacheWrapperOptions): Promise<T> {
	const startTime = performance.now();
	const { category, tenantId, ttl, forceRefresh = false } = options;

	try {
		// Initialize cache service
		await cacheService.initialize();

		// Force refresh bypasses cache
		if (forceRefresh) {
			logger.debug(`Cache FORCE REFRESH: ${cacheKey}`, { category, tenantId });
			const result = await queryFn();

			// Update cache with fresh data using category-based TTL from CacheService
			if (ttl !== undefined) {
				// Use explicit TTL if provided
				await cacheService.set(cacheKey, result, ttl, tenantId, category);
			} else {
				// Use category-based TTL from settings (dynamic, configurable)
				await cacheService.setWithCategory(cacheKey, result, category, tenantId);
			}
			cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);

			return result;
		}

		// Try to get from cache first (with category for metrics)
		const cached = await cacheService.get<T>(cacheKey, tenantId, category);

		if (cached !== null) {
			// Cache HIT
			const responseTime = performance.now() - startTime;
			cacheMetrics.recordHit(cacheKey, category, tenantId, responseTime);
			logger.debug(`Cache HIT: ${cacheKey}`, {
				category,
				tenantId,
				responseTime: `${responseTime.toFixed(2)}ms`
			});
			return cached;
		}

		// Cache MISS - execute query
		const missTime = performance.now() - startTime;
		cacheMetrics.recordMiss(cacheKey, category, tenantId, missTime);
		logger.debug(`Cache MISS: ${cacheKey}`, {
			category,
			tenantId,
			responseTime: `${missTime.toFixed(2)}ms`
		});

		const result = await queryFn();

		// Store in cache using category-based TTL from CacheService (dynamic, configurable)
		if (ttl !== undefined) {
			// Use explicit TTL if provided
			await cacheService.set(cacheKey, result, ttl, tenantId, category);
		} else {
			// Use category-based TTL from settings (allows runtime changes)
			await cacheService.setWithCategory(cacheKey, result, category, tenantId);
		}
		cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);

		return result;
	} catch (error) {
		// If caching fails, still return the query result (resilience)
		logger.warn(`Cache wrapper error for ${cacheKey}, falling back to direct query:`, {
			error: error instanceof Error ? error.message : String(error),
			category,
			tenantId
		});
		return queryFn();
	}
}

/**
 * Generates a consistent cache key from query parameters
 *
 * @param collection Collection name
 * @param operation Operation type (e.g., 'findOne', 'findMany', 'aggregate')
 * @param params Query parameters (will be hashed)
 * @returns Consistent cache key
 *
 * @example
 * ```typescript
 * const key = generateCacheKey('users', 'findOne', { email: 'user@example.com' });
 * // Result: "collection:users:findOne:a3f7b2"
 * ```
 */
export function generateCacheKey(collection: string, operation: string, params: Record<string, unknown> = {}): string {
	const paramsHash = hashObject(params);
	return `collection:${collection}:${operation}:${paramsHash}`;
}

/**
 * Hashes an object for use in cache keys
 * Uses a simple but effective hash algorithm
 */
function hashObject(obj: Record<string, unknown>): string {
	const str = JSON.stringify(obj, Object.keys(obj).sort());
	return hashString(str);
}

/**
 * Simple string hashing for cache keys
 * Uses DJB2 hash algorithm (fast and good distribution)
 */
function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) + hash + char; // hash * 33 + char
	}
	return Math.abs(hash).toString(36);
}

/**
 * Invalidates cache for a specific collection
 * Useful after write operations (create, update, delete)
 *
 * @param collection Collection name to invalidate
 * @param tenantId Optional tenant ID for multi-tenant isolation
 */
export async function invalidateCollectionCache(collection: string, tenantId?: string): Promise<void> {
	try {
		await cacheService.initialize();
		const pattern = `collection:${collection}:*`;
		await cacheService.clearByPattern(pattern, tenantId);
		cacheMetrics.recordClear(pattern, CacheCategory.CONTENT, tenantId);
		logger.debug(`Cache invalidated for collection: ${collection}`, { tenantId });
	} catch (error) {
		logger.warn(`Failed to invalidate cache for collection ${collection}:`, error);
	}
}

/**
 * Invalidates cache by category
 * Useful for clearing all widgets, themes, etc.
 *
 * @param category Cache category to invalidate
 * @param tenantId Optional tenant ID for multi-tenant isolation
 */
export async function invalidateCategoryCache(category: CacheCategory, tenantId?: string): Promise<void> {
	try {
		await cacheService.initialize();
		const tenantScope = tenantId ?? '*';
		const patterns = new Set<string>();
		patterns.add(`${category}:*`);
		patterns.add(`*:${category}:*`);

		let clearedAny = false;
		for (const pattern of patterns) {
			await cacheService.clearByPattern(pattern, tenantScope);
			cacheMetrics.recordClear(pattern, category, tenantId);
			clearedAny = true;
		}

		if (clearedAny) {
			logger.debug(`Cache invalidated for category: ${category}`, { tenantId: tenantId ?? 'all-tenants' });
		}
	} catch (error) {
		logger.warn(`Failed to invalidate cache for category ${category}:`, error);
	}
}

/**
 * Deletes a specific cache entry
 *
 * @param cacheKey Cache key to delete
 * @param category Cache category for metrics
 * @param tenantId Optional tenant ID
 */
export async function deleteCache(cacheKey: string, category: CacheCategory, tenantId?: string): Promise<void> {
	try {
		await cacheService.initialize();
		await cacheService.delete(cacheKey, tenantId);
		cacheMetrics.recordDelete(cacheKey, category, tenantId);
		logger.debug(`Cache entry deleted: ${cacheKey}`, { category, tenantId });
	} catch (error) {
		logger.warn(`Failed to delete cache entry ${cacheKey}:`, error);
	}
}
