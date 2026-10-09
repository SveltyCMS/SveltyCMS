/**
 * @file src/databases/core/statement-coalescer.ts
 * @description Per-collection tick buffer that coalesces concurrent single-row
 * writes into one multi-row statement (Phase 2 statement coalescing).
 *
 * Scheduling-level coalescing (network-db-queue-gate.ts) batches pool-permit
 * acquisition, but every write still pays its own statement round trip. This
 * module batches the *statements*: N concurrent INSERTs/UPDATEs for the same
 * collection (and identical column signature) that land within one
 * event-loop tick become a single multi-row statement (PostgreSQL: UNNEST
 * arrays), turning N TCP round trips into one.
 *
 * ### Fault isolation (Trap #1)
 * - batch.length === 1 → the row's own single-statement path (no extra hop).
 * - Engine declines the batch (returns null) or the combined statement fails
 *   (e.g. a unique violation on one row aborts it) → every row replays through
 *   its individual path: the failing row rejects its own caller, siblings
 *   commit untouched.
 *
 * ### Scheduling
 * Drains on a tick boundary (`setImmediate`, microtask fallback) — a microtask
 * drain would only capture writes arriving in the same synchronous turn,
 * which concurrent HTTP requests almost never do (see sqlite/write-batcher.ts
 * for the proven tick pattern). A lone write pays at most one tick.
 */

export interface CoalescedInsertEntry<T = unknown> {
  /** Row values prepared by the adapter (ready for the multi-row statement). */
  values: Record<string, any>;
  /** This row's own single-statement execution (replay/fault path). */
  runSingle: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export type InsertBatchRunner<T = unknown> = (values: Record<string, any>[]) => Promise<T[] | null>;

const defaultSchedule = (drain: () => void): void => {
  if (typeof setImmediate === "function") setImmediate(drain);
  else queueMicrotask(drain);
};

export class StatementCoalescer<T = unknown> {
  private queue: CoalescedInsertEntry<T>[] = [];
  private scheduled = false;
  private draining = false;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly runBatch: InsertBatchRunner<T>;
  private readonly schedule: (drain: () => void) => void;
  private readonly windowMs: number;
  /** Rows coalesced into multi-row statements (diagnostics/tests). */
  private batchedRows = 0;
  /** Multi-row batches executed (diagnostics/tests). */
  private batchCount = 0;

  constructor(
    runBatch: InsertBatchRunner<T>,
    schedule?: (drain: () => void) => void,
    windowMs = 0,
  ) {
    this.runBatch = runBatch;
    this.schedule = schedule ?? defaultSchedule;
    this.windowMs = Math.max(0, windowMs);
  }

  /** Number of rows currently waiting for the next drain. */
  get pending(): number {
    return this.queue.length;
  }

  /** Diagnostics: rows that skipped the single-statement path. */
  get metrics(): { batchedRows: number; batchCount: number } {
    return { batchedRows: this.batchedRows, batchCount: this.batchCount };
  }

  /** Queue a row and return its own result promise. */
  submit(values: Record<string, any>, runSingle: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ values, runSingle, resolve, reject });
      if (this.queue.length >= 64) {
        this.flushHold();
      } else {
        this.scheduleDrain();
      }
    });
  }

  private scheduleDrain(): void {
    if (this.scheduled || this.draining || this.holdTimer) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      // Burst-hold window: if multiple rows arrived and a window is configured, hold to accumulate cross-tick arrivals
      if (this.windowMs > 0 && this.queue.length > 1 && !this.holdTimer) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          void this.drain();
        }, this.windowMs);
        return;
      }
      void this.drain();
    });
  }

  private flushHold(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.scheduled = false;
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.queue.length);
        await this.executeBatch(batch);
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) this.scheduleDrain();
    }
  }

  private async executeBatch(batch: CoalescedInsertEntry<T>[]): Promise<void> {
    if (batch.length === 1) {
      await this.settleSingle(batch[0]);
      return;
    }

    try {
      const rows = await this.runBatch(batch.map((entry) => entry.values));
      if (rows === null || rows.length !== batch.length) {
        // Engine declined or partial result — replay per row (fault isolation).
        throw new Error("insert batch declined");
      }
      this.batchedRows += batch.length;
      this.batchCount++;
      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(rows[i]);
      }
    } catch {
      for (const entry of batch) {
        await this.settleSingle(entry);
      }
    }
  }

  private async settleSingle(entry: CoalescedInsertEntry<T>): Promise<void> {
    try {
      entry.resolve(await entry.runSingle());
    } catch (error) {
      entry.reject(error);
    }
  }
}
