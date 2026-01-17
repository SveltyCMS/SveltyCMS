import { l as logger } from './logger.server.js';
import { cacheService } from './CacheService.js';
import { C as CacheCategory } from './CacheCategory.js';
import { c as cacheMetrics } from './CacheMetrics.js';
async function withCache(cacheKey, queryFn, options) {
	const startTime = performance.now();
	const { category, tenantId, ttl, forceRefresh = false } = options;
	try {
		await cacheService.initialize();
		if (forceRefresh) {
			logger.debug(`Cache FORCE REFRESH: ${cacheKey}`, { category, tenantId });
			const result2 = await queryFn();
			if (ttl !== void 0) {
				await cacheService.set(cacheKey, result2, ttl, tenantId, category);
			} else {
				await cacheService.setWithCategory(cacheKey, result2, category, tenantId);
			}
			cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);
			return result2;
		}
		const cached = await cacheService.get(cacheKey, tenantId, category);
		if (cached !== null) {
			const responseTime = performance.now() - startTime;
			cacheMetrics.recordHit(cacheKey, category, tenantId, responseTime);
			logger.debug(`Cache HIT: ${cacheKey}`, {
				category,
				tenantId,
				responseTime: `${responseTime.toFixed(2)}ms`
			});
			return cached;
		}
		const missTime = performance.now() - startTime;
		cacheMetrics.recordMiss(cacheKey, category, tenantId, missTime);
		logger.debug(`Cache MISS: ${cacheKey}`, {
			category,
			tenantId,
			responseTime: `${missTime.toFixed(2)}ms`
		});
		const result = await queryFn();
		if (ttl !== void 0) {
			await cacheService.set(cacheKey, result, ttl, tenantId, category);
		} else {
			await cacheService.setWithCategory(cacheKey, result, category, tenantId);
		}
		cacheMetrics.recordSet(cacheKey, category, ttl || 0, tenantId);
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
function generateCacheKey(collection, operation, params = {}) {
	const paramsHash = hashObject(params);
	return `collection:${collection}:${operation}:${paramsHash}`;
}
function hashObject(obj) {
	const str = JSON.stringify(obj, Object.keys(obj).sort());
	return hashString(str);
}
function hashString(str) {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) + hash + char;
	}
	return Math.abs(hash).toString(36);
}
async function invalidateCollectionCache(collection, tenantId) {
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
async function invalidateCategoryCache(category, tenantId) {
	try {
		await cacheService.initialize();
		const tenantScope = tenantId ?? '*';
		const patterns = /* @__PURE__ */ new Set();
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
async function deleteCache(cacheKey, category, tenantId) {
	try {
		await cacheService.initialize();
		await cacheService.delete(cacheKey, tenantId);
		cacheMetrics.recordDelete(cacheKey, category, tenantId);
		logger.debug(`Cache entry deleted: ${cacheKey}`, { category, tenantId });
	} catch (error) {
		logger.warn(`Failed to delete cache entry ${cacheKey}:`, error);
	}
}
const mongoDBCacheUtils = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			CacheCategory,
			deleteCache,
			generateCacheKey,
			invalidateCategoryCache,
			invalidateCollectionCache,
			withCache
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export { invalidateCategoryCache as a, invalidateCollectionCache as i, mongoDBCacheUtils as m, withCache as w };
//# sourceMappingURL=mongoDBCacheUtils.js.map
