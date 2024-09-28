/**
 * @file src/auth/RedisCacheStore.ts
 * @description Redis-based cache store implementation for sessions and access data.
 *
 * This module provides functionality to:
 * - Store and retrieve session and access data in Redis
 * - Handle data encryption and decryption
 * - Manage data expiration
 *
 * Features:
 * - Redis integration for session and access data storage
 * - Secure data handling with encryption
 * - Configurable data expiration
 * - Error handling and logging
 *
 * Usage:
 * Used as an optional cache store for improved performance and scalability in the authentication and access management system.
 */

import { privateEnv } from '@root/config/private';
import { encrypt, decrypt } from '@src/utils/encryption';

// Types
import type { SessionStore } from './index';
import type { User } from './types';

// Redis
import { createClient } from 'redis';

// System Logger
import logger from '@src/utils/logger';

// Redis cache store
export class RedisCacheStore implements SessionStore {
	private redisClient: ReturnType<typeof createClient>;

	constructor() {
		// Initialize Redis client with configuration from environment variables
		this.redisClient = createClient({
			url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
			password: privateEnv.REDIS_PASSWORD || undefined
		});

		// Set up error handling for Redis client
		this.redisClient.on('error', (err) => logger.error('Redis Client Error', err));

		// Connect to Redis
		this.redisClient.connect().catch((err) => {
			logger.error('Failed to connect to Redis:', err);
		});
	}

	// Set data in Redis
	async set(key: string, data: User, expirationInSeconds: number): Promise<void> {
		try {
			// Set expiration and store data in Redis
			const expiresAt = new Date(Date.now() + expirationInSeconds * 1000);
			const dataWithExpiration = { ...data, expiresAt };
			const encryptedData = encrypt(JSON.stringify(dataWithExpiration));
			await this.redisClient.set(key, encryptedData, {
				EX: expirationInSeconds
			});
			logger.info(`Data stored in Redis: ${key}`);
		} catch (error) {
			logger.error(`Error storing data in Redis: ${error}`);
			throw error;
		}
	}

	// Get data from Redis
	async get(key: string): Promise<User | null> {
		try {
			const encryptedData = await this.redisClient.get(key);
			if (!encryptedData) {
				logger.info(`Data not found in Redis: ${key}`);
				return null;
			}
			const data = JSON.parse(decrypt(encryptedData));
			const expiresAt = new Date(data.expiresAt);
			if (expiresAt < new Date()) {
				await this.delete(key);
				logger.info(`Expired data removed from Redis: ${key}`);
				return null;
			}
			logger.info(`Data retrieved from Redis: ${key}`);
			return data;
		} catch (error) {
			logger.error(`Error retrieving data from Redis: ${error}`);
			return null;
		}
	}

	// Delete data from Redis
	async delete(key: string): Promise<void> {
		try {
			await this.redisClient.del(key);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error clearing data from Redis: ${err.message}`);
		}
	}

	// Validate data with optional database check
	async validateWithDB(key: string, dbValidationFn: (key: string) => Promise<User | null>): Promise<User | null> {
		try {
			// Randomly validate data against the database based on probability
			if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
				const dbData = await dbValidationFn(key);
				if (!dbData) {
					await this.delete(key);
					return null;
				}
				await this.set(key, dbData, privateEnv.SESSION_EXPIRATION_SECONDS ?? 3600);
				return dbData;
			}
			return this.get(key);
		} catch (error) {
			logger.error(`Error validating data with DB: ${error}`);
			return null;
		}
	}

	// Close the cache store
	async close() {
		try {
			await this.redisClient.quit();
			logger.info('Redis connection closed');
		} catch (error) {
			logger.error(`Error closing Redis connection: ${error}`);
		}
	}
}
