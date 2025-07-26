/**
 * @file src/auth/sessionStore.ts
 * @description Simplified session store implementation
 *
 * This module provides a unified session store that works with both Redis and in-memory storage.
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
import type { User, SessionStore } from './types';

// In-memory session storage as fallback
class InMemorySessionStore implements SessionStore {
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

// Redis session store (optional)
class RedisSessionStore implements SessionStore {
	private redisClient: any; // Use `any` to avoid strict Redis client type dependency
	private fallbackStore: InMemorySessionStore;

	constructor(redisClient?: any) {
		this.redisClient = redisClient;
		this.fallbackStore = new InMemorySessionStore();
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
		} // Fallback to in-memory store

		return await this.fallbackStore.get(session_id);
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
		} // Fallback to in-memory store

		await this.fallbackStore.set(session_id, user, expiration);
	}

	async delete(session_id: string): Promise<void> {
		try {
			if (this.redisClient) {
				await this.redisClient.del(session_id);
			}
		} catch (err) {
			logger.warn(`Redis session delete failed: ${err instanceof Error ? err.message : String(err)}`);
		} // Also delete from fallback store

		await this.fallbackStore.delete(session_id);
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
		} // Also delete from fallback store

		const fallbackDeleted = await this.fallbackStore.deletePattern(pattern);
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

		await this.fallbackStore.close();
	}
}

// Factory function to create the appropriate session store
export function createSessionStore(redisClient?: any): SessionStore {
	if (redisClient) {
		logger.info('Creating Redis session store with in-memory fallback');
		return new RedisSessionStore(redisClient);
	} else {
		logger.info('Creating in-memory session store');
		return new InMemorySessionStore();
	}
}

// Export the store classes for direct use if needed
export { InMemorySessionStore, RedisSessionStore };

// Default session store instance
let defaultStore: SessionStore | null = null;

export function getDefaultSessionStore(): SessionStore {
	if (!defaultStore) {
		defaultStore = createSessionStore();
	}
	return defaultStore;
}

export function setDefaultSessionStore(store: SessionStore): void {
	defaultStore = store;
}

// Session cleanup utility
export function startSessionCleanup(store: SessionStore, intervalMs: number = 60000): NodeJS.Timeout {
	return setInterval(() => {
		if (store instanceof InMemorySessionStore) {
			store.cleanup();
		} // Redis handles TTL automatically, so no cleanup needed
	}, intervalMs);
}
