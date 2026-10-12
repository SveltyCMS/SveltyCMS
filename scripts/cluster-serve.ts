/**
 * @file scripts/cluster-serve.ts
 * @description One-host multi-process server.
 *
 * The primary forks `SVELTY_CLUSTER_WORKERS` copies of the built server onto
 * one shared port and does not serve traffic itself. Each worker is its own
 * event loop. Sessions, the database, and Redis cache epochs are shared.
 * In-process pub/sub does not cross workers. Unset or `1` boots a single
 * process, the same as `bun index.cjs`.
 *
 * ### Features:
 * - Shared listening socket via `node:cluster`
 * - Restarts a worker that exits until the primary is stopped
 *
 * Run: `SVELTY_CLUSTER_WORKERS=4 bun run start:cluster`
 */

import cluster from "node:cluster";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function serverEntry(): string {
  const built = path.resolve(process.cwd(), "build/index.js");
  if (existsSync(built)) return built;
  const root = path.resolve(process.cwd(), "index.cjs");
  if (existsSync(root)) return root;
  throw new Error("cluster-serve: build/index.js is missing. Run bun run build first.");
}

async function bootServer(): Promise<void> {
  const entry = serverEntry();
  const loaded: {
    startServer?: () => Promise<void> | void;
    default?: () => Promise<void> | void;
  } = await import(pathToFileURL(entry).href);
  if (typeof loaded.startServer === "function") {
    await loaded.startServer();
    return;
  }
  if (typeof loaded.default === "function") {
    await loaded.default();
  }
}

function workerCount(): number {
  const raw = Number(process.env.SVELTY_CLUSTER_WORKERS || "1");
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

let shuttingDown = false;

function stop(): void {
  shuttingDown = true;
  const workers = cluster.workers;
  if (workers) {
    for (const worker of Object.values(workers)) worker?.kill();
  }
  process.exit(0);
}

if (!cluster.isPrimary) {
  bootServer().catch((err: unknown) => {
    console.error("[cluster] worker boot failed:", err);
    process.exit(1);
  });
} else if (workerCount() <= 1) {
  bootServer().catch((err: unknown) => {
    console.error("[cluster] boot failed:", err);
    process.exit(1);
  });
} else {
  const count = workerCount();
  console.log(`[cluster] forking ${count} workers`);
  for (let i = 0; i < count; i++) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    const pid = worker.process.pid ?? "?";
    console.error(`[cluster] worker ${pid} exited (${signal || code}); restarting`);
    cluster.fork();
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
