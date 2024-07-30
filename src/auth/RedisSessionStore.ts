import { privateEnv } from '@root/config/private';

// Types
import type { SessionStore } from './index';
import type { User } from './types';
import { createClient } from 'redis';

// System Logger
import logger from '@src/utils/logger';

import { encrypt, decrypt } from '@src/utils/encryption';

export class RedisSessionStore implements SessionStore {
	private redisClient: ReturnType<typeof createClient>;

	constructor() {
		this.redisClient = createClient({
			url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
			password: privateEnv.REDIS_PASSWORD || undefined
		});

		this.redisClient.on('error', (err) => logger.error('Redis Client Error', err));

		this.redisClient.connect().catch((err) => {
			logger.error('Failed to connect to Redis:', err);
		});
	}

	async get(sessionId: string): Promise<User | null> {
		try {
			const encryptedUser = await this.redisClient.get(`session:${sessionId}`);
			return encryptedUser ? JSON.parse(decrypt(encryptedUser)) : null;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching session from Redis: ${err.message}`);
			return null;
		}
	}

	async set(sessionId: string, user: User, expirationInSeconds: number): Promise<void> {
		try {
			const encryptedUser = encrypt(JSON.stringify(user));
			await this.redisClient.set(`session:${sessionId}`, encryptedUser, {
				EX: expirationInSeconds
			});
		} catch (error) {
			const err = error as Error;
			logger.error(`Error caching session in Redis: ${err.message}`);
		}
	}

	async delete(sessionId: string): Promise<void> {
		try {
			await this.redisClient.del(`session:${sessionId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error clearing session from Redis: ${err.message}`);
		}
	}

	async validateWithDB(sessionId: string, dbValidationFn: (sessionId: string) => Promise<User | null>): Promise<User | null> {
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

	async close() {
		await this.redisClient.quit();
		logger.info('Redis connection closed');
	}
}
