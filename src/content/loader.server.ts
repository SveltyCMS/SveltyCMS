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
import * as fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { logger } from "@utils/logger";
import type { Schema } from "./types";

// ─── Runtime mode ────────────────────────────────────────────────────────────

export const contentRuntime = {
  isBenchmark(): boolean {
    return (
      process.env.BENCHMARK_STABLE === "true" ||
      process.env.BENCHMARK_MODE === "1" ||
      process.env.BENCHMARK_MODE === "true" ||
      process.env.SVELTY_BENCHMARK_SUITE === "true"
    );
  },
  isTest(): boolean {
    return process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";
  },
  useWorkerPool(): boolean {
    if (contentRuntime.isBenchmark()) return false;
    if (contentRuntime.isTest()) return false;
    if (process.env.NODE_ENV === "development") return false;
    return process.env.NODE_ENV === "production";
  },
};

// ─── Path security ───────────────────────────────────────────────────────────

/** Validates that a schema file path is safe to load (no traversal, correct extension). */
export function isSafeCollectionPath(fullPath: string): boolean {
  const resolved = path.resolve(fullPath).toLowerCase();
  const cwd = path.resolve(process.cwd()).toLowerCase();
  const compiledBase = path.join(cwd, ".compiledCollections").toLowerCase();
  const collectionsBase = path.join(cwd, "config", "collections").toLowerCase();

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

  widgetsProxy = new Proxy(base, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string") return target[prop as any];
      if (prop === "then" || prop === "toJSON" || prop === "constructor" || prop === "prototype") {
        return undefined;
      }
      if (prop in target) return target[prop];
      const lower = prop.toLowerCase();
      const match = Object.entries(target).find(([k]) => k.toLowerCase() === lower);
      if (match) return match[1];
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
  let schema = moduleData as any;
  if (schema?.default && typeof schema.default === "object") {
    schema = schema.default?.default || schema.default || schema.schema;
  } else if (schema?.schema) {
    schema = schema.schema;
  }

  if (schema && typeof schema === "object" && Array.isArray(schema.fields)) {
    if (!schema._id && schema.name) {
      schema._id = schema.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    }
    return { schema: schema as Schema };
  }

  logger.warn(`[Loader] No valid schema in ${path.basename(filePath)}`);
  return null;
}

async function resolveImportVersion(filePath: string, mtimeMs?: number): Promise<string> {
  if (contentRuntime.isBenchmark()) return "stable";
  if (mtimeMs !== undefined) return String(mtimeMs);
  try {
    const stats = await fsPromises.stat(filePath);
    return String(stats.mtimeMs);
  } catch {
    return "0";
  }
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
    (globalThis as any).widgets = await getWidgetsProxy();

    const fileUrl = `file://${fullPath.replace(/\\/g, "/")}`;
    const version = await resolveImportVersion(fullPath, mtimeMs);
    const importUrl = `${fileUrl}?v=${version}`;

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT = path.resolve(__dirname, "module-worker.server.ts");

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
  timer: ReturnType<typeof setTimeout>;
}

class ModuleWorkerPool {
  private workers: PooledWorker[] = [];
  private queue: Task[] = [];
  private nextId = 0;
  private poolSize: number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(poolSize: number = Math.max(2, Math.ceil(os.cpus().length / 2))) {
    this.poolSize = Math.max(1, poolSize);
    for (let i = 0; i < this.poolSize; i++) {
      this.workers.push(this.createWorker());
    }
  }

  private createWorker(): PooledWorker {
    const worker = new Worker(WORKER_SCRIPT, { workerData: {} });

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
    if (this.workers.length < this.poolSize) {
      this.workers.push(this.createWorker());
    }
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
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const task: Task = {
        id,
        filePath,
        mtimeMs,
        resolve,
        reject,
        timer: setTimeout(() => {}, TASK_TIMEOUT_MS),
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
    logger.info(`[WorkerPool] Warming up workers...`);
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
        `[WorkerPool] Schema load failed for ${path.basename(filePath)}: ${result.error}`,
      );
    }
    return null;
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
    const relevant = {
      name: schema.name,
      fieldsCount: schema.fields?.length ?? 0,
      fieldSignatures: schema.fields?.map((f: any) => ({
        name: f.db_fieldName || f.name,
        type: f.widget?.Name || f.type,
        required: !!f.required,
      })),
    };

    const str = JSON.stringify(relevant);
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
