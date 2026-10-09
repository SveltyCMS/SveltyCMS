/**
 * @file src/databases/sqlite/write-batcher.ts
 * @description Group-commit batcher for the SQLite single-writer path.
 *
 * ## Why this exists
 * SQLite has exactly one writer, so the adapter serializes every write on
 * `SQLiteAdapterCore.writeMutex`: N concurrent writes queue and the last one pays
 * ~N× the per-statement cost. The measured 2026-10-06 residual
 * (`competitive-workload-replica`, sqlite) was `p99 − p50 ≈ 5.6 ms` with
 * `SQLITE_WAL_AUTOCHECKPOINT=0 SQLITE_SYNCHRONOUS=OFF` — a write-mutex queue, not
 * fsync. Running the statements that piled up during one drain inside a single
 * `BEGIN IMMEDIATE … COMMIT` lets N writes share one commit.
 *
 * ## Contract
 * The batcher owns scheduling and per-job promise settlement; the adapter owns the
 * transaction. Its `runSingle` / `runBatch` callbacks run under the write mutex and
 * must call `job.run()` — the batcher then resolves/rejects each job with whatever
 * the runner reports (a wrapped op that is already settled is left untouched, so a
 * failing sibling can never overwrite a successful result). A drain that finds a
 * single job takes the `runSingle` path (no group transaction), so a lone write is
 * not delayed by the batching itself.
 *
 * Enabled when the adapter constructs it (default ON, opt-out via
 * `SVELTY_SQLITE_GROUP_COMMIT=0`).
 *
 * ### Features:
 * - Bounded microtask/tick drain (injectable scheduler for deterministic tests)
 * - Per-op settlement isolation — one failure never corrupts a sibling's result
 * - `maxBatchSize` cap so a long queue drains in several bounded transactions
 * - Safety net: a runner that leaves a job unsettled rejects it instead of hanging
 */

/** A queued write whose SQL the runner executes and whose promise the batcher settles. */
export interface PendingWrite<T = unknown> {
  /** Executes this op's SQL. Called by the runner, inside its group transaction. */
  run: () => T;
  /** Settles this op with its individual result. */
  resolve: (value: T) => void;
  /** Settles this op with its individual error (leaves siblings untouched). */
  reject: (error: unknown) => void;
  /** True once resolve/reject has been called; a second settlement is ignored. */
  readonly settled: boolean;
}

class BatchedJob implements PendingWrite<unknown> {
  private done = false;

  constructor(
    readonly run: () => unknown,
    private readonly resolveFn: (value: unknown) => void,
    private readonly rejectFn: (error: unknown) => void,
  ) {}

  get settled(): boolean {
    return this.done;
  }

  resolve(value: unknown): void {
    if (this.done) return;
    this.done = true;
    this.resolveFn(value);
  }

  reject(error: unknown): void {
    if (this.done) return;
    this.done = true;
    this.rejectFn(error);
  }
}

export interface WriteBatcherOptions {
  /** Runs one job (no group transaction). Must call `job.run()`. */
  runSingle: (job: PendingWrite) => Promise<void> | void;
  /** Runs N > 1 jobs under one group transaction. Must call each `job.run()`. */
  runBatch: (jobs: PendingWrite[]) => Promise<void> | void;
  /**
   * Schedules the drain. Defaults to `setImmediate` (a bounded event-loop tick that
   * coalesces writes submitted during the same poll phase), falling back to
   * `queueMicrotask` where unavailable.
   */
  schedule?: (drain: () => void) => void;
  /** Jobs per drain batch (default 256) — caps a single group transaction's span. */
  maxBatchSize?: number;
}

const DEFAULT_MAX_BATCH_SIZE = 256;

const defaultSchedule = (drain: () => void): void => {
  if (typeof setImmediate === "function") setImmediate(drain);
  else queueMicrotask(drain);
};

export class WriteBatcher {
  private queue: PendingWrite[] = [];
  private scheduled = false;
  private draining = false;
  private readonly runSingle: WriteBatcherOptions["runSingle"];
  private readonly runBatch: WriteBatcherOptions["runBatch"];
  private readonly schedule: (drain: () => void) => void;
  private readonly maxBatchSize: number;

  constructor(options: WriteBatcherOptions) {
    this.runSingle = options.runSingle;
    this.runBatch = options.runBatch;
    this.schedule = options.schedule ?? defaultSchedule;
    this.maxBatchSize = Math.max(1, options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE);
  }

  /**
   * Queue `run` and return its own result promise. The job is executed by the next
   * scheduled drain — `queueMicrotask`/`setImmediate`, never a timer that would
   * delay a lone write.
   */
  submit<T>(run: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Safe widening: BatchedJob only ever calls `resolveFn` with the value
      // returned by `run`, which is a T.
      const job = new BatchedJob(run, resolve as (value: unknown) => void, reject);
      this.queue.push(job);
      this.scheduleDrain();
    });
  }

  /** Number of writes currently waiting for the next drain (diagnostics/tests). */
  get pending(): number {
    return this.queue.length;
  }

  private scheduleDrain(): void {
    if (this.scheduled || this.draining) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.maxBatchSize);
        await this.executeBatch(batch);
      }
    } finally {
      this.draining = false;
      // A job submitted during the final `await` needs a fresh schedule (the
      // schedule call while `draining` was suppressed above).
      if (this.queue.length > 0) this.scheduleDrain();
    }
  }

  private async executeBatch(batch: PendingWrite[]): Promise<void> {
    let failure: unknown;
    try {
      if (batch.length === 1) await this.runSingle(batch[0]);
      else await this.runBatch(batch);
    } catch (error) {
      failure = error;
    }
    // Safety net: a runner that threw (or returned without settling) must never
    // leave a caller hanging — reject every job it left untouched.
    for (const job of batch) {
      if (!job.settled) job.reject(failure ?? new Error("SQLite write batch did not settle"));
    }
  }
}
