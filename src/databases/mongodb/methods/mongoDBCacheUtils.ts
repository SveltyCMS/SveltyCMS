/**
 * @file src/databases/mongodb/methods/mongoDBCacheUtils.ts
 * @description Caching utilities for MongoDB adapter.
 * Separated from mongoDBUtils.ts to avoid circular dependencies with CacheService.
 */

import { CacheCategory } from '@src/databases/CacheCategory';
import { cacheMetrics } from '@src/databases/CacheMetrics';
import { cacheService } from '@src/databases/CacheService';
import { logger } from '@src/utils/logger.server';

// Re-export for convenience
export { CacheCategory };

//Options for cache operations
export interface CacheWrapperOptions {
	category: CacheCategory;
	forceRefresh?: boolean; // Bypass cache and force DB query
	tenantId?: string;
	ttl?: number; // Override default TTL (uses category-based TTL from settings if not provided)
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
	const isBootstrapping = cacheService.isBootstrapping();

	try {
		// Force refresh bypasses cache
		if (forceRefresh) {
			if (!isBootstrapping) {
				logger.debug(`Cache FORCE REFRESH: ${cacheKey}`, { category, tenantId });
			}
			const result = await queryFn();

			// Update cache with fresh data
			if (ttl !== undefined) {
				await cacheService.set(cacheKey, result, ttl, tenantId, category);
			} else {
				await cacheService.setWithCategory(cacheKey, result, category, tenantId);
			}

			if (!isBootstrapping) {
				cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);
			}

			return result;
		}

		// Try to get from cache first
		const cached = await cacheService.get<T>(cacheKey, tenantId, category);

		if (cached !== null) {
			// Cache HIT
			if (!isBootstrapping) {
				const responseTime = performance.now() - startTime;
				cacheMetrics.recordHit(cacheKey, category, tenantId, responseTime);
				logger.debug(`Cache HIT: ${cacheKey}`, {
					category,
					tenantId,
					responseTime: `${responseTime.toFixed(2)}ms`
				});
			}
			return cached;
		}

		// Cache MISS - execute query
		const result = await queryFn();

		if (!isBootstrapping) {
			const missTime = performance.now() - startTime;
			cacheMetrics.recordMiss(cacheKey, category, tenantId, missTime);
			logger.debug(`Cache MISS: ${cacheKey}`, {
				category,
				tenantId,
				responseTime: `${missTime.toFixed(2)}ms`
			});
		}

		// Store in cache
		if (ttl !== undefined) {
			await cacheService.set(cacheKey, result, ttl, tenantId, category);
		} else {
			await cacheService.setWithCategory(cacheKey, result, category, tenantId);
		}

		if (!isBootstrapping) {
			cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);
		}

		return result;
	} catch (error) {
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
 */
export function generateCacheKey(collection: string, operation: string, params: Record<string, unknown> = {}): string {
	const paramsHash = hashObject(params);
	return `collection:${collection}:${operation}:${paramsHash}`;
}

/**
 * Hashes an object for use in cache keys
 */
function hashObject(obj: Record<string, unknown>): string {
	const str = JSON.stringify(obj, Object.keys(obj).sort());
	return hashString(str);
}

/**
 * Simple string hashing for cache keys
 */
function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) + hash + char;
	}
	return Math.abs(hash).toString(36);
}

/**
 * Invalidates cache for a specific collection
 */
export async function invalidateCollectionCache(collection: string, tenantId?: string): Promise<void> {
	if (cacheService.isBootstrapping()) {
		return;
	}

	try {
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
 */
export async function invalidateCategoryCache(category: CacheCategory, tenantId?: string): Promise<void> {
	if (cacheService.isBootstrapping()) {
		return;
	}

	try {
		const tenantScope = tenantId ?? '*';
		const patterns = [`${category}:*`, `*:${category}:*`];

		for (const pattern of patterns) {
			await cacheService.clearByPattern(pattern, tenantScope);
			cacheMetrics.recordClear(pattern, category, tenantId);
		}

		logger.debug(`Cache invalidated for category: ${category}`, { tenantId: tenantId ?? 'all-tenants' });
	} catch (error) {
		logger.warn(`Failed to invalidate cache for category ${category}:`, error);
	}
}

/**
 * Deletes a specific cache entry
 */
export async function deleteCache(cacheKey: string, category: CacheCategory, tenantId?: string): Promise<void> {
	try {
		await cacheService.delete(cacheKey, tenantId);

		if (!cacheService.isBootstrapping()) {
			cacheMetrics.recordDelete(cacheKey, category, tenantId);
			logger.debug(`Cache entry deleted: ${cacheKey}`, { category, tenantId });
		}
	} catch (error) {
		logger.warn(`Failed to delete cache entry ${cacheKey}:`, error);
	}
}
