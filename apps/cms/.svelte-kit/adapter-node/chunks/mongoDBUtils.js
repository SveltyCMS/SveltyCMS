import { l as logger } from './logger.server.js';
import { v4 } from 'uuid';
const ID_VALIDATION_REGEX = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
function createDatabaseError(error, code, message) {
	const details = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : void 0;
	logger.error(`[${code}] ${message}`, { details, stack });
	return { code, message, details, stack };
}
function generateId() {
	return v4().replace(/-/g, '');
}
function validateId(id) {
	return ID_VALIDATION_REGEX.test(id);
}
function normalizeCollectionName(collection) {
	if (collection.startsWith('media_') || collection.startsWith('auth_')) {
		return collection;
	}
	return collection.startsWith('collection_') ? collection : `collection_${collection}`;
}
function isDateLike(val) {
	return !!val && typeof val.toISOString === 'function';
}
function isObjectIdLike(val) {
	if (!val || typeof val !== 'object') {
		return false;
	}
	const candidate = val;
	const hasToHexString = typeof candidate.toHexString === 'function';
	const bsonType = typeof candidate._bsontype === 'string' ? candidate._bsontype : void 0;
	return hasToHexString && (!bsonType || bsonType === 'ObjectId' || bsonType === 'ObjectID');
}
function processDates(data) {
	if (!data) return data;
	if (isDateLike(data)) {
		return data.toISOString();
	}
	if (isObjectIdLike(data)) {
		return data.toHexString();
	}
	if (Array.isArray(data)) {
		return data.map(processDates);
	}
	if (typeof data === 'object') {
		const result = {};
		for (const key in data) {
			if (Object.prototype.hasOwnProperty.call(data, key)) {
				result[key] = processDates(data[key]);
			}
		}
		return result;
	}
	return data;
}
class LRUCache {
	capacity;
	cache;
	constructor(capacity = 500) {
		this.capacity = capacity;
		this.cache = /* @__PURE__ */ new Map();
	}
	get(key) {
		if (!this.cache.has(key)) {
			return void 0;
		}
		const value = this.cache.get(key);
		if (value === void 0) return void 0;
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}
	set(key, value) {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.capacity) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== void 0) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}
}
const pathNormalizationCache = new LRUCache(1e3);
const normalizePath = (path) => {
	const cached = pathNormalizationCache.get(path);
	if (cached) {
		return cached;
	}
	const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
	pathNormalizationCache.set(path, normalized);
	return normalized;
};
const withPerformanceMonitoring = async (operation, fn) => {
	const startTime = performance.now();
	try {
		const result = await fn();
		const duration = performance.now() - startTime;
		if (duration > 1e3) {
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
function createPagination(items, options) {
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
const mongoDBUtils = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			createDatabaseError,
			createPagination,
			generateId,
			isDateLike,
			normalizeCollectionName,
			normalizePath,
			processDates,
			validateId,
			withPerformanceMonitoring
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export { createDatabaseError as c, generateId as g, mongoDBUtils as m, processDates as p };
//# sourceMappingURL=mongoDBUtils.js.map
