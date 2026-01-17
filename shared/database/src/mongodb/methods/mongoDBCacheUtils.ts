/**
 * @file shared/database/src/mongodb/methods/mongoDBCacheUtils.ts
 * @description Caching utilities for MongoDB adapter.
 * Separated from mongoDBUtils.ts to avoid circular dependencies with CacheService.
 */

import { logger } from '@shared/utils/logger.server';
import { cacheService } from '@shared/database/CacheService';
import { CacheCategory } from '@shared/database/CacheCategory';
import { cacheMetrics } from '@shared/database/CacheMetrics';

// Re-export for convenience
export { CacheCategory };

//Options for cache operations
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
