/**
 * @file src/databases/core/batch-dataloader.ts
 * @description
 * Ultra-Fast Microsecond Batch DataLoader for SveltyCMS.
 *
 * Eliminates N+1 database roundtrips in REST & GraphQL relation resolution by coalescing
 * individual ID lookups into a single batch query (`WHERE _id IN (...)`) within a microtask tick.
 *
 * ### Features:
 * - Single-pass batch query execution
 * - Request-scoped deduplication & caching
 * - Microsecond batching via queueMicrotask
 * - Agnostic adapter support (SQLite, PostgreSQL, MariaDB, MongoDB)
 */

import { logger } from "@utils/logger";

export type BatchFetchFn<K, V> = (keys: K[]) => Promise<Map<K, V>>;

export class BatchDataLoader<K extends string | number, V> {
  private queue: Map<K, { resolve: (val: V | null) => void; reject: (err: unknown) => void }[]> =
    new Map();
  private cache: Map<K, V> = new Map();
  private batchScheduled = false;
  private batchFetchFn: BatchFetchFn<K, V>;

  constructor(batchFetchFn: BatchFetchFn<K, V>) {
    this.batchFetchFn = batchFetchFn;
  }

  /**
   * Loads a single value by key, coalescing concurrent calls into a single batch query.
   */
  public async load(key: K): Promise<V | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    return new Promise<V | null>((resolve, reject) => {
      const pending = this.queue.get(key) || [];
      pending.push({ resolve, reject });
      this.queue.set(key, pending);

      if (!this.batchScheduled) {
        this.batchScheduled = true;
        queueMicrotask(() => this.dispatchBatch());
      }
    });
  }

  /**
   * Loads multiple values by keys in parallel, returning values in matching order.
   */
  public async loadMany(keys: K[]): Promise<(V | null)[]> {
    return Promise.all(keys.map((k) => this.load(k)));
  }

  /**
   * Dispatches queued batch requests in a single database roundtrip.
   */
  private async dispatchBatch(): Promise<void> {
    this.batchScheduled = false;
    const currentQueue = new Map(this.queue);
    this.queue.clear();

    const keys = Array.from(currentQueue.keys());
    if (keys.length === 0) return;

    try {
      const results = await this.batchFetchFn(keys);

      for (const [key, listeners] of currentQueue.entries()) {
        const val = results.get(key) ?? null;
        if (val !== null) {
          this.cache.set(key, val);
        }
        for (const l of listeners) {
          l.resolve(val);
        }
      }
    } catch (err) {
      logger.error("[BatchDataLoader] Batch execution error:", err);
      for (const listeners of currentQueue.values()) {
        for (const l of listeners) {
          l.reject(err);
        }
      }
    }
  }

  /**
   * Clears the request-scoped cache.
   */
  public clearAll(): void {
    this.cache.clear();
    this.queue.clear();
  }
}

/**
 * Creates a request-scoped BatchDataLoader for database adapter collections.
 */
export function createAdapterDataLoader<T = any>(
  adapter: any,
  collectionName: string,
  tenantId?: string | null,
): BatchDataLoader<string, T> {
  return new BatchDataLoader<string, T>(async (keys: string[]) => {
    const map = new Map<string, T>();
    if (!keys || keys.length === 0) return map;

    try {
      const scope = tenantId ? { tenantId } : {};
      const res = await adapter.findMany(collectionName, {
        filter: { _id: { $in: keys }, ...scope },
      });
      const items = res?.data || res || [];
      if (Array.isArray(items)) {
        for (const item of items) {
          const id = String(item._id || item.id);
          map.set(id, item);
        }
      }
    } catch (err) {
      logger.error(`[AdapterDataLoader] Error batch loading ${collectionName}:`, err);
    }
    return map;
  });
}
