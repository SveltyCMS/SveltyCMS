/**
 * @file src/databases/mediaCache.ts
 * @description Media caching system with support for in-memory and Redis storage.
 * This module is now multi-tenant aware, ensuring cache isolation between tenants.
 *
 * This module provides a flexible caching mechanism for media objects, supporting both
 * in-memory caching and Redis-based caching. It includes functionality for setting,
 * retrieving, and clearing cached media items, as well as user-specific cache clearing.
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';
import type { MediaType } from '@utils/media/mediaModels';
import type { RedisClientType } from 'redis';

// System Logger
import { logger } from '@utils/logger.svelte';

// Helper to generate tenant-aware cache keys
function generateKey(baseKey: string, tenantId?: string): string {
	if (privateEnv.MULTI_TENANT) {
		if (!tenantId) {
			throw new Error('Tenant ID is required for cache operations in multi-tenant mode.');
		}
		return `tenant:${tenantId}:${baseKey}`;
	}
	return baseKey;
}

// Interface defining the methods required for a cache store
interface CacheStore {
	get(key: string): Promise<MediaType | null>;
	set(key: string, value: MediaType, expiration: Date): Promise<void>;
	delete(key: string): Promise<void>;
	clear(tenantId?: string): Promise<void>;
	clearUserCache(userId: string, tenantId?: string): Promise<void>;
}

// In-memory implementation of the cache store
class InMemoryMediaCache implements CacheStore {
	private cache: Map<string, { value: MediaType; expiresAt: Date }> = new Map();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
	}

	private cleanup() {
		const now = new Date();
		for (const [key, item] of this.cache) {
			if (item.expiresAt < now) {
				this.cache.delete(key);
			}
		}
	}

	async get(key: string): Promise<MediaType | null> {
		const item = this.cache.get(key);
		if (!item || item.expiresAt < new Date()) {
			return null;
		}
		return item.value;
	}

	async set(key: string, value: MediaType, expiration: Date): Promise<void> {
		this.cache.set(key, { value, expiresAt: expiration });
	}

	async delete(key: string): Promise<void> {
		this.cache.delete(key);
	}

	async clear(tenantId?: string): Promise<void> {
		if (privateEnv.MULTI_TENANT && tenantId) {
			const prefix = `tenant:${tenantId}:`;
			const keysToDelete = [...this.cache.keys()].filter((key) => key.startsWith(prefix));
			keysToDelete.forEach((key) => this.cache.delete(key));
		} else if (!privateEnv.MULTI_TENANT) {
			this.cache.clear();
		}
	}

	async clearUserCache(userId: string, tenantId?: string): Promise<void> {
		const pattern = generateKey(`media:user:${userId}:*`, tenantId);
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));
		const keysToDelete: string[] = [];
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				keysToDelete.push(key);
			}
		}
		keysToDelete.forEach((key) => this.cache.delete(key));
	}
}

// Redis-based implementation of the cache store
class RedisMediaCache implements CacheStore {
	private redisClient: RedisClientType;

	constructor() {
		this.initializeRedis();
	}

	private async initializeRedis() {
		try {
			const { createClient } = await import('redis');
			this.redisClient = createClient({
				url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
				password: privateEnv.REDIS_PASSWORD
			});
			await this.redisClient.connect();
			logger.info('Redis media cache initialized');
		} catch (err) {
			const message = `Error in RedisMediaCache.initializeRedis: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw new Error(message);
		}
	}

	async get(key: string): Promise<MediaType | null> {
		const value = await this.redisClient.get(key);
		return value ? JSON.parse(value) : null;
	}

	async set(key: string, value: MediaType, expiration: Date): Promise<void> {
		const expirationSeconds = Math.max(0, Math.floor((expiration.getTime() - Date.now()) / 1000));
		await this.redisClient.set(key, JSON.stringify(value), { EX: expirationSeconds });
	}

	async delete(key: string): Promise<void> {
		await this.redisClient.del(key);
	}

	private async clearByPattern(pattern: string): Promise<void> {
		let cursor = 0;
		do {
			const result = await this.redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
			cursor = result.cursor;
			if (result.keys.length > 0) {
				await this.redisClient.del(result.keys);
			}
		} while (cursor !== 0);
	}

	async clear(tenantId?: string): Promise<void> {
		if (privateEnv.MULTI_TENANT && tenantId) {
			await this.clearByPattern(`tenant:${tenantId}:*`);
		} else if (!privateEnv.MULTI_TENANT) {
			await this.redisClient.flushDb();
		}
	}

	async clearUserCache(userId: string, tenantId?: string): Promise<void> {
		const pattern = generateKey(`media:user:${userId}:*`, tenantId);
		await this.clearByPattern(pattern);
	}
}

// Main MediaCache class that uses either InMemoryMediaCache or RedisMediaCache
export class MediaCache {
	private store: CacheStore;

	constructor() {
		if (!browser && privateEnv.USE_REDIS) {
			this.store = new RedisMediaCache();
		} else {
			this.store = new InMemoryMediaCache();
		}
	}

	async get(id: string, tenantId?: string): Promise<MediaType | null> {
		const key = generateKey(`media:${id}`, tenantId);
		return await this.store.get(key);
	}

	async set(id: string, media: MediaType, tenantId?: string): Promise<void> {
		const key = generateKey(`media:${id}`, tenantId);
		const expiration = new Date(Date.now() + 3600 * 1000); // 1 hour
		await this.store.set(key, media, expiration);
	}

	async delete(id: string, tenantId?: string): Promise<void> {
		const key = generateKey(`media:${id}`, tenantId);
		await this.store.delete(key);
	}

	async clear(tenantId?: string): Promise<void> {
		await this.store.clear(tenantId);
	}

	async clearUserCache(userId: string, tenantId?: string): Promise<void> {
		await this.store.clearUserCache(userId, tenantId);
	}
}

export const mediaCache = new MediaCache();
