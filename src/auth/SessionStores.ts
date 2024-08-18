/**
 * @file src/auth/SessionStores.ts
 * @description Session store implementations for the auth system.
 *
 * This module provides different session store options:
 * - In-memory session store
 * - Redis session store (optional)
 *
 * Features:
 * - Flexible session storage options
 * - In-memory store for development or small-scale use
 * - Redis store for production and scalable environments
 * - Consistent interface for different store types
 *
 * Usage:
 * Configurable session storage solution for the authentication system.
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';

// Types
import type { SessionStore } from './index';
import type { User } from './types';

// System Logger
import logger from '@src/utils/logger';

// In-memory session store
export class InMemorySessionStore implements SessionStore {
	private sessions: Map<string, { user: User; expiresAt: number }> = new Map();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		// Initialize cleanup interval for expired sessions
		this.cleanupInterval = setInterval(() => this.cleanup(), privateEnv.SESSION_CLEANUP_INTERVAL ?? 60000);
	}

	// Cleanup expired sessions
	private cleanup() {
		const now = Date.now();
		for (const [sessionId, session] of this.sessions) {
			if (session.expiresAt < now) {
				this.sessions.delete(sessionId);
			}
		}
		logger.debug(`Cleaned up expired sessions. Current count: ${this.sessions.size}`);
	}

	// Get a user by session ID
	async get(sessionId: string): Promise<User | null> {
		const session = this.sessions.get(sessionId);
		if (!session || session.expiresAt < Date.now()) {
			return null;
		}
		return session.user;
	}

	// Set a user session with expiration
	async set(sessionId: string, user: User, expirationInSeconds: number): Promise<void> {
		this.sessions.set(sessionId, {
			user,
			expiresAt: Date.now() + expirationInSeconds * 1000
		});
		// Evict the oldest session if the limit is exceeded
		if (this.sessions.size > (privateEnv.MAX_IN_MEMORY_SESSIONS ?? 10000)) {
			this.evictOldestSession();
		}
	}

	// Evict the oldest session to maintain size limit
	private evictOldestSession() {
		let oldestSessionId: string | null = null;
		let oldestTimestamp = Infinity;

		for (const [sessionId, session] of this.sessions) {
			if (session.expiresAt < oldestTimestamp) {
				oldestTimestamp = session.expiresAt;
				oldestSessionId = sessionId;
			}
		}

		if (oldestSessionId) {
			this.sessions.delete(oldestSessionId);
			logger.debug(`Evicted oldest session to maintain size limit`);
		}
	}

	// Delete a session by ID
	async delete(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
	}

	// Validate session with optional database check
	async validateWithDB(sessionId: string, dbValidationFn: (sessionId: string) => Promise<User | null>): Promise<User | null> {
		if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
			const dbUser = await dbValidationFn(sessionId);
			if (!dbUser) {
				this.delete(sessionId);
				return null;
			}
			return dbUser;
		}
		return this.get(sessionId);
	}

	// Close the session store and clear intervals
	async close() {
		clearInterval(this.cleanupInterval);
	}
}

// Optional Redis session store
export class OptionalRedisSessionStore implements SessionStore {
	private redisStore: SessionStore | null = null;
	private fallbackStore: SessionStore;

	constructor(fallbackStore: SessionStore = new InMemorySessionStore()) {
		this.fallbackStore = fallbackStore;
		if (!browser && privateEnv.USE_REDIS) {
			this.initializeRedis().catch((err) => {
				logger.error(`Failed to initialize Redis, using fallback session store: ${err.message}`);
			});
		} else {
			logger.info('Redis is disabled or in browser environment, using fallback session store');
		}
	}

	// Initialize Redis session store
	private async initializeRedis() {
		if (!privateEnv.USE_REDIS) {
			logger.info('Redis is disabled in configuration, using fallback session store');
			return;
		}

		try {
			const { RedisSessionStore } = await import('./RedisSessionStore');
			this.redisStore = new RedisSessionStore();
			logger.info('Redis session store initialized');
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to initialize Redis, using fallback session store: ${err.message}`);
		}
	}

	// Get a user by session ID
	async get(sessionId: string): Promise<User | null> {
		try {
			return this.redisStore ? this.redisStore.get(sessionId) : this.fallbackStore.get(sessionId);
		} catch (error) {
			logger.error(`Error getting session: ${error}`);
			throw error;
		}
	}

	// Set a user session with expiration
	async set(sessionId: string, user: User, expirationInSeconds: number): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.set(sessionId, user, expirationInSeconds);
			}
			await this.fallbackStore.set(sessionId, user, expirationInSeconds);
		} catch (error) {
			logger.error(`Error setting session: ${error}`);
			throw error;
		}
	}

	// Delete a session by ID
	async delete(sessionId: string): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.delete(sessionId);
			}
			await this.fallbackStore.delete(sessionId);
		} catch (error) {
			logger.error(`Error deleting session: ${error}`);
			throw error;
		}
	}

	// Validate session with optional database check
	async validateWithDB(sessionId: string, dbValidationFn: (sessionId: string) => Promise<User | null>): Promise<User | null> {
		try {
			if (this.redisStore) {
				return this.redisStore.validateWithDB(sessionId, dbValidationFn);
			}
			return this.fallbackStore.validateWithDB(sessionId, dbValidationFn);
		} catch (error) {
			logger.error(`Error validating session: ${error}`);
			throw error;
		}
	}

	// Close the session store
	async close(): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.close();
			}
			await this.fallbackStore.close();
		} catch (error) {
			logger.error(`Error closing session store: ${error}`);
		}
	}
}
