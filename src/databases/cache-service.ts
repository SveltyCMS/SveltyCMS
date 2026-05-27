/**
 * @file src/databases/cache-service.ts
 * @description Entry point for the CacheService singleton.
 * Provides a mockable interface for the rest of the application.
 */

import { CacheService } from './cache/cache-service';
export {
	CacheCategory,
	SESSION_CACHE_TTL_MS,
	SESSION_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	API_CACHE_TTL_MS,
	API_CACHE_TTL_S,
	REDIS_TTL_S,
	getSessionCacheTTL,
	getUserPermCacheTTL,
	getApiCacheTTL
} from './cache/cache-service';

export const cacheService = CacheService.getInstance();
