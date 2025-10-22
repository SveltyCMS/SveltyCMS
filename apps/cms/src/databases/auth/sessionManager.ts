/**
 * @file src/databases/auth/sessionCleanup.ts
 * @description Session persistence management
 *
 * This module provides a unified session management system that works with both Redis and in-memory storage.
 *
 * Multi-Tenancy Note:
 * This session store is a generic key-value store where the key is a globally unique session ID.
 * It is inherently multi-tenant safe because the data it stores (the User object) contains the
 * tenantId. The responsibility for checking the tenantId of the retrieved user lies with the
 * calling code (e.g., the server hooks).
 *
 * Key features:
 * - Automatic fallback from Redis to in-memory storage
 * - Simple interface for session management
 * - Compatible with the new simplified auth system
 */

// System Logger
import { logger } from '@utils/logger.svelte';

// Auth
import type { SessionStore, User } from './types';

// Redis client interface to avoid direct dependency on a specific Redis library
interface RedisLike {
	get(key: string): Promise<string | null>;
	setex(key: string, seconds: number, value: string): Promise<void>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	quit?(): Promise<void>;
}

// In-memory session storage as fallback
class InMemorySessionManager implements SessionStore {
	private sessions: Map<string, { user: User; expiresAt: Date }> = new Map();

	async get(session_id: string): Promise<User | null> {
		const session = this.sessions.get(session_id);
		if (!session) return null; // Check if session has expired

		if (new Date() > session.expiresAt) {
			this.sessions.delete(session_id);
			return null;
		}

		return session.user;
	}

	async set(session_id: string, user: User, expiration: Date): Promise<void> {
		this.sessions.set(session_id, { user, expiresAt: expiration });
	}

	async delete(session_id: string): Promise<void> {
		this.sessions.delete(session_id);
	}

	async deletePattern(pattern: string): Promise<number> {
		let deletedCount = 0;
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));

		for (const [sessionId] of this.sessions) {
			if (regex.test(sessionId)) {
				this.sessions.delete(sessionId);
				deletedCount++;
			}
		}

		return deletedCount;
	}

	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		// For in-memory store, check memory first, then validate with DB if not found
		const memoryUser = await this.get(session_id);
		if (memoryUser) {
			return memoryUser;
		}

		// If not in memory, try DB validation
		const dbUser = await dbValidationFn(session_id);
		if (dbUser) {
			// Cache the user in memory for future access (assuming 1 hour expiration)
			const expiration = new Date(Date.now() + 60 * 60 * 1000);
			await this.set(session_id, dbUser, expiration);
		}
		return dbUser;
	}

	async close(): Promise<void> {
		this.sessions.clear();
	} // Cleanup expired sessions

	cleanup(): void {
		const now = new Date();
		for (const [sessionId, session] of this.sessions) {
			if (now > session.expiresAt) {
				this.sessions.delete(sessionId);
			}
		}
	}
}

// Redis session manager (optional)
class RedisSessionManager implements SessionStore {
	private redisClient: RedisLike | null;
	private fallbackManager: InMemorySessionManager;

	constructor(redisClient?: RedisLike) {
		this.redisClient = redisClient || null;
		this.fallbackManager = new InMemorySessionManager();
	}

	async get(session_id: string): Promise<User | null> {
		try {
			if (this.redisClient) {
				const sessionData = await this.redisClient.get(session_id);
				if (sessionData) {
					const parsed = JSON.parse(sessionData); // Check expiration
					if (new Date() > new Date(parsed.expiresAt)) {
						await this.redisClient.del(session_id);
						return null;
					}
					return parsed.user;
				}
			}
		} catch (err) {
			logger.warn(`Redis session get failed, falling back to memory: ${err instanceof Error ? err.message : String(err)}`);
		} // Fallback to in-memory manager

		return await this.fallbackManager.get(session_id);
	}

	async set(session_id: string, user: User, expiration: Date): Promise<void> {
		const sessionData = { user, expiresAt: expiration };

		try {
			if (this.redisClient) {
				const ttlSeconds = Math.floor((expiration.getTime() - Date.now()) / 1000);
				if (ttlSeconds > 0) {
					await this.redisClient.setex(session_id, ttlSeconds, JSON.stringify(sessionData));
					return;
				}
			}
		} catch (err) {
			logger.warn(`Redis session set failed, falling back to memory: ${err instanceof Error ? err.message : String(err)}`);
		} // Fallback to in-memory manager

		await this.fallbackManager.set(session_id, user, expiration);
	}

	async delete(session_id: string): Promise<void> {
		try {
			if (this.redisClient) {
				await this.redisClient.del(session_id);
			}
		} catch (err) {
			logger.warn(`Redis session delete failed: ${err instanceof Error ? err.message : String(err)}`);
		} // Also delete from fallback manager

		await this.fallbackManager.delete(session_id);
	}

	async deletePattern(pattern: string): Promise<number> {
		let deletedCount = 0;

		try {
			if (this.redisClient) {
				const keys = await this.redisClient.keys(pattern);
				if (keys.length > 0) {
					deletedCount = await this.redisClient.del(...keys);
				}
			}
		} catch (err) {
			logger.warn(`Redis pattern delete failed: ${err instanceof Error ? err.message : String(err)}`);
		} // Also delete from fallback manager

		const fallbackDeleted = await this.fallbackManager.deletePattern(pattern);
		return deletedCount + fallbackDeleted;
	}

	async close(): Promise<void> {
		try {
			if (this.redisClient && typeof this.redisClient.quit === 'function') {
				await this.redisClient.quit();
			}
		} catch (err) {
			logger.warn(`Redis close failed: ${err instanceof Error ? err.message : String(err)}`);
		}

		await this.fallbackManager.close();
	}

	async validateWithDB(session_id: string, dbValidationFn: (session_id: string) => Promise<User | null>): Promise<User | null> {
		// Try to get from Redis/memory first
		const cachedUser = await this.get(session_id);
		if (cachedUser) {
			return cachedUser;
		}

		// If not cached, validate with database
		const dbUser = await dbValidationFn(session_id);
		if (dbUser) {
			// Cache the validated user (assuming 1 hour expiration)
			const expiration = new Date(Date.now() + 60 * 60 * 1000);
			await this.set(session_id, dbUser, expiration);
		}
		return dbUser;
	}
}

// Factory function to create the appropriate session manager
export function createSessionManager(redisClient?: RedisLike): SessionStore {
	if (redisClient) {
		logger.info('Creating Redis session manager with in-memory fallback');
		return new RedisSessionManager(redisClient);
	} else {
		logger.info('Creating in-memory session manager');
		return new InMemorySessionManager();
	}
}

// Export the manager classes for direct use if needed
export { InMemorySessionManager, RedisSessionManager };

// Legacy aliases for backward compatibility
export { InMemorySessionManager as InMemorySessionStore, RedisSessionManager as RedisSessionStore };

// Default session manager instance
let defaultManager: SessionStore | null = null;

export function getDefaultSessionManager(): SessionStore {
	if (!defaultManager) {
		defaultManager = createSessionManager();
	}
	return defaultManager;
}

export function setDefaultSessionManager(manager: SessionStore): void {
	defaultManager = manager;
}

// Legacy aliases for backward compatibility
export const getDefaultSessionStore = getDefaultSessionManager;
export const setDefaultSessionStore = setDefaultSessionManager;

// Session cleanup utility
export function startSessionCleanup(manager: SessionStore, intervalMs: number = 60000): NodeJS.Timeout {
	return setInterval(() => {
		if (manager instanceof InMemorySessionManager) {
			manager.cleanup();
		} // Redis handles TTL automatically, so no cleanup needed
	}, intervalMs);
}
