/**
 * @file src/utils/singleflight.ts
 * @description In-process singleflight coalescing for concurrent cache-miss reads.
 *
 * Features:
 * - Deduplicates concurrent in-flight promises by key
 * - Cleans up in-flight entries on both resolve and reject
 * - Tracks coalesced call count for observability
 */

export class SingleflightGroup<T = unknown> {
  private readonly inFlight = new Map<string, Promise<T>>();
  private coalesced = 0;

  /** Number of currently active in-flight keys. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Total number of callers coalesced onto an existing in-flight promise. */
  get coalescedCount(): number {
    return this.coalesced;
  }

  /**
   * Executes `fn` for `key` if no call is currently in-flight for `key`,
   * otherwise returns the existing in-flight promise.
   */
  do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      this.coalesced++;
      return existing;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}
