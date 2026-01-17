import { getPrivateSettingSync } from './settingsService.js';
import { logger } from './logger.js';
import { C as CacheCategory } from './CacheCategory.js';
let browser = false;
try {
	const appEnv = await import('./index3.js');
	browser = appEnv.browser;
} catch {
	browser = false;
}
let CACHE_CONFIG = null;
function getCacheConfig() {
	if (!CACHE_CONFIG) {
		const USE_REDIS = getPrivateSettingSync('USE_REDIS');
		const REDIS_HOST = getPrivateSettingSync('REDIS_HOST');
		const REDIS_PORT = getPrivateSettingSync('REDIS_PORT');
		const REDIS_PASSWORD = getPrivateSettingSync('REDIS_PASSWORD');
		CACHE_CONFIG = {
			USE_REDIS: USE_REDIS === true,
			// Ensure boolean type
			URL: `redis://${REDIS_HOST}:${REDIS_PORT}`,
			PASSWORD: REDIS_PASSWORD || void 0,
			RETRY_ATTEMPTS: 3,
			RETRY_DELAY: 2e3
		};
	}
	return CACHE_CONFIG;
}
class InMemoryStore {
	cache = /* @__PURE__ */ new Map();
	isInitialized = false;
	interval = null;
	async initialize() {
		if (this.isInitialized) return;
		this.interval = setInterval(() => this.cleanup(), 6e4);
		this.isInitialized = true;
		logger.info('In-memory cache initialized.');
	}
	cleanup() {
		const now = Date.now();
		for (const [key, item] of this.cache.entries()) {
			if (item.expiresAt < now) this.cache.delete(key);
		}
	}
	async get(key) {
		const item = this.cache.get(key);
		if (!item) return null;
		if (item.expiresAt < Date.now()) {
			this.cache.delete(key);
			return null;
		}
		return JSON.parse(item.value);
	}
	async set(key, value, ttlSeconds) {
		const expiresAt = Date.now() + ttlSeconds * 1e3;
		this.cache.set(key, { value: JSON.stringify(value), expiresAt });
	}
	async delete(key) {
		const keys = Array.isArray(key) ? key : [key];
		keys.forEach((k) => this.cache.delete(k));
	}
	async clearByPattern(pattern) {
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));
		for (const key of this.cache.keys()) {
			if (regex.test(key)) this.cache.delete(key);
		}
	}
	async disconnect() {
		this.cache.clear();
		if (this.interval) clearInterval(this.interval);
		logger.info('In-memory cache cleared.');
	}
	getClient() {
		return null;
	}
}
class RedisStore {
	client = null;
	isInitialized = false;
	async initialize() {
		if (this.isInitialized || browser) return;
		const config = getCacheConfig();
		if (!config) {
			throw new Error('Cache configuration is not available');
		}
		const { getDatabaseResilience } = await import('./DatabaseResilience.js');
		const resilience = getDatabaseResilience({
			maxAttempts: config.RETRY_ATTEMPTS,
			initialDelayMs: config.RETRY_DELAY,
			backoffMultiplier: 2,
			maxDelayMs: 3e4,
			// Max 30s delay
			jitterMs: 500
		});
		await resilience.executeWithRetry(async () => {
			const { createClient } = await import('redis');
			this.client = createClient({ url: config.URL, password: config.PASSWORD });
			this.client.on('error', (err) => logger.error('Redis Client Error', err));
			this.client.on('reconnecting', () => logger.warn('Reconnecting to Redis...'));
			await this.client.connect();
			this.isInitialized = true;
			logger.info('Redis client connected successfully.');
		}, 'Redis Connection');
	}
	async ensureReady() {
		if (!this.client || !this.isInitialized) {
			throw new Error('Redis client is not initialized. Call initialize() first.');
		}
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}
	async get(key) {
		await this.ensureReady();
		const value = await this.client.get(key);
		return value ? JSON.parse(value) : null;
	}
	async set(key, value, ttlSeconds) {
		await this.ensureReady();
		await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
	}
	async delete(key) {
		await this.ensureReady();
		if (Array.isArray(key)) await this.client.del(key);
		else await this.client.del(key);
	}
	async clearByPattern(pattern) {
		await this.ensureReady();
		let cursor = '0';
		do {
			const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
			cursor = result.cursor;
			if (result.keys.length > 0) await this.client.del(result.keys);
		} while (cursor !== '0');
	}
	async disconnect() {
		if (this.client?.isOpen) await this.client.quit();
		this.isInitialized = false;
		logger.info('Redis connection closed.');
	}
	getClient() {
		return this.client;
	}
}
class CacheService {
	static instance;
	store;
	initialized = false;
	initPromise = null;
	prefetchPatterns = [];
	accessLog = /* @__PURE__ */ new Map();
	// Track access times for analytics
	constructor() {
		const config = getCacheConfig();
		this.store = !browser && config.USE_REDIS ? new RedisStore() : new InMemoryStore();
	}
	static getInstance() {
		if (!CacheService.instance) CacheService.instance = new CacheService();
		return CacheService.instance;
	}
	async initialize() {
		if (this.initialized) return;
		if (!this.initPromise) {
			this.initPromise = this.store.initialize().then(() => {
				this.initialized = true;
			});
		}
		await this.initPromise;
	}
	async ensureInitialized() {
		if (!this.initialized) {
			await this.initialize();
		}
	}
	generateKey(baseKey, tenantId) {
		if (baseKey.startsWith('tenant:')) return baseKey;
		if (getPrivateSettingSync('MULTI_TENANT')) {
			const tenant = tenantId || 'default';
			return `tenant:${tenant}:${baseKey}`;
		}
		return baseKey;
	}
	// Track cache access for analytics and predictive prefetching
	trackAccess(key) {
		const now = Date.now();
		const accesses = this.accessLog.get(key) || [];
		accesses.push(now);
		if (accesses.length > 100) {
			accesses.shift();
		}
		this.accessLog.set(key, accesses);
	}
	// Check if a key should be predictively prefetched based on patterns
	async checkPrefetch(key, tenantId) {
		for (const pattern of this.prefetchPatterns) {
			if (pattern.pattern.test(key)) {
				const keysToFetch = pattern.prefetchKeys(key);
				if (keysToFetch.length > 0 && pattern.fetcher) {
					void this.executePrefetch(keysToFetch, pattern.fetcher, pattern.category, tenantId);
				}
				break;
			}
		}
	}
	async executePrefetch(keys, fetcher, category, tenantId) {
		try {
			const missingKeys = [];
			for (const key of keys) {
				const fullKey = this.generateKey(key, tenantId);
				const exists = await this.store.get(fullKey);
				if (!exists) {
					missingKeys.push(key);
				}
			}
			if (missingKeys.length === 0) return;
			logger.debug(`Prefetching ${missingKeys.length} missing keys`);
			const dataMap = await fetcher(missingKeys);
			const ttl = category ? getCategoryTTL(category) : REDIS_TTL_S;
			for (const [key, value] of Object.entries(dataMap)) {
				await this.set(key, value, ttl, tenantId, category);
			}
		} catch (error) {
			logger.warn('Predictive prefetch failed:', error);
		}
	}
	async get(baseKey, tenantId, _category) {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		this.trackAccess(key);
		void this.checkPrefetch(key, tenantId);
		return this.store.get(key);
	}
	async set(baseKey, value, ttlSeconds, tenantId, category) {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		const finalTTL = category && ttlSeconds === 0 ? getCategoryTTL(category) : ttlSeconds;
		await this.store.set(key, value, finalTTL);
	}
	// Set with automatic category-based TTL
	async setWithCategory(baseKey, value, category, tenantId) {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		const ttl = getCategoryTTL(category);
		await this.store.set(key, value, ttl);
	}
	async delete(baseKey, tenantId) {
		await this.ensureInitialized();
		const keys = Array.isArray(baseKey) ? baseKey.map((k) => this.generateKey(k, tenantId)) : this.generateKey(baseKey, tenantId);
		await this.store.delete(keys);
	}
	async clearByPattern(pattern, tenantId) {
		await this.ensureInitialized();
		const keyPattern = this.generateKey(pattern, tenantId);
		await this.store.clearByPattern(keyPattern);
	}
	/**
	 * Warm cache with critical data
	 * Useful for preloading frequently accessed data on startup
	 */
	async warmCache(config) {
		await this.ensureInitialized();
		logger.info(`Warming cache for ${config.keys.length} keys in category ${config.category || 'default'}`);
		try {
			const data = await config.fetcher();
			const ttl = config.category ? getCategoryTTL(config.category) : REDIS_TTL_S;
			for (const key of config.keys) {
				await this.set(key, data, ttl, config.tenantId, config.category);
			}
			logger.info(`Cache warmed successfully for ${config.keys.length} keys`);
		} catch (error) {
			logger.error('Cache warming failed:', error);
		}
	}
	/**
	 * Register a predictive prefetch pattern
	 * When a key matching the pattern is accessed, related keys will be prefetched
	 */
	registerPrefetchPattern(pattern) {
		this.prefetchPatterns.push(pattern);
		logger.info(`Registered prefetch pattern: ${pattern.pattern.source}`);
	}
	// Get cache access analytics
	getAccessAnalytics(key) {
		const accesses = this.accessLog.get(key);
		if (!accesses || accesses.length === 0) return null;
		const count = accesses.length;
		const lastAccess = accesses[accesses.length - 1];
		let totalInterval = 0;
		for (let i = 1; i < accesses.length; i++) {
			totalInterval += accesses[i] - accesses[i - 1];
		}
		const avgInterval = accesses.length > 1 ? totalInterval / (accesses.length - 1) : 0;
		return { count, avgInterval, lastAccess };
	}
	/**
	 * Get recommended TTL based on access patterns
	 * Returns recommended TTL in seconds
	 */
	getRecommendedTTL(key) {
		const analytics = this.getAccessAnalytics(key);
		if (!analytics) return null;
		if (analytics.avgInterval < 6e4) {
			return 600;
		}
		if (analytics.avgInterval < 3e5) {
			return 300;
		}
		return 180;
	}
	/**
	 * Invalidate all cached data to force refresh
	 * Useful when TTL settings are changed via the settings UI
	 */
	async invalidateAll() {
		await this.ensureInitialized();
		logger.info('🔄 Invalidating all cache entries due to configuration change');
		if (this.store instanceof InMemoryStore) {
			await this.store.disconnect();
			await this.store.initialize();
		} else if (this.store instanceof RedisStore) {
			await this.store.clearByPattern('*');
		}
		logger.info('✅ Cache invalidated successfully');
	}
	/**
	 * Get current TTL configuration for all categories
	 * Useful for displaying in admin UI
	 */
	getCurrentTTLConfig() {
		return {
			schema: getCategoryTTL(CacheCategory.SCHEMA),
			widget: getCategoryTTL(CacheCategory.WIDGET),
			theme: getCategoryTTL(CacheCategory.THEME),
			content: getCategoryTTL(CacheCategory.CONTENT),
			media: getCategoryTTL(CacheCategory.MEDIA),
			session: getCategoryTTL(CacheCategory.SESSION),
			user: getCategoryTTL(CacheCategory.USER),
			api: getCategoryTTL(CacheCategory.API)
		};
	}
	getRedisClient() {
		return this.store.getClient();
	}
	async disconnect() {
		await this.store.disconnect();
	}
}
const cacheService = CacheService.getInstance();
const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
const USER_PERM_CACHE_TTL_MS = 60 * 1e3;
const USER_COUNT_CACHE_TTL_MS = 5 * 60 * 1e3;
const API_CACHE_TTL_MS = 5 * 60 * 1e3;
const USER_PERM_CACHE_TTL_S = Math.ceil(USER_PERM_CACHE_TTL_MS / 1e3);
const USER_COUNT_CACHE_TTL_S = Math.ceil(USER_COUNT_CACHE_TTL_MS / 1e3);
const API_CACHE_TTL_S = Math.ceil(API_CACHE_TTL_MS / 1e3);
const REDIS_TTL_S = 300;
const DEFAULT_CATEGORY_TTLS = {
	[CacheCategory.SCHEMA]: 600,
	// 10 minutes - schemas change rarely
	[CacheCategory.WIDGET]: 600,
	// 10 minutes - widget configs are relatively stable
	[CacheCategory.THEME]: 300,
	// 5 minutes - themes may update occasionally
	[CacheCategory.CONTENT]: 180,
	// 3 minutes - content updates frequently
	[CacheCategory.MEDIA]: 300,
	// 5 minutes - media metadata is fairly stable
	[CacheCategory.SESSION]: 86400,
	// 24 hours - user sessions
	[CacheCategory.USER]: 60,
	// 1 minute - user permissions (frequently checked)
	[CacheCategory.API]: 300
	// 5 minutes - API responses
};
function getCategoryTTL(category) {
	const configKey = `CACHE_TTL_${category.toUpperCase()}`;
	try {
		const configuredTTL = getPrivateSettingSync(configKey);
		if (typeof configuredTTL === 'number' && configuredTTL > 0) {
			return configuredTTL;
		}
	} catch (error) {
		logger.debug(`Failed to get TTL for ${category}, using default:`, error);
	}
	return DEFAULT_CATEGORY_TTLS[category];
}
export {
	API_CACHE_TTL_MS,
	API_CACHE_TTL_S,
	REDIS_TTL_S,
	SESSION_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_MS,
	USER_COUNT_CACHE_TTL_S,
	USER_PERM_CACHE_TTL_MS,
	USER_PERM_CACHE_TTL_S,
	cacheService
};
//# sourceMappingURL=CacheService.js.map
