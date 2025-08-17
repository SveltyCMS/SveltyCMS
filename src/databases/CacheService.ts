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

import { browser } from '$app/environment';
import { privateEnv } from '@root/config/private';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { RedisClientType } from 'redis';

const CACHE_CONFIG = {
	USE_REDIS: privateEnv.USE_REDIS,
	URL: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
	PASSWORD: privateEnv.REDIS_PASSWORD || undefined,
	RETRY_ATTEMPTS: 3,
	RETRY_DELAY: 2000
};

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
		return JSON.parse(item.value) as T;
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
		for (let attempt = 1; attempt <= CACHE_CONFIG.RETRY_ATTEMPTS; attempt++) {
			try {
				const { createClient } = await import('redis');
				this.client = createClient({ url: CACHE_CONFIG.URL, password: CACHE_CONFIG.PASSWORD });
				this.client.on('error', (err) => logger.error('Redis Client Error', err));
				this.client.on('reconnecting', () => logger.warn('Reconnecting to Redis...'));
				await this.client.connect();
				this.isInitialized = true;
				logger.info('Redis client connected successfully.');
				return;
			} catch (err) {
				logger.error(`Redis connection attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
				if (attempt === CACHE_CONFIG.RETRY_ATTEMPTS) {
					throw new Error(`Failed to initialize Redis after ${CACHE_CONFIG.RETRY_ATTEMPTS} attempts.`);
				}
				await new Promise((r) => setTimeout(r, CACHE_CONFIG.RETRY_DELAY));
			}
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
		return value ? (JSON.parse(value) as T) : null;
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
		let cursor = 0;
		do {
			const result = await this.client!.scan(cursor, { MATCH: pattern, COUNT: 100 });
			cursor = result.cursor;
			if (result.keys.length > 0) await this.client!.del(result.keys);
		} while (cursor !== 0);
	}

	async disconnect(): Promise<void> {
		if (this.client?.isOpen) await this.client.quit();
		this.isInitialized = false;
		logger.info('Redis connection closed.');
	}

	getClient(): RedisClientType | null {
		return this.client;
	}
}

class CacheService {
	private static instance: CacheService;
	private store: ICacheStore;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	private constructor() {
		this.store = !browser && CACHE_CONFIG.USE_REDIS ? new RedisStore() : new InMemoryStore();
	}

	static getInstance(): CacheService {
		if (!CacheService.instance) CacheService.instance = new CacheService();
		return CacheService.instance;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		if (!this.initPromise) {
			this.initPromise = this.store.initialize().then(() => {
				this.initialized = true;
			});
		}
		await this.initPromise;
	}

	private async ensureInitialized() {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	private generateKey(baseKey: string, tenantId?: string): string {
		// If the caller already supplied a fully-qualified tenant-prefixed key, respect it
		if (baseKey.startsWith('tenant:')) return baseKey;
		if (privateEnv.MULTI_TENANT) {
			const tenant = tenantId || 'default';
			return `tenant:${tenant}:${baseKey}`;
		}
		return baseKey;
	}

	async get<T>(baseKey: string, tenantId?: string): Promise<T | null> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		return this.store.get<T>(key);
	}

	async set<T>(baseKey: string, value: T, ttlSeconds: number, tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const key = this.generateKey(baseKey, tenantId);
		await this.store.set<T>(key, value, ttlSeconds);
	}

	async delete(baseKey: string | string[], tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const keys = Array.isArray(baseKey) ? baseKey.map((k) => this.generateKey(k, tenantId)) : this.generateKey(baseKey, tenantId);
		await this.store.delete(keys);
	}

	async clearByPattern(pattern: string, tenantId?: string): Promise<void> {
		await this.ensureInitialized();
		const keyPattern = this.generateKey(pattern, tenantId);
		await this.store.clearByPattern(keyPattern);
	}

	getRedisClient(): RedisClientType | null {
		return this.store.getClient();
	}

	async disconnect(): Promise<void> {
		await this.store.disconnect();
	}
}

export const cacheService = CacheService.getInstance();

// Centralized TTLs used across hooks and services
// Session cache (e.g., session validation, cookies)
export const SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SESSION_CACHE_TTL_S = Math.ceil(SESSION_CACHE_TTL_MS / 1000);
// Authorization/admin caches
export const USER_PERM_CACHE_TTL_MS = 60 * 1000; // 1 minute
export const USER_PERM_CACHE_TTL_S = Math.ceil(USER_PERM_CACHE_TTL_MS / 1000);
export const USER_COUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const USER_COUNT_CACHE_TTL_S = Math.ceil(USER_COUNT_CACHE_TTL_MS / 1000);
// API response cache
export const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const API_CACHE_TTL_S = Math.ceil(API_CACHE_TTL_MS / 1000);
// Generic Redis TTL for content or other areas that prefer seconds
export const REDIS_TTL_S = 300; // 5 minutes in seconds for Redis
