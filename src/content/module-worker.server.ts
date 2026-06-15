/**
 * @file src/content/module-worker.server.ts
 * @description Native worker_threads worker for sandboxed schema module loading.
 *
 * Each worker runs in its own V8 isolate — a crash in one schema file
 * never affects the main process or other workers.
 *
 * Usage: Spawned by module-worker-pool.server.ts, not run directly.
 */

import { stat } from "node:fs/promises";
import { parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { isSafeCollectionPath } from "./collection-path-security.server";

if (!parentPort) {
  throw new Error("module-worker.server.ts must be run as a worker thread");
}

parentPort.on("message", async (msg: { id: number; filePath: string; mtimeMs?: number }) => {
  const { id, filePath, mtimeMs } = msg;

  try {
    if (!isSafeCollectionPath(filePath)) {
      throw new Error(`Unsafe collection path blocked: ${filePath}`);
    }

    const version =
      mtimeMs !== undefined ? String(mtimeMs) : String((await stat(filePath)).mtimeMs);
    const url = `${pathToFileURL(filePath).href}?v=${version}`;
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
