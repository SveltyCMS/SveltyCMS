/**
 * @file src/content/module-worker.server.ts
 * @description Worker thread for parallel schema loading.
 *
 * This worker receives schema file paths from the WorkerPool in engine.server.ts
 * and loads them in a separate thread to avoid blocking the main event loop.
 *
 * Used in production mode and benchmark environments for parallel schema loading.
 */

import { parentPort } from "node:worker_threads";

parentPort?.on("message", async (msg: { id: number; filePath: string; mtimeMs: number }) => {
  try {
    const { loadSchemaNative } = await import("./loader.server");
    const result = await loadSchemaNative(msg.filePath, msg.mtimeMs);
    parentPort?.postMessage({ id: msg.id, success: true, schema: result ?? undefined });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown worker error";
    parentPort?.postMessage({ id: msg.id, success: false, error: message });
  }
});
