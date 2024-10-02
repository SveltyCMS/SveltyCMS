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
		} catch (error) {
			const errMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to initialize Redis client: ${errMessage}. Attempt ${attempt} of ${retries}.`);

			redisClient = null;

			if (attempt < retries) {
				logger.info(`Retrying Redis connection in ${delay / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			} else {
				throw new Error('Failed to initialize Redis after maximum retries.');
			}
		}
	}
}

// Ensures that the Redis client is initialized before performing any operations.
async function ensureRedisInitialized() {
	if (browser) {
		throw new Error('Redis operations are not available in browser environment');
	}
	if (!redisClient) {
		throw new Error('Redis client is not initialized');
	}
	await redisClient.connect(); // Ensure that the connection is established.
}

// Handles Redis operation errors by logging them with a clear message.
function handleRedisError(error: unknown, operation: string, key: string): void {
	const errorMessage = error instanceof Error ? error.message : String(error);
	logger.error(`Redis ${operation} error for key ${key}: ${errorMessage}`);
}

// Retrieves a cached value from Redis, with optional decompression.
export async function getCache<T>(key: string): Promise<T | null> {
	if (browser) {
		logger.warn('Attempt to use Redis caching in a browser environment');
		return null;
	}

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
	} catch (error) {
		handleRedisError(error, 'get', key);
		return null;
	}
}

// Sets a value in Redis with optional compression and expiration time.
export async function setCache<T>(key: string, value: T, expirationInSeconds: number = 3600): Promise<void> {
	if (browser) {
		logger.warn('Attempt to use Redis caching in a browser environment');
		return;
	}

	if (!redisClient) {
		logger.warn('Redis client is not initialized. Skipping cache set.');
		return;
	}

	try {
		const jsonValue = JSON.stringify(value);
		if (compress) {
			const compressedValue = await compress(Buffer.from(jsonValue));
			await redisClient.set(key, compressedValue, {
				EX: expirationInSeconds
			});
		} else {
			await redisClient.set(key, jsonValue, {
				EX: expirationInSeconds
			});
		}
	} catch (error) {
		handleRedisError(error, 'set', key);
	}
}

// Deletes a cached value from Redis.
export async function clearCache(key: string): Promise<void> {
	if (browser) {
		logger.warn('Attempt to use Redis caching in a browser environment');
		return;
	}

	if (!redisClient) {
		logger.warn('Redis client is not initialized. Skipping cache clear.');
		return;
	}

	try {
		await redisClient.del(key);
	} catch (error) {
		handleRedisError(error, 'delete', key);
	}
}

// Retrieves a user session from Redis.
export async function getCachedSession(session_id: string): Promise<User | null> {
	return getCache<User>(`session:${session_id}`);
}

// Stores a user session in Redis with an expiration time.
export async function setCachedSession(session_id: string, user: User, expirationInSeconds: number = 3600): Promise<void> {
	await setCache(`session:${session_id}`, user, expirationInSeconds);
}

// Deletes a user session from Redis.
export async function clearCachedSession(session_id: string): Promise<void> {
	await clearCache(`session:${session_id}`);
}

// Closes the Redis client connection gracefully.
export async function closeRedisConnection(): Promise<void> {
	if (browser) {
		logger.warn('Attempt to close Redis connection in a browser environment');
		return;
	}

	if (redisClient) {
		try {
			await redisClient.quit();
			logger.info('Redis connection closed');
		} catch (error) {
			handleRedisError(error, 'quit', '');
		}
	}
}

// Checks if Redis is enabled and initialized.
export function isRedisEnabled(): boolean {
	return !!redisClient;
}
