import { privateEnv } from '@root/config/private';

// Types
import type { SessionStore } from './index';
import type { User } from './types';
import { createClient } from 'redis';

// System Logger
import logger from '@src/utils/logger';

import { encrypt, decrypt } from '@src/utils/encryption';

// Initialize Redis session store
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

	// Get session from Redis
	async get(sessionId: string): Promise<User | null> {
		try {
			// Retrieve and decrypt user data from Redis

			const encryptedUser = await this.redisClient.get(`session:${sessionId}`);
			return encryptedUser ? JSON.parse(decrypt(encryptedUser)) : null;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching session from Redis: ${err.message}`);
			return null;
		}
	}

	// Set session in Redis
	async set(sessionId: string, user: User, expirationInSeconds: number): Promise<void> {
		try {
			// Encrypt and store user data in Redis with expiration
			const encryptedUser = encrypt(JSON.stringify(user));
			await this.redisClient.set(`session:${sessionId}`, encryptedUser, {
				EX: expirationInSeconds
			});
		} catch (error) {
			const err = error as Error;
			logger.error(`Error caching session in Redis: ${err.message}`);
		}
	}

	// Delete session from Redis
	async delete(sessionId: string): Promise<void> {
		try {
			await this.redisClient.del(`session:${sessionId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error clearing session from Redis: ${err.message}`);
		}
	}

	// Validate session against the database
	async validateWithDB(sessionId: string, dbValidationFn: (sessionId: string) => Promise<User | null>): Promise<User | null> {
		// Randomly validate session against the database based on probability
		if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
			const dbUser = await dbValidationFn(sessionId);
			if (!dbUser) {
				await this.delete(sessionId);
				return null;
			}
			await this.set(sessionId, dbUser, privateEnv.SESSION_EXPIRATION_SECONDS ?? 3600);
			return dbUser;
		}
		return this.get(sessionId);
	}

	// Close Redis connection
	async close() {
		await this.redisClient.quit();
		logger.info('Redis connection closed');
	}
}
