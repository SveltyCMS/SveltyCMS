/**
 * @file src/databases/CacheService.ts
 * @description Unified caching service for the CMS (in-memory or Redis), with optional tenant-aware keys.
 *
 * Features:
 * - Dynamic cache store selection based on environment configuration
 * - In-memory caching for development and testing
 * - Redis caching for production
 * - Tenant-aware keys for multi-tenant environments
 */

// Safe import for test environment
let browser = false;
try {
	const appEnv = await import('$app/environment');
	browser = appEnv.browser;
} catch {
	// Running in test environment or outside SvelteKit context
	browser = false;
}

import { getPrivateSettingSync } from '@src/services/settingsService';
import type { RedisClientType } from 'redis';
// System Logger - use universal logger for client/server compatibility
import { logger } from '@utils/logger';
import { CacheCategory } from './CacheCategory';

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
			USE_REDIS: USE_REDIS === true, // Ensure boolean type
			URL: `redis://${REDIS_HOST}:${REDIS_PORT}`,
			PASSWORD: REDIS_PASSWORD || undefined,
			RETRY_ATTEMPTS: 3,
			RETRY_DELAY: 2000
		};
	}
	return CACHE_CONFIG;
}

interface ICacheStore {
	initialize(): Promise<void>;
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
	delete(key: string | string[]): Promise<void>;
	clearByPattern(pattern: string): Promise<void>;
	disconnect(): Promise<void>;
	getClient(): RedisClientType | null;
}

class InMemoryStore implements ICacheStore {
	private cache = new Map<string, { value: string; expiresAt: number }>();
	private isInitialized = false;
	private interval: ReturnType<typeof setInterval> | null = null;

	async initialize(): Promise<void> {
		if (this.isInitialized) return;
		this.interval = setInterval(() => this.cleanup(), 60_000);
		this.isInitialized = true;
		logger.info('In-memory cache initialized.');
	}

	private cleanup() {
		const now = Date.now();
		for (const [key, item] of this.cache.entries()) {
			if (item.expiresAt < now) this.cache.delete(key);
		}
	}

	async get<T>(key: string): Promise<T | null> {
		const item = this.cache.get(key);
		if (!item) return null;
		if (item.expiresAt < Date.now()) {
			this.cache.delete(key);
			return null;
		}
		try {
			return JSON.parse(item.value) as T;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		const expiresAt = Date.now() + ttlSeconds * 1000;
		this.cache.set(key, { value: JSON.stringify(value), expiresAt });
	}

	async delete(key: string | string[]): Promise<void> {
		const keys = Array.isArray(key) ? key : [key];
		keys.forEach((k) => this.cache.delete(k));
	}

	async clearByPattern(pattern: string): Promise<void> {
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));
		for (const key of this.cache.keys()) {
			if (regex.test(key)) this.cache.delete(key);
		}
	}

	async disconnect(): Promise<void> {
		this.cache.clear();
		if (this.interval) clearInterval(this.interval);
		this.isInitialized = false;
		logger.info('In-memory cache cleared.');
	}

	getClient(): RedisClientType | null {
		return null;
	}
}

class RedisStore implements ICacheStore {
	private client: RedisClientType | null = null;
	private isInitialized = false;

	async initialize(): Promise<void> {
		if (this.isInitialized || browser) return;
		const config = getCacheConfig();
		if (!config) {
			throw new Error('Cache configuration is not available');
		}

		// Use DatabaseResilience for automatic retry with exponential backoff
		const { getDatabaseResilience } = await import('@src/databases/DatabaseResilience');
		const resilience = getDatabaseResilience({
			maxAttempts: config.RETRY_ATTEMPTS,
			initialDelayMs: config.RETRY_DELAY,
			backoffMultiplier: 2,
			maxDelayMs: 30000, // Max 30s delay
			jitterMs: 500
		});

		try {
			await resilience.executeWithRetry(async () => {
				const { createClient } = await import('redis');
				this.client = createClient({ url: config.URL, password: config.PASSWORD });
				this.client!.on('error', (err) => logger.error('Redis Client Error', err));
				this.client!.on('reconnecting', () => logger.warn('Reconnecting to Redis...'));
				await this.client!.connect();
				this.isInitialized = true;
				logger.info('Redis client connected successfully.');
			}, 'Redis Connection');
		} catch (err) {
			this.isInitialized = false;
			throw err;
		}
	}

	private async ensureReady(): Promise<void> {
		if (!this.client || !this.isInitialized) {
			throw new Error('Redis client is not initialized. Call initialize() first.');
		}
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}

	async get<T>(key: string): Promise<T | null> {
		await this.ensureReady();
		const value = await this.client!.get(key);
		try {
			return value ? (JSON.parse(value) as T) : null;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		await this.ensureReady();
		await this.client!.set(key, JSON.stringify(value), { EX: ttlSeconds });
	}

	async delete(key: string | string[]): Promise<void> {
		await this.ensureReady();
		if (Array.isArray(key)) await this.client!.del(key);
		else await this.client!.del(key);
	}

	async clearByPattern(pattern: string): Promise<void> {
		await this.ensureReady();
		let cursor: string = '0';
		do {
			const result = await this.client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
			cursor = result.cursor; // Redis returns cursor as string
			if (result.keys.length > 0) await this.client!.del(result.keys);
		} while (cursor !== '0');
	}

	async disconnect(): Promise<void> {
		if (this.client?.isOpen) {
			try {
				await this.client.quit();
			} catch (e) {
				logger.warn('Error during Redis disconnect:', e);
			}
		}
		this.isInitialized = false;
		logger.info('Redis connection closed.');
	}

	getClient(): RedisClientType | null {
		return this.client;
	}
}

class CacheService {
	private static instance: CacheService;
	private store: ICacheStore | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private prefetchPatterns: PrefetchPattern[] = [];
	private accessLog: Map<string, number[]> = new Map(); // Track access times for analytics
	private bootstrapping = true; // Default to true on startup

	private constructor() {
		// Store is initialized lazily in initialize() to ensure settings are available
	}

	static getInstance(): CacheService {
		if (!CacheService.instance) CacheService.instance = new CacheService();
		return CacheService.instance;
	}

	/**
	 * Sets the bootstrapping state. When true, metrics and some heavy logs may be disabled.
	 */
	setBootstrapping(val: boolean): void {
		this.bootstrapping = val;
		if (!val) {
			logger.info('CacheService: Bootstrapping complete. Metrics and full logging enabled.');
		}
	}

	/**
	 * Checks if the service is currently bootstrapping.
	 */
	isBootstrapping(): boolean {
		return this.bootstrapping;
	}

	async initialize(force = false): Promise<void> {
		if (this.initialized && !force) return;
		if (!this.initPromise || force) {
			this.initPromise = (async () => {
				try {
					// Ensure we have the latest config if forced or if store not set
					const config = getCacheConfig(force);

					// Initialize or switch store if needed
					const desiredStoreType = !browser && config.USE_REDIS ? RedisStore : InMemoryStore;

					if (!this.store || !(this.store instanceof desiredStoreType) || force) {
						if (this.store) {
							await this.store.disconnect();
						}
						this.store = new desiredStoreType();
					}

					await this.store.initialize();
					this.initialized = true;
					logger.info(`CacheService initialized successfully (${config.USE_REDIS ? 'Redis' : 'In-Memory'}).`);
				} catch (error) {
					logger.error('CacheService initialization failed:', error);
					this.initPromise = null; // Allow retry
					throw error;
				}
			})();
		}
		return this.initPromise;
	}

	/**
	 * Reconfigures the cache service with new settings.
	 * Useful after setup completion or settings update.
	 */
	async reconfigure(): Promise<void> {
		logger.info('🔄 Reconfiguring CacheService...');
		this.initialized = false;
		return this.initialize(true);
	}

	private async ensureInitialized() {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	private generateKey(baseKey: string, tenantId?: string): string {
		// If the caller already supplied a fully-qualified tenant-prefixed key, respect it
		if (baseKey.startsWith('tenant:')) return baseKey;
		if (getPrivateSettingSync('MULTI_TENANT')) {
			const tenant = tenantId || 'default';
			return `tenant:${tenant}:${baseKey}`;
		}
		return baseKey;
	}

	// Track cache access for analytics and predictive prefetching
	private trackAccess(key: string): void {
		const now = Date.now();
		const accesses = this.accessLog.get(key) || [];
		accesses.push(now);

		// Keep only last 100 accesses per key
		if (accesses.length > 100) {
			accesses.shift();
		}

		this.accessLog.set(key, accesses);
	}

	// Check if a key should be predictively prefetched based on patterns
	private async checkPrefetch(key: string, tenantId?: string): Promise<void> {
		for (const pattern of this.prefetchPatterns) {
			if (pattern.pattern.test(key)) {
				const keysToFetch = pattern.prefetchKeys(key);
				if (keysToFetch.length > 0 && pattern.fetcher) {
					// Execute prefetch in background
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
		tenantId?: string
	): Promise<void> {
		try {
			// 1. Filter out keys that are already cached
			const missingKeys: string[] = [];
			for (const key of keys) {
				// const cached = await this.get(key, tenantId); // This tracks access, might skew analytics?
				// Actually, we should check existence without tracking access if possible, or just accept it.
				// For now, let's just fetch everything to be safe and ensure freshness,
				// or assume the fetcher is efficient.
				// Optimization: Check cache existence first.
				const fullKey = this.generateKey(key, tenantId);
				const exists = await this.store!.get(fullKey); // Direct store access to avoid recursion/tracking
				if (!exists) {
					missingKeys.push(key);
				}
			}

			if (missingKeys.length === 0) return;

			logger.debug(`Prefetching ${missingKeys.length} missing keys`);

			// 2. Fetch data
			const dataMap = await fetcher(missingKeys);

			// 3. Cache data
			const ttl = category ? getCategoryTTL(category) : REDIS_TTL_S;
			for (const [key, value] of Object.entries(dataMap)) {
				await this.set(key, value, ttl, tenantId, category);
			}
		} catch (error) {
			logger.warn('Predictive prefetch failed:', error);
		}
	}

	async get<T>(baseKey: string, tenantId?: string, _category?: CacheCategory): Promise<T | null> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);

		// Track access
		this.trackAccess(key);

		// Check for predictive prefetch opportunities
		void this.checkPrefetch(key, tenantId);

		return this.store!.get<T>(key);
	}

	async set<T>(baseKey: string, value: T, ttlSeconds: number, tenantId?: string, category?: CacheCategory): Promise<void> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);

		// Use category-specific TTL if category provided and no explicit TTL
		const finalTTL = category && ttlSeconds === 0 ? getCategoryTTL(category) : ttlSeconds;

		await this.store!.set<T>(key, value, finalTTL);
	}

	// Set with automatic category-based TTL
	async setWithCategory<T>(baseKey: string, value: T, category: CacheCategory, tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		const ttl = getCategoryTTL(category);
		await this.store!.set<T>(key, value, ttl);
	}

	async delete(baseKey: string | string[], tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const keys = Array.isArray(baseKey) ? baseKey.map((k) => this.generateKey(k, tenantId)) : this.generateKey(baseKey, tenantId);
		await this.store!.delete(keys);
	}

	async clearByPattern(pattern: string, tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const keyPattern = this.generateKey(pattern, tenantId);
		await this.store!.clearByPattern(keyPattern);
	}

	/**
	 * Warm cache with critical data
	 * Useful for preloading frequently accessed data on startup
	 */
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

	/**
	 * Register a predictive prefetch pattern
	 * When a key matching the pattern is accessed, related keys will be prefetched
	 */
	registerPrefetchPattern(pattern: PrefetchPattern): void {
		this.prefetchPatterns.push(pattern);
		logger.info(`Registered prefetch pattern: ${pattern.pattern.source}`);
	}

	// Get cache access analytics
	getAccessAnalytics(key: string): { count: number; avgInterval: number; lastAccess: number } | null {
		const accesses = this.accessLog.get(key);
		if (!accesses || accesses.length === 0) return null;

		const count = accesses.length;
		const lastAccess = accesses[accesses.length - 1];

		// Calculate average interval between accesses
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
	getRecommendedTTL(key: string): number | null {
		const analytics = this.getAccessAnalytics(key);
		if (!analytics) return null;

		// If accessed frequently (avgInterval < 1 minute), use longer TTL
		if (analytics.avgInterval < 60000) {
			return 600; // 10 minutes
		}

		// If accessed moderately (1-5 minutes), use medium TTL
		if (analytics.avgInterval < 300000) {
			return 300; // 5 minutes
		}

		// Otherwise use short TTL
		return 180; // 3 minutes
	}

	/**
	 * Invalidate all cached data to force refresh
	 * Useful when TTL settings are changed via the settings UI
	 */
	async invalidateAll(): Promise<void> {
		await this.ensureInitialized();
		logger.info('🔄 Invalidating all cache entries due to configuration change');

		// For in-memory cache, we can just clear everything
		if (this.store instanceof InMemoryStore) {
			await this.store.disconnect();
			await this.store.initialize();
		} else if (this.store instanceof RedisStore) {
			// For Redis, clear by pattern (all keys)
			await this.store.clearByPattern('*');
		}

		logger.info('✅ Cache invalidated successfully');
	}

	/**
	 * Get current TTL configuration for all categories
	 * Useful for displaying in admin UI
	 */
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
		if (this.store) {
			await this.store.disconnect();
		}
	}
}

export const cacheService = CacheService.getInstance();

// Helper functions to get dynamic TTLs from database settings
// These allow runtime changes without server restart

/**
 * Get SESSION cache TTL from database settings
 * @returns TTL in seconds (default: 86400 = 24 hours)
 */
export function getSessionCacheTTL(): number {
	return getCategoryTTL(CacheCategory.SESSION);
}

/**
 * Get USER permissions cache TTL from database settings
 * @returns TTL in seconds (default: 60 = 1 minute)
 */
export function getUserPermCacheTTL(): number {
	return getCategoryTTL(CacheCategory.USER);
}

/**
 * Get API response cache TTL from database settings
 * @returns TTL in seconds (default: 300 = 5 minutes)
 */
export function getApiCacheTTL(): number {
	return getCategoryTTL(CacheCategory.API);
}

// Legacy exports for backward compatibility - now use dynamic values
// Millisecond versions
export const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Default: 24 hours
export const USER_PERM_CACHE_TTL_MS = 60 * 1000; // Default: 1 minute
export const USER_COUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (not dynamically configured yet)
export const API_CACHE_TTL_MS = 5 * 60 * 1000; // Default: 5 minutes
// Second versions - use getter functions for dynamic values
export const SESSION_CACHE_TTL_S = Math.ceil(SESSION_CACHE_TTL_MS / 1000);
export const USER_PERM_CACHE_TTL_S = Math.ceil(USER_PERM_CACHE_TTL_MS / 1000);
export const USER_COUNT_CACHE_TTL_S = Math.ceil(USER_COUNT_CACHE_TTL_MS / 1000);
export const API_CACHE_TTL_S = Math.ceil(API_CACHE_TTL_MS / 1000);
// Generic Redis TTL
export const REDIS_TTL_S = 300; // 5 minutes in seconds for Redis

/**
 * Cache category TTLs - Configurable via database settings
 * Defaults are used if not configured in the database
 */
// CacheCategory enum now imported from ./CacheCategory.ts

// Default TTLs (in seconds) if not configured in database
const DEFAULT_CATEGORY_TTLS: Record<CacheCategory, number> = {
	[CacheCategory.SCHEMA]: 600, // 10 minutes - schemas change rarely
	[CacheCategory.WIDGET]: 600, // 10 minutes - widget configs are relatively stable
	[CacheCategory.THEME]: 300, // 5 minutes - themes may update occasionally
	[CacheCategory.CONTENT]: 180, // 3 minutes - content updates frequently
	[CacheCategory.MEDIA]: 300, // 5 minutes - media metadata is fairly stable
	[CacheCategory.SESSION]: 86400, // 24 hours - user sessions
	[CacheCategory.USER]: 60, // 1 minute - user permissions (frequently checked)
	[CacheCategory.API]: 300 // 5 minutes - API responses
};

/**
 * Gets the TTL for a specific cache category
 * Checks database settings first (dynamically), falls back to defaults
 * This allows users to change TTLs via the settings UI without restarting
 */
function getCategoryTTL(category: CacheCategory): number {
	// Map category to config key
	const configKey = `CACHE_TTL_${category.toUpperCase()}` as
		| 'CACHE_TTL_SCHEMA'
		| 'CACHE_TTL_WIDGET'
		| 'CACHE_TTL_THEME'
		| 'CACHE_TTL_CONTENT'
		| 'CACHE_TTL_MEDIA'
		| 'CACHE_TTL_SESSION'
		| 'CACHE_TTL_USER'
		| 'CACHE_TTL_API';

	try {
		// Try to get from dynamic settings (allows runtime changes)
		const configuredTTL = getPrivateSettingSync(configKey);

		if (typeof configuredTTL === 'number' && configuredTTL > 0) {
			return configuredTTL;
		}
	} catch (error) {
		// If settings not loaded yet, fall through to defaults
		logger.debug(`Failed to get TTL for ${category}, using default:`, error);
	}

	// Fall back to default TTL
	return DEFAULT_CATEGORY_TTLS[category];
}

// Interface for cache warming configuration
interface WarmCacheConfig {
	keys: string[];
	fetcher: () => Promise<unknown>;
	category?: CacheCategory;
	tenantId?: string;
}

// Interface for predictive prefetch configuration
interface PrefetchPattern {
	pattern: RegExp;
	prefetchKeys: (matchedKey: string) => string[];
	fetcher?: (keys: string[]) => Promise<Record<string, unknown>>; // Function to fetch data for keys
	category?: CacheCategory;
}
