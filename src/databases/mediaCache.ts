/**
 * @file src/databases/mediaCache.ts
 * @description Caching system for media operations with user cache clearing functionality
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';
import type { MediaType } from '@utils/media/mediaModels';
import { logger } from '@src/utils/logger';
import { error } from '@sveltejs/kit';

interface CacheStore {
	get(key: string): Promise<MediaType | null>;
	set(key: string, value: MediaType, expirationInSeconds: number): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	clearUserCache(userId: string): Promise<void>;
}

class InMemoryMediaCache implements CacheStore {
	private cache: Map<string, { value: MediaType; expiresAt: number }> = new Map();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
	}

	private cleanup() {
		try {
			const now = Date.now();
			for (const [key, item] of this.cache) {
				if (item.expiresAt < now) {
					this.cache.delete(key);
				}
			}
			logger.debug(`Cleaned up expired media cache items. Current count: ${this.cache.size}`);
		} catch (err) {
			const message = `Error in InMemoryMediaCache.cleanup: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
		}
	}

	async get(key: string): Promise<MediaType | null> {
		try {
			const item = this.cache.get(key);
			if (!item || item.expiresAt < Date.now()) {
				return null;
			}
			return item.value;
		} catch (err) {
			const message = `Error in InMemoryMediaCache.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async set(key: string, value: MediaType, expirationInSeconds: number): Promise<void> {
		try {
			this.cache.set(key, {
				value,
				expiresAt: Date.now() + expirationInSeconds * 1000
			});
		} catch (err) {
			const message = `Error in InMemoryMediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async delete(key: string): Promise<void> {
		try {
			this.cache.delete(key);
		} catch (err) {
			const message = `Error in InMemoryMediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clear(): Promise<void> {
		try {
			this.cache.clear();
		} catch (err) {
			const message = `Error in InMemoryMediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clearUserCache(userId: string): Promise<void> {
		try {
			const keysToDelete: string[] = [];
			for (const key of this.cache.keys()) {
				if (key.startsWith(`media:${userId}:`)) {
					keysToDelete.push(key);
				}
			}
			keysToDelete.forEach((key) => this.cache.delete(key));
			logger.info(`Cleared cache for user: ${userId}`);
		} catch (err) {
			const message = `Error in InMemoryMediaCache.clearUserCache: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}

class RedisMediaCache implements CacheStore {
	private redisClient: any;

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
			throw error(500, message);
		}
	}

	async get(key: string): Promise<MediaType | null> {
		try {
			const value = await this.redisClient.get(key);
			return value ? JSON.parse(value) : null;
		} catch (err) {
			const message = `Error in RedisMediaCache.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async set(key: string, value: MediaType, expirationInSeconds: number): Promise<void> {
		try {
			await this.redisClient.setEx(key, expirationInSeconds, JSON.stringify(value));
		} catch (err) {
			const message = `Error in RedisMediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async delete(key: string): Promise<void> {
		try {
			await this.redisClient.del(key);
		} catch (err) {
			const message = `Error in RedisMediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clear(): Promise<void> {
		try {
			await this.redisClient.flushDb();
		} catch (err) {
			const message = `Error in RedisMediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clearUserCache(userId: string): Promise<void> {
		try {
			const keys = await this.redisClient.keys(`media:${userId}:*`);
			for (const key of keys) {
				await this.redisClient.del(key);
			}
			logger.info(`Cleared cache for user: ${userId}`);
		} catch (err) {
			const message = `Error in RedisMediaCache.clearUserCache: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}

export class MediaCache {
	private store: CacheStore;

	constructor() {
		if (!browser && privateEnv.USE_REDIS) {
			this.store = new RedisMediaCache();
		} else {
			this.store = new InMemoryMediaCache();
			logger.info('Using in-memory media cache');
		}
	}

	async get(id: string): Promise<MediaType | null> {
		try {
			return await this.store.get(`media:${id}`);
		} catch (err) {
			const message = `Error in MediaCache.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async set(id: string, media: MediaType): Promise<void> {
		try {
			await this.store.set(`media:${id}`, media, 3600);
		} catch (err) {
			const message = `Error in MediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async delete(id: string): Promise<void> {
		try {
			await this.store.delete(`media:${id}`);
		} catch (err) {
			const message = `Error in MediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clear(): Promise<void> {
		try {
			await this.store.clear();
		} catch (err) {
			const message = `Error in MediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	async clearUserCache(userId: string): Promise<void> {
		try {
			await this.store.clearUserCache(userId);
		} catch (err) {
			const message = `Error in MediaCache.clearUserCache: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}

export const mediaCache = new MediaCache();
