/**
 * @file src/content/module-worker.server.ts
 * @description Native worker_threads worker for sandboxed schema module loading.
 *
 * Each worker runs in its own V8 isolate — a crash in one schema file
 * never affects the main process or other workers. The pool replaces
 * dead workers transparently.
 *
 * Usage: Spawned by module-worker-pool.server.ts, not run directly.
 */

import { parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";

if (!parentPort) {
  throw new Error("module-worker.server.ts must be run as a worker thread");
}

parentPort.on("message", async (msg: { id: number; filePath: string }) => {
  const { id, filePath } = msg;

  try {
    // Convert filesystem path to file:// URL for ESM import
    const url = pathToFileURL(filePath).href;
    const mod = await import(url);
    const schema = mod.default?.default || mod.default || mod.schema;

    parentPort!.postMessage({
      id,
      success: true,
      schema: schema || null,
    });
  } catch (err: any) {
    parentPort!.postMessage({
      id,
      success: false,
      error: err?.message || String(err),
    });
  }
});
