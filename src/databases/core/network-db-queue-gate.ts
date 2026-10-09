/**
 * @file src/databases/core/network-db-queue-gate.ts
 * @description
 * High-performance bounded in-app queue gate for network database connection pools (PostgreSQL / MariaDB).
 * Prevents connection pool blowout, socket resets, and runaway latency spikes under high-concurrency bursts
 * by enforcing a strict concurrency ceiling and fail-fast queue admission.
 *
 * ### Features:
 * - Zero allocation on fast path (active < maxConcurrency executes immediately)
 * - FIFO queued waiting with configurable queue capacity and timeout
 * - Immediate fail-fast (503 / POOL_EXHAUSTED) when queue limit is exceeded
 * - Observability metrics (active, waiting, maxConcurrency, maxQueue)
 * - Safe re-entrancy via AsyncLocalStorage (transactions and nested queries share a single permit)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

export interface NetworkDbQueueGateOptions {
  /** Maximum number of concurrent database operations executing simultaneously. */
  maxConcurrency: number;
  /** Maximum number of requests allowed to wait in the queue. Defaults to 500. */
  maxQueue?: number;
  /** Maximum time (in ms) a request can wait in the queue before timing out. Defaults to 15000ms. */
  timeoutMs?: number;
  /** Name of the database adapter for diagnostic log messages. */
  name?: string;
}

interface QueuedOperation {
  resolve: () => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class NetworkDbQueueGate {
  private active = 0;
  private readonly queue: QueuedOperation[] = [];
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly timeoutMs: number;
  private readonly name: string;
  private readonly asyncLocal = new AsyncLocalStorage<boolean>();

  constructor(options: NetworkDbQueueGateOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
    this.maxQueue = Math.max(1, options.maxQueue ?? 500);
    this.timeoutMs = Math.max(500, options.timeoutMs ?? 15_000);
    this.name = options.name ?? "NetworkDB";
  }

  /**
   * Acquire an execution slot, run `fn`, and release the slot.
   * If the current asynchronous context already holds an execution slot (e.g. nested calls or transactions),
   * `fn` executes immediately without acquiring a redundant slot.
   */
  public async acquire<T>(fn: () => Promise<T>): Promise<T> {
    // Re-entrancy guard: already inside an active gate slot in this async call chain
    if (this.asyncLocal.getStore()) {
      return fn();
    }

    // Fast path: immediate execution if capacity is available and queue is empty
    if (this.active < this.maxConcurrency && this.queue.length === 0) {
      this.active++;
      try {
        return await this.asyncLocal.run(true, fn);
      } finally {
        this.active--;
        this.dequeue();
      }
    }

    // Queue capacity check: fail fast if queue is saturated
    if (this.queue.length >= this.maxQueue) {
      logger.warn(
        `[${this.name}] Connection queue saturated (${this.queue.length}/${this.maxQueue} waiting, ${this.active}/${this.maxConcurrency} active). Rejecting.`,
      );
      throw new AppError(
        `Database connection queue saturated (${this.name})`,
        503,
        "DB_QUEUE_SATURATED",
      );
    }

    // Enqueue operation
    await new Promise<void>((resolve, reject) => {
      const item: QueuedOperation = {
        resolve: () => {
          if (item.timer) clearTimeout(item.timer);
          resolve();
        },
        reject: (err: Error) => {
          if (item.timer) clearTimeout(item.timer);
          reject(err);
        },
      };

      item.timer = setTimeout(() => {
        const idx = this.queue.indexOf(item);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        item.reject(
          new AppError(
            `Database connection queue acquisition timed out after ${this.timeoutMs}ms (${this.name})`,
            504,
            "DB_QUEUE_TIMEOUT",
          ),
        );
      }, this.timeoutMs);

      this.queue.push(item);
    });

    this.active++;
    try {
      return await this.asyncLocal.run(true, fn);
    } finally {
      this.active--;
      this.dequeue();
    }
  }

  /**
   * Resume the next waiting operation if capacity is available.
   */
  private dequeue(): void {
    if (this.active < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  /**
   * Current metrics for monitoring and diagnostics.
   */
  public getMetrics(): {
    active: number;
    waiting: number;
    maxConcurrency: number;
    maxQueue: number;
  } {
    return {
      active: this.active,
      waiting: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueue: this.maxQueue,
    };
  }

  /**
   * Drain and reject all waiting operations (e.g. during disconnect or shutdown).
   */
  public clear(reason = "Database connection pool closing"): void {
    while (this.queue.length > 0) {
      const op = this.queue.shift();
      if (op) {
        op.reject(new AppError(reason, 503, "DB_CONNECTION_CLOSING"));
      }
    }
  }
}
