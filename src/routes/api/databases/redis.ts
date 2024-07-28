import { privateEnv } from '@root/config/private';

import { createClient } from 'redis';

// System Logs
import { logger } from '@src/utils/logger';
import type { User } from '@src/auth/types';

let redisClient: ReturnType<typeof createClient> | null = null;

// Initialize Redis
export async function initializeRedis() {
	if (!privateEnv.USE_REDIS) {
		logger.info('Redis is disabled in configuration');
		return;
	}

	try {
		redisClient = createClient({
			url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
			password: privateEnv.REDIS_PASSWORD || undefined
		});

		await redisClient.connect();
		logger.info('Redis client connected successfully');

		redisClient.on('error', (err) => logger.error('Redis Client Error', err));
	} catch (error) {
		logger.error('Failed to initialize Redis client', error);
		redisClient = null;
	}
}

// Redis helpers
export async function getCache<T>(key: string): Promise<T | null> {
	if (!redisClient) return null;

	try {
		const value = await redisClient.get(key);
		return value ? JSON.parse(value) : null;
	} catch (error) {
		logger.error('Redis get error', error);
		return null;
	}
}

// Set cache
export async function setCache<T>(key: string, value: T, expirationInSeconds: number = 3600): Promise<void> {
	if (!redisClient) return;

	try {
		await redisClient.set(key, JSON.stringify(value), {
			EX: expirationInSeconds
		});
	} catch (error) {
		logger.error('Redis set error', error);
	}
}

export async function getCachedSession(sessionId: string): Promise<User | null> {
	return getCache<User>(`session:${sessionId}`);
}

export async function setCachedSession(sessionId: string, user: User, expirationInSeconds: number = 3600): Promise<void> {
	await setCache(`session:${sessionId}`, user, expirationInSeconds);
}

export async function clearCachedSession(sessionId: string): Promise<void> {
	await clearCache(`session:${sessionId}`);
}

// Clear cache
export async function clearCache(key: string): Promise<void> {
	if (!redisClient) return;

	try {
		await redisClient.del(key);
	} catch (error) {
		logger.error('Redis delete error', error);
	}
}

// Close Redis connection
export async function closeRedisConnection() {
	if (redisClient) {
		await redisClient.quit();
		logger.info('Redis connection closed');
	}
}
