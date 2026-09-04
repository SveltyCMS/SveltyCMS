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

/**
 * 🔴 FIX 6: Sentinel return from `acquireLock` that distinguishes a genuine L2
 * (Redis) error from "lock already held". `aquireLock` returns `""` on an L2
 * throw so callers can fail open instead of polling a dead winner.
 */
export const LOCK_ERROR = "";

export class CacheLockManager {
  private pendingRequests = new Map<string, Promise<any>>();
  private lockedKeys = new Map<string, Promise<boolean>>();
  private activeLocks = new Map<string, string>();

  /**
   * Coalesces concurrent asynchronous operations for the exact same key into a single execution
   * with occupant guard and timeout safety to prevent permanent stalls.
   */
  async coalesce<T>(key: string, fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
    const existing = this.pendingRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    let timeoutHandle: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`[CacheLock] Coalesce timeout after ${timeoutMs}ms for ${key}`));
      }, timeoutMs);
      if (typeof timeoutHandle?.unref === "function") timeoutHandle.unref();
    });

    const ref: { current: Promise<T> | null } = { current: null };
    const executionPromise = (async () => {
      try {
        return await fn();
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (ref.current && this.pendingRequests.get(key) === ref.current) {
          this.pendingRequests.delete(key);
        }
      }
    })();

    const promise = Promise.race([executionPromise, timeoutPromise]);
    ref.current = promise;
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
   * @returns Owner ID if lock acquired, `null` if lock held / L2 disabled,
   *          or `""` (LOCK_ERROR) if the L2 command threw — callers MUST fail
   *          open (skip polling, recompute now) instead of waiting for a
   *          winner that will never populate the key (FIX 6).
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
      // 🔴 FIX 6: signal a genuine L2 error distinctly from "lock is held".
      // Returning null here made get() poll waitForCache for 1000ms against a
      // dead Redis — and on a real Redis outage the "winner" never populates,
      // so every coalesced request burned the full budget and then recomputed.
      // The `""` sentinel lets callers fail open instantly.
      return LOCK_ERROR;
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
   * Polls L1 and L2 with exponential backoff until the winning process has populated the cache key, or maxWaitMs expires.
   */
  async waitForCache(
    l1: any,
    l2: any,
    key: string,
    maxWaitMs: number,
    deserializeFn: (val: any) => any,
    onHydrate?: (k: string) => void,
  ): Promise<void> {
    const start = Date.now();
    let delay = 10;
    while (Date.now() - start < maxWaitMs) {
      if (l1.has(key)) break;

      if (l2 && l2.isOpen) {
        try {
          const l2Value = await l2.get(key);
          if (l2Value) {
            const parsed = deserializeFn(l2Value);
            l1.set(key, parsed);
            if (onHydrate) onHydrate(key);
            break;
          }
        } catch {
          // Ignore L2 query errors during polling
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 80);
    }
  }

  clear(): void {
    this.pendingRequests.clear();
    this.lockedKeys.clear();
    this.activeLocks.clear();
  }
}
