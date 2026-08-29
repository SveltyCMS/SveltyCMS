/**
 * @file src/databases/cache/cache-locks.ts
 * @description
 * Distributed cache stampede protection, lock coordination, and single-flight request coalescing.
 *
 * Prevents "thundering herd" problems where concurrent requests hit the database for the same missing key.
 *
 * ### Features:
 * - Single-flight request coalescing (awaits winner)
 * - Distributed NX/PX Redis miss locks
 * - Inter-node L1/L2 polling loop
 */

import { logger } from "@utils/logger";

export class CacheLockManager {
  private pendingRequests = new Map<string, Promise<any>>();
  private lockedKeys = new Map<string, Promise<boolean>>();
  private activeLocks = new Map<string, string>();

  /**
   * Coalesces concurrent asynchronous operations for the exact same key into a single execution.
   */
  async coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pendingRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = fn().finally(() => {
      this.pendingRequests.delete(key);
    });
    this.pendingRequests.set(key, promise);
    return promise;
  }

  hasPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  getPending<T>(key: string): Promise<T> | undefined {
    return this.pendingRequests.get(key) as Promise<T> | undefined;
  }

  setPending(key: string, promise: Promise<any>): void {
    this.pendingRequests.set(key, promise);
  }

  deletePending(key: string): void {
    this.pendingRequests.delete(key);
  }

  /**
   * Attempts to acquire a distributed cache miss lock using Redis (L2).
   * @returns Owner ID if lock acquired, or null if lock is held or L2 unavailable.
   */
  async acquireLock(l2: any, key: string, ttlMs: number): Promise<string | null> {
    if (!l2 || !l2.isOpen) return null;

    const lockKey = `lock:${key}`;
    // CSPRNG only (AGENTS.md §2.1): crypto is always present in Node ≥20 — never
    // fall back to weak randomness for a lock-ownership token.
    const ownerId = globalThis.crypto.randomUUID();

    try {
      const result = await l2.set(lockKey, ownerId, {
        NX: true,
        PX: ttlMs,
      });
      if (result !== "OK") return null;

      this.lockedKeys.set(lockKey, Promise.resolve(true));
      this.activeLocks.set(key, ownerId);
      return ownerId;
    } catch (err) {
      logger.error(`[CacheLock] Failed to acquire lock for ${key}`, err);
      return null;
    }
  }

  /**
   * Releases a distributed cache miss lock.
   */
  async releaseLock(l2: any, key: string, ownerId?: string): Promise<void> {
    const lockOwner = ownerId || this.activeLocks.get(key);
    if (!lockOwner || !l2 || !l2.isOpen) {
      this.activeLocks.delete(key);
      return;
    }

    const lockKey = `lock:${key}`;
    try {
      const currentOwner = await l2.get(lockKey);
      if (currentOwner === lockOwner) {
        await l2.del(lockKey);
      }
    } catch (err) {
      logger.error(`[CacheLock] Failed to release lock for ${key}`, err);
    } finally {
      this.lockedKeys.delete(lockKey);
      this.activeLocks.delete(key);
    }
  }

  /**
   * Polls L1 and L2 until the winning process has populated the cache key, or maxWaitMs expires.
   */
  async waitForCache(
    l1: any,
    l2: any,
    key: string,
    maxWaitMs: number,
    deserializeFn: (val: any) => any,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (l1.has(key)) break;

      if (l2 && l2.isOpen) {
        try {
          const l2Value = await l2.get(key);
          if (l2Value) {
            const parsed = deserializeFn(l2Value);
            l1.set(key, parsed);
            break;
          }
        } catch {
          // Ignore L2 query errors during polling
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  clear(): void {
    this.pendingRequests.clear();
    this.lockedKeys.clear();
    this.activeLocks.clear();
  }
}
