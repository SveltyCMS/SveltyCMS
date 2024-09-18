/**
 * @file src/databases/mediaCache.ts
 * @description Caching system for media operations with user cache clearing functionality
 */

import { privateEnv } from '@root/config/private'; // Import private environment configuration
import { browser } from '$app/environment'; // Detect if the code is running in a browser
import type { MediaType } from '@utils/media/mediaModels'; // Import MediaType for type safety
import logger from '@src/utils/logger'; // Custom logger utility

// Interface for the cache storage methods
interface CacheStore {
	get(key: string): Promise<MediaType | null>; // Get a cached item by key
	set(key: string, value: MediaType, expirationInSeconds: number): Promise<void>; // Set a cached item with expiration
	delete(key: string): Promise<void>; // Delete a cached item by key
	clear(): Promise<void>; // Clear the entire cache
	clearUserCache(userId: string): Promise<void>; // Clear cache for a specific user
}

// In-memory cache class implementing CacheStore
class InMemoryMediaCache implements CacheStore {
	private cache: Map<string, { value: MediaType; expiresAt: number }> = new Map(); // Stores cached items with expiration times
	private cleanupInterval: NodeJS.Timeout; // Interval for cleaning up expired cache items

	constructor() {
		// Set interval for automatic cache cleanup
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Default to 1 minute
	}

	// Clean up expired cache items
	private cleanup() {
		const now = Date.now(); // Get the current time
		for (const [key, item] of this.cache) {
			if (item.expiresAt < now) {
				this.cache.delete(key); // Delete expired items
			}
		}
		logger.debug(`Cleaned up expired media cache items. Current count: ${this.cache.size}`); // Log the cleanup action
	}

	// Retrieve an item from the cache by key
	async get(key: string): Promise<MediaType | null> {
		const item = this.cache.get(key); // Get the item by key
		if (!item || item.expiresAt < Date.now()) {
			return null; // Return null if item is expired or not found
		}
		return item.value; // Return the cached value
	}

	// Add an item to the cache with expiration
	async set(key: string, value: MediaType, expirationInSeconds: number): Promise<void> {
		this.cache.set(key, {
			value, // Store the value
			expiresAt: Date.now() + expirationInSeconds * 1000 // Set expiration time
		});
	}

	// Delete an item from the cache by key
	async delete(key: string): Promise<void> {
		this.cache.delete(key); // Remove the item from the cache
	}

	// Clear the entire cache
	async clear(): Promise<void> {
		this.cache.clear(); // Clear all cache entries
	}

	// Clear cache entries for a specific user
	async clearUserCache(userId: string): Promise<void> {
		const keysToDelete: string[] = []; // List of keys to be deleted
		for (const key of this.cache.keys()) {
			if (key.startsWith(`media:${userId}:`)) {
				keysToDelete.push(key); // Add keys matching the user to the list
			}
		}
		keysToDelete.forEach((key) => this.cache.delete(key)); // Delete all user-specific cache entries
		logger.info(`Cleared cache for user: ${userId}`); // Log the user cache clearing
	}
}

// Redis-based cache class implementing CacheStore
class RedisMediaCache implements CacheStore {
	private redisClient: any; // Redis client instance

	constructor() {
		this.initializeRedis(); // Initialize the Redis client
	}

	// Initialize the Redis client
	private async initializeRedis() {
		try {
			const { createClient } = await import('redis'); // Dynamically import Redis client
			this.redisClient = createClient({
				url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`, // Use Redis host and port from environment variables
				password: privateEnv.REDIS_PASSWORD // Use Redis password from environment variables
			});
			await this.redisClient.connect(); // Connect to Redis
			logger.info('Redis media cache initialized'); // Log Redis initialization success
		} catch (error) {
			logger.error(`Failed to initialize Redis media cache: ${(error as Error).message}`); // Log Redis initialization failure
			throw error;
		}
	}

	// Retrieve an item from Redis cache by key
	async get(key: string): Promise<MediaType | null> {
		const value = await this.redisClient.get(key); // Get the cached value from Redis
		return value ? JSON.parse(value) : null; // Parse and return the value, or null if not found
	}

	// Add an item to the Redis cache with expiration
	async set(key: string, value: MediaType, expirationInSeconds: number): Promise<void> {
		await this.redisClient.setEx(key, expirationInSeconds, JSON.stringify(value)); // Store the value with expiration
	}

	// Delete an item from Redis cache by key
	async delete(key: string): Promise<void> {
		await this.redisClient.del(key); // Remove the item from Redis
	}

	// Clear the entire Redis cache
	async clear(): Promise<void> {
		await this.redisClient.flushDb(); // Flush the entire Redis database
	}

	// Clear cache entries for a specific user in Redis
	async clearUserCache(userId: string): Promise<void> {
		const keys = await this.redisClient.keys(`media:${userId}:*`); // Get all user-specific keys
		for (const key of keys) {
			await this.redisClient.del(key); // Delete each user-specific key
		}
		logger.info(`Cleared cache for user: ${userId}`); // Log the user cache clearing
	}
}

// MediaCache class to manage cache storage (in-memory or Redis)
export class MediaCache {
	private store: CacheStore; // Cache storage interface

	constructor() {
		// Use Redis cache if running on server and Redis is configured, otherwise use in-memory cache
		if (!browser && privateEnv.USE_REDIS) {
			this.store = new RedisMediaCache();
		} else {
			this.store = new InMemoryMediaCache();
			logger.info('Using in-memory media cache'); // Log the selected cache store
		}
	}

	// Retrieve a media item from cache
	async get(id: string): Promise<MediaType | null> {
		return this.store.get(`media:${id}`); // Get media item by ID
	}

	// Add a media item to the cache
	async set(id: string, media: MediaType): Promise<void> {
		await this.store.set(`media:${id}`, media, 3600); // Default expiration to 1 hour
	}

	// Delete a media item from cache
	async delete(id: string): Promise<void> {
		await this.store.delete(`media:${id}`); // Delete media item by ID
	}

	// Clear the entire cache
	async clear(): Promise<void> {
		await this.store.clear(); // Clear all cache entries
	}

	// Clear cache for a specific user
	async clearUserCache(userId: string): Promise<void> {
		await this.store.clearUserCache(userId); // Clear user-specific cache entries
	}
}

// Export the mediaCache instance
export const mediaCache = new MediaCache();
