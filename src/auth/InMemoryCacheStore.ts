/**
 * @file src/auth/InMemoryCacheStore.ts
 * @description In-memory cache store for sessions and access data.
 *
 * This module provides:
 * - In-memory storage for session and access data
 * - Expiration management for cached data
 * - Fallback cache store when Redis is unavailable
 *
 * Features:
 * - Simple in-memory storage for development or small-scale use
 * - Session and access data storage with expiration handling
 * - Flexible caching for authentication and access management
 *
 * Usage:
 * In-memory cache store for session and access data, with optional Redis fallback.
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';

// Types
import type { SessionStore } from './index';
import type { User } from './types';

// System Logger
import logger from '@src/utils/logger';

// In-memory cache store
export class InMemorySessionStore implements SessionStore {
	private sessions: Map<string, { user: User; expiresAt: Date }> = new Map();
	private cleanupInterval: NodeJS.Timeout;

	constructor() {
		// Initialize cleanup interval for expired data
		this.cleanupInterval = setInterval(() => this.cleanup(), privateEnv.SESSION_CLEANUP_INTERVAL ?? 60000);
	}

	// Cleanup expired sessions
	private cleanup() {
		const now = new Date();
		for (const [key, session] of this.sessions) {
			if (session.expiresAt < now) {
				this.sessions.delete(key);
			}
		}
		logger.debug(`Cleaned up expired sessions. Current count: ${this.sessions.size}`);
	}

	// Get a session by ID
	async get(session_id: string): Promise<User | null> {
		const session = this.sessions.get(session_id);
		if (!session || session.expiresAt < new Date()) {
			return null;
		}
		return session.user;
	}

	// Set a session with expiration
	async set(session_id: string, user: User, expiresAt: number | Date): Promise<void> {
		if (typeof expiresAt === 'number') {
			expiresAt = new Date(Date.now() + expiresAt * 1000);
		}
		this.sessions.set(session_id, { user, expiresAt });
		this.evictOldestSession(privateEnv.MAX_IN_MEMORY_SESSIONS ?? 10000);
	}

	// Evict the oldest session to maintain size limit
	private evictOldestSession(maxSessions: number) {
		if (this.sessions.size <= maxSessions) return;

		let oldestKey: string | null = null;
		let oldestTimestamp = new Date();

		for (const [key, session] of this.sessions) {
			if (session.expiresAt < oldestTimestamp) {
				oldestTimestamp = session.expiresAt;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.sessions.delete(oldestKey);
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
			const { RedisCacheStore } = await import('./RedisCacheStore');
			this.redisStore = new RedisCacheStore();
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
