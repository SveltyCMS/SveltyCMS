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
import { error } from '@sveltejs/kit';

// Types
import type { SessionStore } from './index';
import type { User } from './types';

// System Logger
import { logger } from '@utils/logger';

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
		try {
			const session = this.sessions.get(session_id);
			if (!session || session.expiresAt < new Date()) {
				return null;
			}
			return session.user;
		} catch (err) {
			const message = `Error in InMemorySessionStore.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Set a session with expiration
	async set(session_id: string, user: User, expiration: Date): Promise<void> {
		try {
			this.sessions.set(session_id, { user, expiresAt: expiration });
			this.evictOldestSession(privateEnv.MAX_IN_MEMORY_SESSIONS ?? 10000);
		} catch (err) {
			const message = `Error in InMemorySessionStore.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id, expiration });
			throw error(500, message);
		}
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
		try {
			this.sessions.delete(session_id);
		} catch (err) {
			const message = `Error in InMemorySessionStore.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Validate session with optional database check
	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		try {
			if (Math.random() < (privateEnv.DB_VALIDATION_PROBABILITY ?? 0.1)) {
				const dbUser = await dbValidationFn(session_id);
				if (!dbUser) {
					this.delete(session_id);
					return null;
				}
				return dbUser;
			}
			return this.get(session_id);
		} catch (err) {
			const message = `Error in InMemorySessionStore.validateWithDB: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Close the session store and clear intervals
	async close() {
		try {
			clearInterval(this.cleanupInterval);
		} catch (err) {
			const message = `Error in InMemorySessionStore.close: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
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
		} catch (err) {
			const message = `Failed to initialize Redis, using fallback session store: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Get a user by session ID
	async get(session_id: string): Promise<User | null> {
		try {
			return this.redisStore ? this.redisStore.get(session_id) : this.fallbackStore.get(session_id);
		} catch (err) {
			const message = `Error in OptionalRedisSessionStore.get: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Set a user session with expiration
	async set(session_id: string, user: User, expiration: Date): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.set(session_id, user, expiration);
			}
			await this.fallbackStore.set(session_id, user, expiration);
		} catch (err) {
			const message = `Error in OptionalRedisSessionStore.set: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id, expiration });
			throw error(500, message);
		}
	}

	// Delete a session by ID
	async delete(session_id: string): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.delete(session_id);
			}
			await this.fallbackStore.delete(session_id);
		} catch (err) {
			const message = `Error in OptionalRedisSessionStore.delete: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Validate session with optional database check
	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		try {
			if (this.redisStore) {
				return this.redisStore.validateWithDB(session_id, dbValidationFn);
			}
			return this.fallbackStore.validateWithDB(session_id, dbValidationFn);
		} catch (err) {
			const message = `Error in OptionalRedisSessionStore.validateWithDB: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { session_id });
			throw error(500, message);
		}
	}

	// Close the session store
	async close(): Promise<void> {
		try {
			if (this.redisStore) {
				await this.redisStore.close();
			}
			await this.fallbackStore.close();
		} catch (err) {
			const message = `Error in OptionalRedisSessionStore.close: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}
