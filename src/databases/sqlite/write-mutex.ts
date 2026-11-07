/**
 * @file src/databases/sqlite/write-mutex.ts
 * @description Single-writer mutex shared by every SQLite adapter instance.
 *
 * SQLite permits one writer. The adapter serializes multi-statement transaction
 * spans (BEGIN…COMMIT) through this mutex so concurrent requests queue instead
 * of interleaving. It lives in a leaf module so `transaction-module.ts` can
 * acquire it without importing `adapter-core.ts` at runtime — that edge was one
 * half of the `adapter-core ↔ transaction-module` cycle.
 *
 * ### Features
 * - Re-entrant via AsyncLocalStorage: nested write spans run inline
 * - Zero promise chaining when uncontended
 * - FIFO hand-off to the next waiter
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * High-performance re-entrant FIFO mutex for serializing SQLite writes.
 * - Zero promise-chain allocations when uncontended.
 * - Direct O(1) waiter hand-off without deep microtask latency.
 * - Full re-entrancy support via AsyncLocalStorage.
 */
export class Mutex {
  private _locked = false;
  private _waiting: Array<() => void> = [];
  private storage = new AsyncLocalStorage<boolean>();

  /** True when the caller's async context already holds the lock (re-entrant span). */
  isHeld(): boolean {
    return this.storage.getStore() === true;
  }

  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.storage.getStore()) {
      return fn();
    }

    if (this._locked) {
      await new Promise<void>((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;

    try {
      return await this.storage.run(true, fn);
    } finally {
      const next = this._waiting.shift();
      if (next) {
        next();
      } else {
        this._locked = false;
      }
    }
  }
}

/** The process-wide SQLite write lock. */
export const sqliteWriteMutex = new Mutex();
