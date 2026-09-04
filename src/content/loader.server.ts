/**
 * @file src/content/loader.server.ts
 * @description
 * Unified schema loader: path security, native/pooled import, and worker thread pool.
 *
 * ### Features:
 * - Directory confinement for compiled collection paths
 * - Production worker-thread sandboxing
 * - Self-healing case-insensitive widgets proxy (dev/native path)
 * - Mtime-based ESM cache busting
 * - Zero-tax deterministic schema hashing
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { getHardwareProfile } from "@utils/hardware-profile";
import { logger } from "@utils/logger";
import { assertCompiledSchema } from "./schema-contract";
import type { Schema } from "./types";

// ─── Runtime mode ────────────────────────────────────────────────────────────

export const contentRuntime = {
  isTest(): boolean {
    return process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";
  },
  // Production runs use the worker pool — the same path real deployments
  // execute. The pool additionally requires the worker chunk to exist next to
  // this module (the build script copies it into the output): during `vite
  // build` SSR evaluation and harness runs the chunk is absent, so schema
  // loading falls back to native in-process loading instead of crashing.
  useWorkerPool(): boolean {
    if (contentRuntime.isTest()) return false;
    if (process.env.NODE_ENV === "development") return false;
    if (process.env.NODE_ENV !== "production") return false;
    return existsSync(new URL("./module-worker.server.ts", import.meta.url));
  },
};

// ─── Path security ───────────────────────────────────────────────────────────

let _pathBases: { compiledBase: string; collectionsBase: string } | null = null;

/** Lazily resolved confinement roots — never recomputed per schema file. */
function getPathBases(): { compiledBase: string; collectionsBase: string } {
  if (!_pathBases) {
    const cwd = path.resolve(process.cwd());
    _pathBases = {
      compiledBase: path.join(cwd, ".compiledCollections").toLowerCase(),
      collectionsBase: path.join(cwd, "config", "collections").toLowerCase(),
    };
  }
  return _pathBases;
}

/** Validates that a schema file path is safe to load (no traversal, correct extension). */
export function isSafeCollectionPath(fullPath: string): boolean {
  const resolved = path.resolve(fullPath).toLowerCase();
  const { compiledBase, collectionsBase } = getPathBases();

  if (resolved.startsWith(compiledBase) && resolved.endsWith(".js")) {
    return true;
  }

  if (resolved.startsWith(collectionsBase) && resolved.endsWith(".ts")) {
    return true;
  }

  return false;
}

// ─── Widgets proxy ───────────────────────────────────────────────────────────

let widgetsProxy: any = null;

async function getWidgetsProxy() {
  if (widgetsProxy) return widgetsProxy;

  const widgetsMap = await widgetRegistryService.getAllWidgets();
  const base = Object.fromEntries(widgetsMap.entries());
  // Case-insensitive lookup map — avoids Object.entries().find() per proxy miss.
  const lowerMap = new Map<string, any>();
  for (const [key, value] of Object.entries(base)) lowerMap.set(key.toLowerCase(), value);

  widgetsProxy = new Proxy(base, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string") return target[prop as any];
      if (prop === "then" || prop === "toJSON" || prop === "constructor" || prop === "prototype") {
        return undefined;
      }
      if (prop in target) return target[prop];
      const match = lowerMap.get(prop.toLowerCase());
      if (match) return match;
      return createFallbackWidget(prop);
    },
  });

  return widgetsProxy;
}

function createFallbackWidget(name: string) {
  const factory = (config: any = {}) => ({
    widget: {
      widgetId: name,
      Name: name,
      Icon: "mdi:widgets-outline",
      Description: `Self-healing fallback for ${name}`,
    },
    label: config.label || name,
    db_fieldName: config.db_fieldName || name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
    required: config.required ?? false,
    ...config,
  });

  factory.Name = name;
  factory.Icon = "mdi:widgets-outline";
  factory.__widgetType = "core";
  factory.__inputComponentPath = "";
  factory.__displayComponentPath = "";
  return factory;
}

function normalizeLoadedSchema(moduleData: unknown, filePath: string): { schema?: Schema } | null {
  const result = assertCompiledSchema(moduleData, filePath);
  if (!result.ok || !result.schema) {
    for (const err of result.errors) {
      logger.warn(`[Loader] Schema contract failed: ${err}`);
    }
    if (!result.errors.length) {
      logger.warn(`[Loader] No valid schema in ${path.basename(filePath)}`);
    }
    return null;
  }
  // Soft warnings (e.g. empty fields draft) — do not reject
  for (const warn of result.errors) {
    logger.debug(`[Loader] Schema contract note: ${warn}`);
  }
  return { schema: result.schema };
}

/** Production uses worker pool; dev/test/benchmarks use fast native import. */
export function shouldUseWorkerPool(): boolean {
  return contentRuntime.useWorkerPool();
}

export async function loadSchemaNative(
  filePath: string,
  mtimeMs?: number,
): Promise<{ schema?: Schema } | null> {
  const fullPath = path.resolve(filePath);

  if (!isSafeCollectionPath(fullPath)) {
    logger.error("[Loader] Blocked unsafe schema path", { path: fullPath });
    return null;
  }

  if (!existsSync(fullPath)) return null;

  try {
    // Install the widgets proxy exactly once — compiled modules resolve bare
    // `widgets.*` through the global, so a per-file await + global write would
    // add one promise hop per schema at boot for zero benefit.
    if ((globalThis as any).widgets !== widgetsProxy) {
      (globalThis as any).widgets = await getWidgetsProxy();
    }

    const urlObj = pathToFileURL(fullPath);
    const version = mtimeMs ?? Date.now();
    urlObj.search = `?v=${version}`;
    const importUrl = urlObj.href;

    const module = await import(/* @vite-ignore */ importUrl);
    const raw = module.default || module.schema || module;

    return normalizeLoadedSchema(raw, filePath);
  } catch (err: any) {
    logger.error(`[Loader] Failed to load ${path.basename(filePath)}`, {
      error: err.message,
      stack: process.env.BENCHMARK_DEBUG === "true" ? err.stack : undefined,
    });
    return null;
  }
}

// ─── Worker pool ─────────────────────────────────────────────────────────────

const TASK_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface Task {
  id: number;
  filePath: string;
  mtimeMs?: number;
  resolve: (result: { schema?: any; error?: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

class ModuleWorkerPool {
  private workers: PooledWorker[] = [];
  private queue: Task[] = [];
  private nextId = 0;
  private poolSize: number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private disabled = false;

  constructor(poolSize: number = getHardwareProfile().workerPoolSize) {
    this.poolSize = Math.max(1, poolSize);
    // Workers spawn lazily on first task. Eager spawning at construction is
    // wrong during builds: the worker chunk is only copied into the output
    // AFTER vite finishes, so every eager spawn failed async and triggered
    // an unbounded error/retry loop.
  }

  /** Spawn workers up to poolSize (no-op when disabled). */
  private ensureWorkers(): void {
    if (this.disabled) return;
    while (this.workers.length < this.poolSize) {
      const worker = this.createWorker();
      if (!worker) break; // sync spawn failure already disabled the pool
      this.workers.push(worker);
    }
  }

  private createWorker(): PooledWorker | null {
    try {
      const worker = new Worker(new URL("./module-worker.server.ts", import.meta.url));

      const pooled: PooledWorker = {
        worker,
        busy: false,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      worker.on("error", (err: Error) => {
        // A worker that never ran a task failed to spawn (missing chunk or
        // module error). Retrying would loop forever — disable the pool and
        // let callers fall back to native in-process loading.
        if (pooled.lastUsedAt === pooled.createdAt) {
          logger.warn(
            `[WorkerPool] Worker failed to start — falling back to native schema loading: ${err.message}`,
          );
          this.disablePool();
          return;
        }
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[WorkerPool] Worker script missing — falling back to native schema loading. ${msg}`,
      );
      this.disablePool();
      return null;
    }
  }

  /** Permanently disables the pool: rejects queued tasks so callers fall back to native loading. */
  private disablePool(): void {
    if (this.disabled) return;
    this.disabled = true;
    this.poolSize = 0;
    for (const w of this.workers) {
      w.worker.removeAllListeners();
      w.worker.terminate().catch(() => {});
    }
    this.workers = [];
    const pending = this.queue;
    this.queue = [];
    for (const task of pending) {
      task.reject(new Error("Worker pool unavailable — falling back to native loading"));
    }
  }

  private replaceWorker(old: PooledWorker): void {
    if (this.disabled) return;
    const idx = this.workers.indexOf(old);
    if (idx >= 0) {
      old.worker.removeAllListeners();
      old.worker.terminate().catch(() => {});
      this.workers.splice(idx, 1);
    }
    if (this.workers.length < this.poolSize) {
      const replacement = this.createWorker();
      if (replacement) this.workers.push(replacement);
    }
    this.processQueue();
  }

  private getIdleWorker(): PooledWorker | null {
    return this.workers.find((w) => !w.busy) || null;
  }

  private processQueue(): void {
    if (this.disabled) {
      const pending = this.queue;
      this.queue = [];
      for (const task of pending) {
        task.reject(new Error("Worker pool unavailable — falling back to native loading"));
      }
      return;
    }
    this.ensureWorkers();
    while (this.queue.length > 0) {
      const worker = this.getIdleWorker();
      if (!worker) break;
      const task = this.queue.shift()!;
      this.executeTask(worker, task);
    }
    this.scheduleIdleCleanup();
  }

  private executeTask(worker: PooledWorker, task: Task): void {
    worker.busy = true;
    // NOTE: lastUsedAt is only advanced by onMessage (proof the worker ran).
    // A spawn/module failure fires 'error' before any message — the error
    // handler uses lastUsedAt === createdAt to detect that and disable the
    // pool (single WARN, no retry spam) instead of treating it as a runtime
    // failure.

    const onMessage = (msg: any) => {
      if (task.timer) clearTimeout(task.timer);
      task.timer = null;
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
    worker.worker.postMessage({
      id: task.id,
      filePath: task.filePath,
      mtimeMs: task.mtimeMs,
    });

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

  async load(filePath: string, mtimeMs?: number): Promise<{ schema?: any; error?: string }> {
    if (this.disabled) {
      // Synchronous rejection — callers fall back to native in-process loading.
      return Promise.reject(new Error("Worker pool unavailable"));
    }
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const task: Task = {
        id,
        filePath,
        mtimeMs,
        resolve,
        reject,
        // Set (not armed) in executeTask — no dummy no-op timer may linger for
        // TASK_TIMEOUT_MS per queued task after the real timeout is installed.
        timer: null,
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    for (const task of this.queue) {
      task.reject(new Error("Worker pool shutting down"));
    }
    this.queue = [];

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

let _pool: ModuleWorkerPool | null = null;

export function getModuleWorkerPool(): ModuleWorkerPool {
  if (!_pool) _pool = new ModuleWorkerPool();
  return _pool;
}

export function warmupWorkerPool(): void {
  const pool = getModuleWorkerPool();
  if (pool.stats.total === 0) {
    logger.debug(`[WorkerPool] Warming up workers...`);
  }
}

export async function shutdownWorkerPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}

export async function loadSchemaPooled(
  filePath: string,
  mtimeMs?: number,
): Promise<{ schema?: Schema } | null> {
  const fullPath = path.resolve(filePath);

  if (!isSafeCollectionPath(fullPath)) {
    logger.error("[WorkerPool] Blocked unsafe schema path", { path: fullPath });
    return null;
  }

  try {
    const pool = getModuleWorkerPool();
    const result = await pool.load(fullPath, mtimeMs);

    if (result.schema && Array.isArray(result.schema.fields)) {
      return normalizeLoadedSchema(result.schema, filePath);
    }

    if (result.error) {
      logger.warn(
        `[WorkerPool] Schema load failed for ${path.basename(filePath)}: ${result.error} — falling back to native load`,
      );
      return loadSchemaNative(filePath, mtimeMs);
    }
    return loadSchemaNative(filePath, mtimeMs);
  } catch {
    return loadSchemaNative(filePath, mtimeMs);
  }
}

/** Smart schema loader — worker pool in production, native elsewhere. */
export async function loadSchema(
  filePath: string,
  mtimeMs?: number,
): Promise<{ schema?: Schema } | null> {
  if (shouldUseWorkerPool()) {
    return loadSchemaPooled(filePath, mtimeMs);
  }
  return loadSchemaNative(filePath, mtimeMs);
}

/** Generates a stable hash for change detection. */
export function generateSchemaHash(schema: Schema): string {
  try {
    const fields = schema.fields;
    const count = fields?.length ?? 0;
    // Single-pass string build — avoids per-field object + JSON.stringify
    // allocations for every compiled schema at boot.
    let str = `${schema.name ?? ""}|${count}`;
    for (let i = 0; i < count; i++) {
      const f = fields[i] as
        | {
            db_fieldName?: string;
            name?: string;
            widget?: { Name?: string };
            type?: string;
            required?: boolean;
          }
        | undefined;
      str += `|${f?.db_fieldName || f?.name || ""}|${f?.widget?.Name || f?.type || ""}|${f?.required ? 1 : 0}`;
    }

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    return (hash >>> 0).toString(36);
  } catch {
    return `err-${Date.now()}`;
  }
}
