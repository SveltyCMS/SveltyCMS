/**
 * @file src/auth/RedisSessionStore.ts
 * @description Redis-based session store implementation.
 *
 * This module provides functionality to:
 * - Store and retrieve session data in Redis
 * - Handle session encryption and decryption
 * - Manage session expiration
 *
 * Features:
 * - Redis integration for session storage
 * - Secure session data handling with encryption
 * - Configurable session expiration
 * - Error handling and logging
 *
 * Usage:
 * Used as an optional session store for improved performance and scalability.
 */

import { privateEnv } from '@root/config/private';
import { encrypt, decrypt } from '@src/utils/encryption';

// Auth
import type { SessionStore } from './index';
import type { User } from './types';

// Redis
import { createClient } from 'redis';

// System Logger
import logger from '@src/utils/logger';

// Redis session store
export class RedisSessionStore implements SessionStore {
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

	// Set session in Redis
	async set(session_id: string, user: User, expirationInSeconds: number): Promise<void> {
		try {
			// Encrypt and store user data in Redis with expiration
			const encryptedUser = encrypt(JSON.stringify(user));
			await this.redisClient.set(`session:${session_id}`, encryptedUser, {
				EX: expirationInSeconds
			});
			logger.info(`Session stored in Redis: ${session_id}`);
		} catch (error) {
			logger.error(`Error storing session in Redis: ${error}`);
			throw error; // Rethrow to ensure caller is aware of the issue
		}
	}

	// Get session from Redis
	async get(session_id: string): Promise<User | null> {
		try {
			const encryptedUser = await this.redisClient.get(`session:${session_id}`);
			if (!encryptedUser) {
				logger.info(`Session not found in Redis: ${session_id}`);
				return null;
			}
			const user = JSON.parse(decrypt(encryptedUser));
			logger.info(`Session retrieved from Redis: ${session_id}`);
			return user;
		} catch (error) {
			logger.error(`Error retrieving session from Redis: ${error}`);
			return null;
		}
	}

	// Delete session from Redis
	async delete(session_id: string): Promise<void> {
		try {
			await this.redisClient.del(`session:${session_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error clearing session from Redis: ${err.message}`);
		}
	}

	// Validate session with optional database check
	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		try {
			// Randomly validate session against the database based on probability
			if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
				const dbUser = await dbValidationFn(session_id);
				if (!dbUser) {
					await this.delete(session_id);
					return null;
				}
				await this.set(session_id, dbUser, privateEnv.SESSION_EXPIRATION_SECONDS ?? 3600);
				return dbUser;
			}
			return this.get(session_id);
		} catch (error) {
			logger.error(`Error validating session with DB: ${error}`);
			return null;
		}
	}

	// Close the session store
	async close() {
		try {
			await this.redisClient.quit();
			logger.info('Redis connection closed');
		} catch (error) {
			logger.error(`Error closing Redis connection: ${error}`);
		}
	}
}
