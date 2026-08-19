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

// Auth
import type { ISODateString, User, DatabaseId } from "@databases/db-interface";
import { isoDateStringToDate } from "@utils/date";
// System Logger
import { logger } from "@utils/logger";
import type { SessionStore } from "./types";
import { toSafeSessionUser } from "./session-user";

// Redis client interface to avoid direct dependency on a specific Redis library
interface RedisLike {
  del(...keys: string[]): Promise<number>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  quit?(): Promise<void>;
  setex(key: string, seconds: number, value: string): Promise<void>;
}

// In-memory session storage as fallback
class InMemorySessionManager implements SessionStore {
  private readonly sessions: Map<string, { user: User; expiresAt: Date }> = new Map();
  private static readonly MAX_SESSIONS = 10000;

  async get(sessionId: string): Promise<User | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null; // Check if session has expired
    }

    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session.user;
  }

  async set(sessionId: string, user: User, expiration: ISODateString): Promise<void> {
    const expirationDate = isoDateStringToDate(expiration);
    // Bounded capacity protection: prune expired or oldest if exceeding MAX_SESSIONS
    if (this.sessions.size >= InMemorySessionManager.MAX_SESSIONS) {
      this.cleanup();
      if (this.sessions.size >= InMemorySessionManager.MAX_SESSIONS) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey) this.sessions.delete(oldestKey);
      }
    }
    // Defense-in-depth: never retain credential material (password hash, TOTP
    // secret, backup codes, reset/refresh tokens) in the session store.
    this.sessions.set(sessionId, {
      user: toSafeSessionUser(user),
      expiresAt: expirationDate,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deletePattern(pattern: string): Promise<number> {
    let deletedCount = 0;
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));

    for (const [sessionId] of this.sessions) {
      if (regex.test(sessionId)) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async validateWithDB(
    sessionId: DatabaseId,
    dbValidationFn: (sessionId: DatabaseId) => Promise<User | null>,
  ): Promise<User | null> {
    // For in-memory store, check memory first, then validate with DB if not found
    const memoryUser = await this.get(sessionId);
    if (memoryUser) {
      return memoryUser;
    }

    // If not in memory, try DB validation
    const dbUser = await dbValidationFn(sessionId);
    if (dbUser) {
      // Cache the user in memory for future access (assuming 1 hour expiration)
      const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString() as ISODateString;
      await this.set(sessionId, dbUser, expiration);
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
  private readonly redisClient: RedisLike | null;
  private readonly fallbackManager: InMemorySessionManager;

  constructor(redisClient?: RedisLike) {
    this.redisClient = redisClient || null;
    this.fallbackManager = new InMemorySessionManager();
  }

  async get(sessionId: string): Promise<User | null> {
    try {
      if (this.redisClient) {
        const sessionData = await this.redisClient.get(sessionId);
        if (sessionData) {
          const parsed = JSON.parse(sessionData); // Check expiration
          if (new Date() > new Date(parsed.expiresAt)) {
            await this.redisClient.del(sessionId);
            return null;
          }
          return parsed.user;
        }
      }
    } catch (err: any) {
      logger.warn(`Redis session get failed, falling back to memory: ${err.message}`);
    } // Fallback to in-memory manager

    return await this.fallbackManager.get(sessionId);
  }

  async set(sessionId: string, user: User, expiration: ISODateString): Promise<void> {
    const expirationDate = isoDateStringToDate(expiration);
    // Defense-in-depth: never retain credential material in Redis either.
    const sessionData = { user: toSafeSessionUser(user), expiresAt: expirationDate };

    try {
      if (this.redisClient) {
        const ttlSeconds = Math.floor((expirationDate.getTime() - Date.now()) / 1000);
        if (ttlSeconds > 0) {
          await this.redisClient.setex(sessionId, ttlSeconds, JSON.stringify(sessionData));
          return;
        }
      }
    } catch (err: any) {
      logger.warn(`Redis session set failed, falling back to memory: ${err.message}`);
    } // Fallback to in-memory manager

    await this.fallbackManager.set(sessionId, user, expiration);
  }

  async delete(sessionId: string): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.del(sessionId);
      }
    } catch (err: any) {
      logger.warn(`Redis session delete failed: ${err.message}`);
    } // Also delete from fallback manager

    await this.fallbackManager.delete(sessionId);
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
    } catch (err: any) {
      logger.warn(`Redis pattern delete failed: ${err.message}`);
    } // Also delete from fallback manager

    const fallbackDeleted = await this.fallbackManager.deletePattern(pattern);
    return deletedCount + fallbackDeleted;
  }

  async close(): Promise<void> {
    try {
      if (this.redisClient && typeof this.redisClient.quit === "function") {
        await this.redisClient.quit();
      }
    } catch (err: any) {
      logger.warn(`Redis close failed: ${err.message}`);
    }

    await this.fallbackManager.close();
  }

  async validateWithDB(
    sessionId: DatabaseId,
    dbValidationFn: (sessionId: DatabaseId) => Promise<User | null>,
  ): Promise<User | null> {
    // Try to get from Redis/memory first
    const cachedUser = await this.get(sessionId);
    if (cachedUser) {
      return cachedUser;
    }

    // If not cached, validate with database
    const dbUser = await dbValidationFn(sessionId);
    if (dbUser) {
      // Cache the validated user (assuming 1 hour expiration)
      const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString() as ISODateString;
      await this.set(sessionId, dbUser, expiration);
    }
    return dbUser;
  }
}

// Factory function to create the appropriate session manager
export function createSessionManager(redisClient?: RedisLike): SessionStore {
  if (redisClient) {
    logger.info("Creating Redis session manager with in-memory fallback");
    return new RedisSessionManager(redisClient);
  }
  logger.info("Creating in-memory session manager");
  return new InMemorySessionManager();
}

// Export the manager classes for direct use if needed
export { InMemorySessionManager, RedisSessionManager };

// Default session manager instance
const SESSION_STORE_GLOBAL_KEY = "__SVELTY_SESSION_STORE__";

export function getDefaultSessionManager(): SessionStore {
  let manager = (globalThis as any)[SESSION_STORE_GLOBAL_KEY];
  if (!manager) {
    manager = createSessionManager();
    (globalThis as any)[SESSION_STORE_GLOBAL_KEY] = manager;
  }
  return manager;
}

// Legacy alias for backward compatibility
export const getDefaultSessionStore = getDefaultSessionManager;
