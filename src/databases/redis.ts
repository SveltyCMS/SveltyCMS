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
 * - CMS-specific caching utilities
 *
 * Usage:
 * This module is used throughout the application for caching purposes,
 * particularly for improving the performance of frequently accessed data
 * managing user sessions, and caching CMS-specific content.
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
import { logger } from '@utils/logger.svelte';

// Redis configuration interface
interface RedisConfig {
	url: string;
	password?: string;
	useRedis: boolean;
	retryAttempts: number;
	retryDelay: number;
	defaultTTL: number;
}

// Centralized Redis configuration
const redisConfig: RedisConfig = {
	url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
	password: privateEnv.REDIS_PASSWORD || undefined,
	useRedis: privateEnv.USE_REDIS,
	retryAttempts: 3,
	retryDelay: 2000, // 2 seconds
	defaultTTL: 3600 // 1 hour default TTL
};

// Compression utilities (server-side only)
let compress: ((buffer: Buffer) => Promise<Buffer>) | undefined;
let decompress: ((buffer: Buffer) => Promise<Buffer>) | undefined;

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
export async function initializeRedis(): Promise<void> {
	if (browser || !redisConfig.useRedis) {
		logger.info('Redis is disabled or running in a browser environment');
		return;
	}

	for (let attempt = 1; attempt <= redisConfig.retryAttempts; attempt++) {
		try {
			const { createClient } = await import('redis');
			redisClient = createClient({
				url: redisConfig.url,
				password: redisConfig.password
			});

			redisClient.on('error', (err) => logger.error('Redis Client Error', err));
			redisClient.on('reconnecting', () => logger.info('Reconnecting to Redis...'));

			await redisClient.connect();
			logger.info('Redis client connected successfully');
			return;
		} catch (err) {
			logger.error(`Redis connection attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);

			if (attempt === redisConfig.retryAttempts) {
				throw error(500, `Failed to initialize Redis after ${redisConfig.retryAttempts} attempts`);
			}

			await new Promise((resolve) => setTimeout(resolve, redisConfig.retryDelay));
		}
	}
}

// Ensure Redis is initialized before operations
async function ensureRedisInitialized(): Promise<void> {
	if (browser) {
		throw error(500, 'Redis operations are not available in browser environment');
	}
	if (!redisClient) {
		throw error(500, 'Redis client is not initialized');
	}
	if (!redisClient.isOpen) {
		try {
			await redisClient.connect();
		} catch (err) {
			throw error(500, `Failed to connect to Redis: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
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
		logger.error(`Error in getCache: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

// Sets a value in Redis with optional compression and TTL.// Sets a value in Redis with optional compression and TTL.
export async function setCache<T>(key: string, value: T, ttl: number = redisConfig.defaultTTL): Promise<void> {
	try {
		await ensureRedisInitialized();
		const jsonValue = JSON.stringify(value);

		if (compress) {
			const compressedValue = await compress(Buffer.from(jsonValue));
			await redisClient!.set(key, compressedValue, { EX: ttl });
		} else {
			await redisClient!.set(key, jsonValue, { EX: ttl });
		}
		logger.debug('Cache set', { key, ttl });
	} catch (err) {
		logger.error(`Error in setCache: ${err instanceof Error ? err.message : String(err)}`);
		// Throw error to allow calling functions to handle caching failures
		throw new Error(`Failed to set cache for key '${key}': ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Deletes a cached value from Redis.
export async function clearCache(key: string | string[]): Promise<void> {
	try {
		await ensureRedisInitialized();
		await redisClient!.del(key);
		logger.debug('Cache cleared', { key });
	} catch (err) {
		logger.error(`Error in clearCache: ${err instanceof Error ? err.message : String(err)}`);
		// Throw error to allow calling functions to handle cache clearing failures
		throw new Error(`Failed to clear cache for key '${key}': ${err instanceof Error ? err.message : String(err)}`);
	}
}
// Retrieves a user session from Redis.
export async function getCachedSession(session_id: string): Promise<User | null> {
	return getCache<User>(`session:${session_id}`);
}

// Stores a user session in Redis with a TTL.
export async function setCachedSession(session_id: string, user: User, ttl: number = redisConfig.defaultTTL): Promise<void> {
	await setCache(`session:${session_id}`, user, ttl);
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
			logger.error(`Error in closeRedisConnection: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

// Checks if Redis is enabled and initialized
export function isRedisEnabled(): boolean {
	return !!redisClient && redisClient.isOpen;
}

// Caches page content in Redis
export async function cachePageContent(pageId: string, content: string, ttl: number = redisConfig.defaultTTL): Promise<void> {
	await setCache(`page:${pageId}`, content, ttl);
}

// Retrieves cached page content from Redis
export async function getCachedPageContent(pageId: string): Promise<string | null> {
	return getCache<string>(`page:${pageId}`);
}

// Clears cached page content from Redis
export async function clearPageCache(pageId: string): Promise<void> {
	await clearCache(`page:${pageId}`);
}

// API response type
interface ApiResponse<T = unknown> {
	data: T;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

// Caches an API response in Redis
export async function cacheApiResponse<T>(endpoint: string, response: T, ttl: number = 60): Promise<void> {
	const apiResponse: ApiResponse<T> = {
		data: response,
		timestamp: Date.now()
	};
	await setCache(`api:${endpoint}`, apiResponse, ttl);
}

// Retrieves a cached API response from Redis
export async function getCachedApiResponse<T>(endpoint: string): Promise<T | null> {
	const cached = await getCache<ApiResponse<T>>(`api:${endpoint}`);
	return cached?.data ?? null;
}
