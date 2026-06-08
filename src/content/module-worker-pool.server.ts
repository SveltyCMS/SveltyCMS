/**
 * @file src/content/module-worker-pool.server.ts
 * @description Lightweight worker_threads pool for sandboxed schema module loading.
 *
 * Zero external dependencies — uses only Node.js built-in `worker_threads`.
 * Each worker runs in its own V8 isolate with per-worker timeouts.
 *
 * Features:
 * - Fixed-size pool of reusable workers
 * - Automatic worker replacement on crash/timeout
 * - Per-task 10s timeout (prevents hung imports)
 * - Graceful shutdown via terminate()
 * - Promise-based API compatible with existing loadSchemaNative interface
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { logger } from "@utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT = path.resolve(__dirname, "module-worker.server.ts");

const TASK_TIMEOUT_MS = 10_000; // 10s per schema load
const IDLE_TIMEOUT_MS = 30_000; // 30s idle before worker cleanup

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface Task {
  id: number;
  filePath: string;
  resolve: (result: { schema?: any; error?: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class ModuleWorkerPool {
  private workers: PooledWorker[] = [];
  private queue: Task[] = [];
  private nextId = 0;
  private poolSize: number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(poolSize: number = Math.max(2, Math.ceil(require("node:os").cpus().length / 2))) {
    this.poolSize = Math.max(1, poolSize);
    // Pre-spawn workers so they're ready before the first request
    for (let i = 0; i < this.poolSize; i++) {
      this.workers.push(this.createWorker());
    }
  }

  private createWorker(): PooledWorker {
    const worker = new Worker(WORKER_SCRIPT, {
      workerData: {},
      // Bun compatibility: use .ts extension directly
    });

    const pooled: PooledWorker = {
      worker,
      busy: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    worker.on("error", (err: Error) => {
      logger.error(`[WorkerPool] Worker error: ${err.message}`);
      this.replaceWorker(pooled);
    });

    worker.on("exit", (code) => {
      if (code !== 0 && pooled.busy) {
        logger.warn(`[WorkerPool] Worker exited with code ${code}, replacing...`);
        this.replaceWorker(pooled);
      }
    });

    return pooled;
  }

  private replaceWorker(old: PooledWorker): void {
    const idx = this.workers.indexOf(old);
    if (idx >= 0) {
      old.worker.removeAllListeners();
      old.worker.terminate().catch(() => {});
      this.workers.splice(idx, 1);
    }
    // Add replacement if we're below pool size
    if (this.workers.length < this.poolSize) {
      this.workers.push(this.createWorker());
    }
    // Re-queue any tasks that were assigned to the dead worker
    this.processQueue();
  }

  private getIdleWorker(): PooledWorker | null {
    return this.workers.find((w) => !w.busy) || null;
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const worker = this.getIdleWorker();
      if (!worker) break;

      const task = this.queue.shift()!;
      this.executeTask(worker, task);
    }

    // Cleanup idle workers if queue is empty
    this.scheduleIdleCleanup();
  }

  private executeTask(worker: PooledWorker, task: Task): void {
    worker.busy = true;
    worker.lastUsedAt = Date.now();

    const onMessage = (msg: any) => {
      clearTimeout(task.timer);
      worker.worker.off("message", onMessage);
      worker.busy = false;
      worker.lastUsedAt = Date.now();

      if (msg.success) {
        task.resolve({ schema: msg.schema });
      } else {
        task.resolve({ error: msg.error || "Unknown worker error" });
      }

      this.processQueue();
    };

    worker.worker.on("message", onMessage);
    worker.worker.postMessage({ id: task.id, filePath: task.filePath });

    // Timeout guard
    task.timer = setTimeout(() => {
      worker.worker.off("message", onMessage);
      logger.error(`[WorkerPool] Task ${task.id} timed out — replacing worker`);
      this.replaceWorker(worker);
      task.reject(new Error(`Schema load timed out after ${TASK_TIMEOUT_MS}ms`));
    }, TASK_TIMEOUT_MS);
  }

  private scheduleIdleCleanup(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const now = Date.now();
      // Keep at least 1 worker alive
      const idle = this.workers.filter((w) => !w.busy && now - w.lastUsedAt > IDLE_TIMEOUT_MS);
      for (const w of idle) {
        if (this.workers.length <= 1) break;
        const idx = this.workers.indexOf(w);
        if (idx >= 0) {
          w.worker.terminate().catch(() => {});
          this.workers.splice(idx, 1);
        }
      }
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Load a schema module in a worker thread.
   * Returns { schema } on success or { error } on failure.
   */
  async load(filePath: string): Promise<{ schema?: any; error?: string }> {
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const task: Task = {
        id,
        filePath,
        resolve,
        reject,
        timer: setTimeout(() => {}, TASK_TIMEOUT_MS), // placeholder, replaced in executeTask
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  /**
   * Terminate all workers and clear the queue.
   */
  async shutdown(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    // Reject all queued tasks
    for (const task of this.queue) {
      task.reject(new Error("Worker pool shutting down"));
    }
    this.queue = [];

    // Terminate all workers
    await Promise.all(this.workers.map((w) => w.worker.terminate().catch(() => {})));
    this.workers = [];
  }

  get stats() {
    const busy = this.workers.filter((w) => w.busy).length;
    return {
      total: this.workers.length,
      busy,
      idle: this.workers.length - busy,
      queueLength: this.queue.length,
    };
  }
}

// Singleton pool instance
let _pool: ModuleWorkerPool | null = null;

export function getModuleWorkerPool(): ModuleWorkerPool {
  if (!_pool) {
    _pool = new ModuleWorkerPool();
  }
  return _pool;
}

/** Pre-warm the worker pool by spawning initial workers. Call during system init. */
export function warmupWorkerPool(): void {
  const pool = getModuleWorkerPool();
  // Access stats to trigger lazy worker creation
  const { total } = pool.stats;
  if (total === 0) {
    // First access triggers worker creation via processQueue
    logger.info(`[WorkerPool] Warming up ${(pool as any).poolSize || 2} workers...`);
  }
}

export async function shutdownWorkerPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}

export { ModuleWorkerPool };
