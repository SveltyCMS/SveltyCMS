/**
 * @file src/utils/singleflight.ts
 * @description
 * Ultra-High Throughput Singleflight Request Coalescing Engine for SveltyCMS.
 *
 * Prevents Thundering Herds and Cache Stampedes under heavy concurrent load.
 * Coalesces duplicate inflight executions for the same key into a single Promise,
 * so 1,000 concurrent requests trigger ONLY 1 database or resolver execution.
 *
 * Inspired by Go's `golang.org/x/sync/singleflight` pattern.
 */

import { logger } from "@utils/logger";

export interface SingleflightCall<T> {
  promise: Promise<T>;
  dups: number;
}

export class Singleflight<T = unknown> {
  private inFlight = new Map<string, SingleflightCall<T>>();

  /**
   * Executes and returns the result of the given function, making sure that only one
   * execution is in-flight for a given key at a time. If a duplicate comes in, the duplicate
   * caller waits for the original to complete and receives the same result.
   */
  public async do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      existing.dups++;
      logger.debug(
        `[Singleflight] Coalesced concurrent request for key: ${key} (dups: ${existing.dups})`,
      );
      return existing.promise;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, { promise, dups: 0 });
    return promise;
  }

  /**
   * Returns the number of currently active in-flight calls.
   */
  public get activeCount(): number {
    return this.inFlight.size;
  }

  /**
   * Clears all in-flight trackers.
   */
  public forget(key: string): void {
    this.inFlight.delete(key);
  }
}

export const globalSingleflight = new Singleflight();
