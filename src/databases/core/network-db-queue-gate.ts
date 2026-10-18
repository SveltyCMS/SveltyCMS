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
 * - Adaptive UPDATE lane (`SVELTY_WRITE_COALESCE_UPDATE=1`): an update on an idle
 *   gate skips the coalescer scheduling hop entirely
 * - Observability metrics (active, waiting, maxConcurrency, maxQueue)
 * - Safe re-entrancy via AsyncLocalStorage (transactions and nested queries share a single permit)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import {
  AdaptiveWriteCoalescer,
  type CoalescerMetrics,
  type WriteOperationKind,
} from "./write-coalescer";

export interface NetworkDbQueueGateOptions {
  /** Maximum number of concurrent database operations executing simultaneously. */
  maxConcurrency: number;
  /** Maximum number of requests allowed to wait in the queue. Defaults to 500. */
  maxQueue?: number;
  /** Maximum time (in ms) a request can wait in the queue before timing out. Defaults to 15000ms. */
  timeoutMs?: number;
  /** Name of the database adapter for diagnostic log messages. */
  name?: string;
  /** Whether to enable adaptive micro-batch write coalescing. Defaults to true. */
  enableWriteCoalescing?: boolean;
}

interface QueuedOperation {
  resolve: () => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AdaptiveUpdateMetrics {
  /** Whether `SVELTY_WRITE_COALESCE_UPDATE=1` is active for this gate. */
  enabled: boolean;
  /** Updates that executed without the scheduler hop (idle queue). */
  immediate: number;
  /** Updates that were held because another mutation was already in flight. */
  coalesced: number;
}

export class NetworkDbQueueGate {
  private active = 0;
  private readonly queue: QueuedOperation[] = [];
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;
  private readonly timeoutMs: number;
  private readonly name: string;
  private readonly asyncLocal = new AsyncLocalStorage<boolean>();
  private readonly writeCoalescer: AdaptiveWriteCoalescer | null;
  private readonly adaptiveUpdates: boolean;
  /** `SVELTY_WRITE_COALESCING=1` — coalesce every write (inserts included). */
  private readonly coalesceAllWrites: boolean;
  private immediateUpdates = 0;
  private coalescedUpdates = 0;

  constructor(options: NetworkDbQueueGateOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
    this.maxQueue = Math.max(1, options.maxQueue ?? 500);
    this.timeoutMs = Math.max(500, options.timeoutMs ?? 15_000);
    this.name = options.name ?? "NetworkDB";
    // Either flag opts into coalescing. The UPDATE flag on its own is enough so
    // an operator does not have to remember two env vars, and it additionally
    // switches updates to the adaptive (no-hop-when-idle) lane.
    const coalescingEnabled =
      process.env.SVELTY_WRITE_COALESCING === "1" ||
      process.env.SVELTY_WRITE_COALESCE_UPDATE === "1";
    this.coalesceAllWrites = process.env.SVELTY_WRITE_COALESCING === "1";
    this.adaptiveUpdates = process.env.SVELTY_WRITE_COALESCE_UPDATE === "1";
    this.writeCoalescer =
      options.enableWriteCoalescing === true && coalescingEnabled
        ? new AdaptiveWriteCoalescer({ name: `${this.name}Coalescer` })
        : null;
  }

  /**
   * Whether the current async execution context already holds an active gate permit.
   */
  public isInsideActiveContext(): boolean {
    return !!this.asyncLocal.getStore();
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

    // 🛡️ The permit was reserved in dequeue() at handoff (active++ happens there)
    // so a concurrent fast-path admission cannot oversubscribe. Do NOT increment
    // here again.
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
        // Reserve the slot NOW, at handoff, before the waiter resumes. Otherwise
        // the fast path (active < maxConcurrency && queue empty) could admit a
        // fresh request into the just-vacated slot while the shifted waiter has
        // not yet incremented active, oversubscribing past maxConcurrency.
        this.active++;
        next.resolve();
      }
    }
  }

  /**
   * Coalesce a write operation during high-concurrency bursts.
   * Dispatches immediately when idle; micro-batches when concurrent writers queue.
   *
   * With `SVELTY_WRITE_COALESCE_UPDATE=1`, an UPDATE that finds the queue and
   * the gate completely idle runs immediately: the scheduler hop exists only to
   * batch siblings, and there is no sibling to batch. Once any mutation is in
   * flight/queued, later updates take the coalesced path as before.
   */
  public async coalesceWrite<T>(fn: () => Promise<T>, operation?: WriteOperationKind): Promise<T> {
    if (!this.writeCoalescer) {
      return this.acquire(fn);
    }
    // The UPDATE-only flag must not change insert/delete scheduling: those keep
    // their pre-existing direct `acquire` path unless SVELTY_WRITE_COALESCING=1.
    if (!this.coalesceAllWrites && operation !== "update") {
      return this.acquire(fn);
    }
    if (this.adaptiveUpdates && operation === "update" && this.canAdmitUpdateImmediately()) {
      this.immediateUpdates++;
      return this.acquire(fn);
    }
    if (operation === "update") this.coalescedUpdates++;
    return this.writeCoalescer.submit(() => this.acquire(fn));
  }

  /**
   * No queue, no scheduled drain, no in-flight query, no active permit.
   * `active` counts every gated query (reads included), so an update never
   * jumps ahead of a read that currently holds a connection.
   */
  private canAdmitUpdateImmediately(): boolean {
    return this.active === 0 && this.queue.length === 0 && (this.writeCoalescer?.isIdle() ?? true);
  }

  /**
   * Retrieve write coalescer metrics.
   */
  public getCoalescerMetrics(): CoalescerMetrics | null {
    return this.writeCoalescer ? this.writeCoalescer.getMetrics() : null;
  }

  /**
   * Current metrics for monitoring and diagnostics.
   */
  public getMetrics(): {
    active: number;
    waiting: number;
    maxConcurrency: number;
    maxQueue: number;
    coalescing?: CoalescerMetrics | null;
    adaptiveUpdates?: AdaptiveUpdateMetrics;
  } {
    return {
      active: this.active,
      waiting: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueue: this.maxQueue,
      coalescing: this.getCoalescerMetrics(),
      adaptiveUpdates: {
        enabled: this.adaptiveUpdates,
        immediate: this.immediateUpdates,
        coalesced: this.coalescedUpdates,
      },
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
