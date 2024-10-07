/**
 * @file src/databases/mediaCache.ts
 * @description Media caching system with support for in-memory and Redis storage
 *
 * This module provides a flexible caching mechanism for media objects, supporting both
 * in-memory caching and Redis-based caching. It includes functionality for setting,
 * retrieving, and clearing cached media items, as well as user-specific cache clearing.
 * The system uses Date objects for expiration times and includes error handling and logging.
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';
import type { MediaType } from '@utils/media/mediaModels';
import { logger } from '@src/utils/logger';
import { error } from '@sveltejs/kit';

// Interface defining the methods required for a cache store
interface CacheStore {
	get(key: string): Promise<MediaType | null>;
	set(key: string, value: MediaType, expiration: Date): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	clearUserCache(userId: string): Promise<void>;
}

// In-memory implementation of the cache store
class InMemoryMediaCache implements CacheStore {
	private cache: Map<string, { value: MediaType; expiresAt: Date }> = new Map();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		// Set up periodic cleanup of expired cache items
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
	}

	// Remove expired items from the cache
	private cleanup() {
		try {
			const now = new Date();
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

	// Retrieve an item from the cache
	async get(key: string): Promise<MediaType | null> {
		try {
			const item = this.cache.get(key);
			if (!item || item.expiresAt < new Date()) {
				return null;
			}
			return item.value;
		} catch (err) {
			const message = `Error in InMemoryMediaCache.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Store an item in the cache with expiration
	async set(key: string, value: MediaType, expiration: Date): Promise<void> {
		try {
			this.cache.set(key, {
				value,
				expiresAt: expiration
			});
		} catch (err) {
			const message = `Error in InMemoryMediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Remove an item from the cache
	async delete(key: string): Promise<void> {
		try {
			this.cache.delete(key);
		} catch (err) {
			const message = `Error in InMemoryMediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all items from the cache
	async clear(): Promise<void> {
		try {
			this.cache.clear();
		} catch (err) {
			const message = `Error in InMemoryMediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all cache items for a specific user
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

// Redis-based implementation of the cache store
class RedisMediaCache implements CacheStore {
	private redisClient: any;

	constructor() {
		this.initializeRedis();
	}

	// Initialize the Redis client
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

	// Retrieve an item from Redis
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

	// Store an item in Redis with expiration
	async set(key: string, value: MediaType, expiration: Date): Promise<void> {
		try {
			const expirationInSeconds = Math.max(0, Math.floor((expiration.getTime() - Date.now()) / 1000));
			await this.redisClient.setEx(key, expirationInSeconds, JSON.stringify(value));
		} catch (err) {
			const message = `Error in RedisMediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Remove an item from Redis
	async delete(key: string): Promise<void> {
		try {
			await this.redisClient.del(key);
		} catch (err) {
			const message = `Error in RedisMediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all items from Redis
	async clear(): Promise<void> {
		try {
			await this.redisClient.flushDb();
		} catch (err) {
			const message = `Error in RedisMediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all cache items for a specific user in Redis
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

// Main MediaCache class that uses either InMemoryMediaCache or RedisMediaCache
export class MediaCache {
	private store: CacheStore;

	constructor() {
		// Choose between Redis and in-memory cache based on environment
		if (!browser && privateEnv.USE_REDIS) {
			this.store = new RedisMediaCache();
		} else {
			this.store = new InMemoryMediaCache();
			logger.info('Using in-memory media cache');
		}
	}

	// Retrieve a media item from the cache
	async get(id: string): Promise<MediaType | null> {
		try {
			return await this.store.get(`media:${id}`);
		} catch (err) {
			const message = `Error in MediaCache.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Store a media item in the cache with a 1-hour expiration
	async set(id: string, media: MediaType): Promise<void> {
		try {
			const expiration = new Date(Date.now() + 3600 * 1000); // 1 hour from now
			await this.store.set(`media:${id}`, media, expiration);
		} catch (err) {
			const message = `Error in MediaCache.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Remove a media item from the cache
	async delete(id: string): Promise<void> {
		try {
			await this.store.delete(`media:${id}`);
		} catch (err) {
			const message = `Error in MediaCache.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all items from the cache
	async clear(): Promise<void> {
		try {
			await this.store.clear();
		} catch (err) {
			const message = `Error in MediaCache.clear: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Clear all cache items for a specific user
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

// Export a single instance of MediaCache for use throughout the application
export const mediaCache = new MediaCache();
