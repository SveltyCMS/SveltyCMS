/**
 * @file src/databases/redis.ts
 * @description Redis client initialization and caching operations for the CMS.
 *
  * This module provides functionality for:
 * - Initializing and managing a Redis client connection
 * - Caching and retrieving data using Redis
 * - Handling session caching specifically for user sessions
 * - Error handling and logging for all Redis operations
 * - Connection management with retry mechanisms
 * - Optional data compression for large cached values
 * - Graceful shutdown of the Redis connection
 *
 * Features:
 * - Conditional Redis initialization based on configuration
 * - Generic caching operations (get, set, clear)
 * - Session-specific caching operations
 * - Centralized configuration management
 * - Improved error handling and logging for consistency
 * - Connection management with retries for reliability
 * - Type safety for Redis client
 * - Optional data compression/decompression
 * - Graceful connection closure
 *
 * Usage:
 * This module is used throughout the application for caching purposes,
 * particularly for improving the performance of frequently accessed data
 * and managing user sessions.

 */

// Import necessary modules
import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';

// Auth
import type { User } from '@src/auth/types';

// Redis
import type { RedisClientType } from 'redis';
let redisClient: RedisClientType | null = null;

// System logger
import { logger } from '@src/utils/logger';

// Centralized Redis configuration
const redisConfig = {
	url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
	password: privateEnv.REDIS_PASSWORD || undefined,
	useRedis: privateEnv.USE_REDIS,
	retryAttempts: 3,
	retryDelay: 2000
};

// Initialize compression/decompression only on server-side
let compress: (buffer: Buffer) => Promise<Buffer>;
let decompress: (buffer: Buffer) => Promise<Buffer>;

// Conditionally import Node.js modules for server-side usage
if (!browser) {
	import('util').then(({ promisify }) => {
		import('zlib').then(({ gzip, gunzip }) => {
			compress = promisify(gzip);
			decompress = promisify(gunzip);
		});
	});
}

// Initializes the Redis client with retry mechanism.
export async function initializeRedis(retries = redisConfig.retryAttempts, delay = redisConfig.retryDelay): Promise<void> {
	if (browser || !redisConfig.useRedis) {
		logger.info('Redis is disabled or running in a browser environment');
		return;
	}

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const { createClient } = await import('redis');
			redisClient = createClient({
				url: redisConfig.url,
				password: redisConfig.password
			});

			await redisClient.connect();
			logger.info('Redis client connected successfully');

			redisClient.on('error', (err) => logger.error('Redis Client Error', err));
			return; // Exit function if connection is successful
		} catch (err) {
			const message = `Error in initializeRedis: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);

			redisClient = null;

			if (attempt < retries) {
				logger.info(`Retrying Redis connection in ${delay / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			} else {
				throw error(500, message);
			}
		}
	}
}

// Ensures that the Redis client is initialized before performing any operations.
async function ensureRedisInitialized() {
	if (browser) {
		const message = 'Error in ensureRedisInitialized: Redis operations are not available in browser environment';
		logger.error(message);
		throw error(500, message);
	}
	if (!redisClient) {
		const message = 'Error in ensureRedisInitialized: Redis client is not initialized';
		logger.error(message);
		throw error(500, message);
	}
	await redisClient.connect(); // Ensure that the connection is established.
}

// Retrieves a cached value from Redis, with optional decompression.
export async function getCache<T>(key: string): Promise<T | null> {
	try {
		await ensureRedisInitialized();
		const value = await redisClient!.get(key);
		if (value) {
			if (decompress) {
				const decompressedValue = await decompress(Buffer.from(value));
				return JSON.parse(decompressedValue.toString('utf-8')) as T;
			}
			return JSON.parse(value) as T;
		}
		return null;
	} catch (err) {
		const message = `Error in getCache: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Sets a value in Redis with optional compression and expiration time.
export async function setCache<T>(key: string, value: T, expiration: Date): Promise<void> {
	try {
		await ensureRedisInitialized();
		const jsonValue = JSON.stringify(value);
		const expirationInSeconds = Math.max(0, Math.floor((expiration.getTime() - Date.now()) / 1000));

		if (compress) {
			const compressedValue = await compress(Buffer.from(jsonValue));
			await redisClient!.set(key, compressedValue, {
				EX: expirationInSeconds
			});
		} else {
			await redisClient!.set(key, jsonValue, {
				EX: expirationInSeconds
			});
		}
		logger.debug('Cache set', { key, expiration: expiration.toISOString() });
	} catch (err) {
		const message = `Error in setCache: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Deletes a cached value from Redis.
export async function clearCache(key: string): Promise<void> {
	try {
		await ensureRedisInitialized();
		await redisClient!.del(key);
		logger.debug('Cache cleared', { key });
	} catch (err) {
		const message = `Error in clearCache: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Retrieves a user session from Redis.
export async function getCachedSession(session_id: string): Promise<User | null> {
	return getCache<User>(`session:${session_id}`);
}

// Stores a user session in Redis with an expiration date.
export async function setCachedSession(session_id: string, user: User, expiration: Date): Promise<void> {
	await setCache(`session:${session_id}`, user, expiration);
}

// Deletes a user session from Redis.
export async function clearCachedSession(session_id: string): Promise<void> {
	await clearCache(`session:${session_id}`);
}

// Closes the Redis client connection gracefully.
export async function closeRedisConnection(): Promise<void> {
	if (redisClient) {
		try {
			await redisClient.quit();
			logger.info('Redis connection closed');
		} catch (err) {
			const message = `Error in closeRedisConnection: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}

// Checks if Redis is enabled and initialized.
export function isRedisEnabled(): boolean {
	return !!redisClient;
}
