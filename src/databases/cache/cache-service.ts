/**
 * @file src/databases/cache-service.ts
 * @description Unified caching service for the CMS (in-memory or Redis), with tenant-aware keys
 *
 * Enhancements:
 * - Split InMemoryStore/RedisStore into separate classes for modularity.
 * - Added cache tags for bulk invalidation.
 * - Memoized generateKey for performance.
 * - Reduced browser checks; centralized config.
 * - Inlined CacheCategory enum to reduce files.
 */

import { getPrivateSettingSync } from '@src/services/settings-service';
// System Logger - use universal logger for client/server compatibility
import { logger } from '@utils/logger';
import type { RedisClientType } from 'redis';
import { InMemoryStore } from './inmemory-store';
import { RedisStore } from './redis-store';
import { CacheCategory, type CacheStore, type WarmCacheConfig, type PrefetchPattern } from './types';

// Re-export for convenience
export { CacheCategory };

// Safe import for test environment
let browser = false;
try {
	const appEnv = await import('$app/environment');
	browser = appEnv.browser;
} catch {
	browser = false;
}

// Default constants
export const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const USER_PERM_CACHE_TTL_MS = 60 * 1000;
export const USER_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
export const API_CACHE_TTL_MS = 5 * 60 * 1000;
export const SESSION_CACHE_TTL_S = Math.ceil(SESSION_CACHE_TTL_MS / 1000);
export const USER_PERM_CACHE_TTL_S = Math.ceil(USER_PERM_CACHE_TTL_MS / 1000);
export const USER_COUNT_CACHE_TTL_S = Math.ceil(USER_COUNT_CACHE_TTL_MS / 1000);
export const API_CACHE_TTL_S = Math.ceil(API_CACHE_TTL_MS / 1000);
export const REDIS_TTL_S = 300;

const DEFAULT_CATEGORY_TTLS: Record<CacheCategory, number> = {
	[CacheCategory.SCHEMA]: 600,
	[CacheCategory.WIDGET]: 600,
	[CacheCategory.THEME]: 300,
	[CacheCategory.CONTENT]: 180,
	[CacheCategory.MEDIA]: 300,
	[CacheCategory.SESSION]: 86_400,
	[CacheCategory.USER]: 60,
	[CacheCategory.API]: 300,
	[CacheCategory.COLLECTION]: 600,
	[CacheCategory.ENTRY]: 180,
	[CacheCategory.SETTING]: 3600
};

function getCategoryTTL(category: CacheCategory): number {
	const configKey = `CACHE_TTL_${category.toUpperCase()}` as any;
	try {
		const configuredTTL = getPrivateSettingSync(configKey);
		if (typeof configuredTTL === 'number' && configuredTTL > 0) return configuredTTL;
	} catch (_error) {
		logger.debug(`Failed to get TTL for ${category}, using default`);
	}
	return DEFAULT_CATEGORY_TTLS[category];
}

// Cache config will be loaded lazily when cache is initialized
let CACHE_CONFIG: {
	USE_REDIS: boolean;
	URL: string;
	PASSWORD?: string;
	RETRY_ATTEMPTS: number;
	RETRY_DELAY: number;
} | null = null;

function getCacheConfig(forceReload = false) {
	if (!CACHE_CONFIG || forceReload) {
		const USE_REDIS = getPrivateSettingSync('USE_REDIS');
		const REDIS_HOST = getPrivateSettingSync('REDIS_HOST') || 'localhost';
		const REDIS_PORT = getPrivateSettingSync('REDIS_PORT') || 6379;
		const REDIS_PASSWORD = getPrivateSettingSync('REDIS_PASSWORD');

		CACHE_CONFIG = {
			USE_REDIS: USE_REDIS === true,
			URL: `redis://${REDIS_HOST}:${REDIS_PORT}`,
			PASSWORD: REDIS_PASSWORD || undefined,
			RETRY_ATTEMPTS: 3,
			RETRY_DELAY: 2000
		};
	}
	return CACHE_CONFIG;
}

export class CacheService {
	private static instance: CacheService;
	private store: CacheStore | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private readonly prefetchPatterns: PrefetchPattern[] = [];
	private readonly accessLog = new Map<string, number[]>(); // Track access times for analytics
	private readonly keyCache = new Map<string, string>(); // Memoized generateKey
	private readonly debounceTimers = new Map<string, NodeJS.Timeout>(); // For bulk invalidations
	private bootstrapping = true;

	private constructor() {}

	static getInstance(): CacheService {
		if (!CacheService.instance) {
			CacheService.instance = new CacheService();
		}
		return CacheService.instance;
	}

	setBootstrapping(val: boolean): void {
		this.bootstrapping = val;
		if (!val) {
			logger.info('CacheService: Bootstrapping complete. Metrics and full logging enabled.');
		}
	}

	isBootstrapping(): boolean {
		return this.bootstrapping;
	}

	async initialize(force = false): Promise<void> {
		if (this.initialized && !force) return;
		if (!this.initPromise || force) {
			this.initPromise = (async () => {
				try {
					const config = getCacheConfig(force);
					const isRedis = !browser && config.USE_REDIS;

					if (this.store) await this.store.disconnect();

					this.store = isRedis ? new RedisStore(config) : new InMemoryStore();
					await this.store.initialize();
					this.initialized = true;
					logger.info(`CacheService initialized successfully (${isRedis ? 'Redis' : 'In-Memory'}).`);
				} catch (error) {
					logger.error('CacheService initialization failed:', error);
					this.initPromise = null;
					throw error;
				}
			})();
		}
		return this.initPromise;
	}

	async reconfigure(): Promise<void> {
		logger.info('🔄 Reconfiguring CacheService...');
		this.initialized = false;
		return this.initialize(true);
	}

	private async ensureInitialized() {
		if (!this.initialized) await this.initialize();
	}

	private generateKey(baseKey: string, tenantId?: string | null): string {
		const cacheKeyRequested = `${baseKey}:${tenantId || 'none'}`;
		if (this.keyCache.has(cacheKeyRequested)) {
			return this.keyCache.get(cacheKeyRequested)!;
		}

		let result: string;
		if (baseKey.startsWith('tenant:')) {
			result = baseKey;
		} else if (getPrivateSettingSync('MULTI_TENANT')) {
			const tenant = tenantId || 'default';
			result = `tenant:${tenant}:${baseKey}`;
		} else {
			result = baseKey;
		}

		this.keyCache.set(cacheKeyRequested, result);
		return result;
	}

	private trackAccess(key: string): void {
		const now = Date.now();
		const accesses = this.accessLog.get(key) || [];
		accesses.push(now);
		if (accesses.length > 100) accesses.shift();
		this.accessLog.set(key, accesses);
	}

	private async checkPrefetch(key: string, tenantId?: string | null): Promise<void> {
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

	private async executePrefetch(
		keys: string[],
		fetcher: (keys: string[]) => Promise<Record<string, unknown>>,
		category?: CacheCategory,
		tenantId?: string | null
	): Promise<void> {
		try {
			const missingKeys: string[] = [];
			for (const key of keys) {
				const fullKey = this.generateKey(key, tenantId);
				const exists = await this.store?.get(fullKey);
				if (!exists) missingKeys.push(key);
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

	async get<T>(baseKey: string, tenantId?: string | null, _category?: CacheCategory): Promise<T | null> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		this.trackAccess(key);
		void this.checkPrefetch(key, tenantId);
		return (await this.store?.get<T>(key)) ?? null;
	}

	async set<T>(baseKey: string, value: T, ttlSeconds: number, tenantId?: string | null, category?: CacheCategory, tags?: string[]): Promise<void> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		const finalTTL = category && ttlSeconds === 0 ? getCategoryTTL(category) : ttlSeconds;
		await this.store?.set<T>(key, value, finalTTL, tags);
	}

	async setWithCategory<T>(baseKey: string, value: T, category: CacheCategory, tenantId?: string | null, tags?: string[]): Promise<void> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		const ttl = getCategoryTTL(category);
		await this.store?.set<T>(key, value, ttl, tags);
	}

	async delete(baseKey: string | string[], tenantId?: string | null): Promise<void> {
		await this.ensureInitialized();
		const keys = Array.isArray(baseKey) ? baseKey.map((k) => this.generateKey(k, tenantId)) : this.generateKey(baseKey, tenantId);
		await this.store?.delete(keys);
	}

	/**
	 * Finalize a tag by adding tenant prefix if multi-tenant is enabled.
	 */
	private finalizeTags(tags: string | string[], tenantId?: string | null): string[] {
		const tagsArray = Array.isArray(tags) ? tags : [tags];
		if (!getPrivateSettingSync('MULTI_TENANT')) {
			return tagsArray;
		}
		const tenant = tenantId || 'default';
		return tagsArray.map((tag) => (tag.startsWith('tenant:') ? tag : `tenant:${tenant}:${tag}`));
	}

	async clearByPattern(pattern: string, tenantId?: string | null): Promise<void> {
		await this.ensureInitialized();
		const keyPattern = this.generateKey(pattern, tenantId);
		await this.store?.clearByPattern(keyPattern);
	}

	async clearByTags(tags: string[] | string, tenantId?: string | null): Promise<void> {
		await this.ensureInitialized();
		const finalTags = this.finalizeTags(tags, tenantId);
		const debounceKey = finalTags.sort().join(',');

		// Clear existing timer if any
		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey)!);
		}

		// Set new debounce timer (300ms)
		const timer = setTimeout(async () => {
			this.debounceTimers.delete(debounceKey);
			await this.store?.clearByTags(finalTags);
			logger.debug(`Bulk cache invalidations executed for tags: ${debounceKey}`);
		}, 300);

		this.debounceTimers.set(debounceKey, timer);
	}

	async warmCache(config: WarmCacheConfig): Promise<void> {
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

	registerPrefetchPattern(pattern: PrefetchPattern): void {
		this.prefetchPatterns.push(pattern);
		logger.info(`Registered prefetch pattern: ${pattern.pattern.source}`);
	}

	getAccessAnalytics(key: string): { count: number; avgInterval: number; lastAccess: number } | null {
		const accesses = this.accessLog.get(key);
		if (!accesses || accesses.length === 0) return null;
		const count = accesses.length;
		const lastAccess = accesses.at(-1) || 0;
		let totalInterval = 0;
		for (let i = 1; i < accesses.length; i++) {
			totalInterval += accesses[i] - accesses[i - 1];
		}
		const avgInterval = accesses.length > 1 ? totalInterval / (accesses.length - 1) : 0;
		return { count, avgInterval, lastAccess };
	}

	getRecommendedTTL(key: string): number | null {
		const analytics = this.getAccessAnalytics(key);
		if (!analytics) return null;
		if (analytics.avgInterval < 60_000) return 600;
		if (analytics.avgInterval < 300_000) return 300;
		return 180;
	}

	async invalidateAll(): Promise<void> {
		await this.ensureInitialized();
		logger.info('🔄 Invalidating all cache entries');
		if (this.store) {
			await this.store.clearByPattern('*');
		}
		logger.info('✅ Cache invalidated successfully');
	}

	getCurrentTTLConfig(): Record<string, number> {
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

	getRedisClient(): RedisClientType | null {
		return this.store ? this.store.getClient() : null;
	}

	async disconnect(): Promise<void> {
		if (this.store) await this.store.disconnect();
	}
}

export const cacheService = CacheService.getInstance();

export function getSessionCacheTTL(): number {
	return getCategoryTTL(CacheCategory.SESSION);
}
export function getUserPermCacheTTL(): number {
	return getCategoryTTL(CacheCategory.USER);
}
export function getApiCacheTTL(): number {
	return getCategoryTTL(CacheCategory.API);
}
