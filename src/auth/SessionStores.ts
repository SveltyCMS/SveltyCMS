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
		const now = Math.floor(Date.now() / 1000); // Use Unix timestamp in seconds
		for (const [session_id, session] of this.sessions) {
			if (session.expiresAt < now) {
				this.sessions.delete(session_id);
			}
		}
		logger.debug(`Cleaned up expired sessions. Current count: ${this.sessions.size}`);
	}

	// Get a user by session ID
	async get(session_id: string): Promise<User | null> {
		const session = this.sessions.get(session_id);
		if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
			return null;
		}
		return session.user;
	}

	// Set a user session with expiration
	async set(session_id: string, user: User, expirationInSeconds: number): Promise<void> {
		this.sessions.set(session_id, {
			user,
			expiresAt: Math.floor(Date.now() / 1000) + expirationInSeconds // Unix timestamp in seconds
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

		for (const [session_id, session] of this.sessions) {
			if (session.expiresAt < oldestTimestamp) {
				oldestTimestamp = session.expiresAt;
				oldestSessionId = session_id;
			}
		}

		if (oldestSessionId) {
			this.sessions.delete(oldestSessionId);
			logger.debug(`Evicted oldest session to maintain size limit`);
		}
	}

	// Delete a session by ID
	async delete(session_id: string): Promise<void> {
		this.sessions.delete(session_id);
	}

	// Validate session with optional database check
	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
			const dbUser = await dbValidationFn(session_id);
			if (!dbUser) {
				this.delete(session_id);
				return null;
			}
			return dbUser;
		}
		return this.get(session_id);
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
	async get(session_id: string): Promise<User | null> {
		try {
			return this.redisStore ? this.redisStore.get(session_id) : this.fallbackStore.get(session_id);
		} catch (error) {
			logger.error(`Error getting session: ${error}`);
			throw error;
		}
	}

	// Set a user session with expiration
	async set(session_id: string, user: User, expirationInSeconds: number): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.set(session_id, user, expirationInSeconds);
			}
			await this.fallbackStore.set(session_id, user, expirationInSeconds);
		} catch (error) {
			logger.error(`Error setting session: ${error}`);
			throw error;
		}
	}

	// Delete a session by ID
	async delete(session_id: string): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.delete(session_id);
			}
			await this.fallbackStore.delete(session_id);
		} catch (error) {
			logger.error(`Error deleting session: ${error}`);
			throw error;
		}
	}

	// Validate session with optional database check
	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		try {
			if (this.redisStore) {
				return this.redisStore.validateWithDB(session_id, dbValidationFn);
			}
			return this.fallbackStore.validateWithDB(session_id, dbValidationFn);
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
