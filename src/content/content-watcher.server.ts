/**
 * @file src/content/content-watcher.server.ts
 * @description File system watcher for live schema updates in development.
 *
 * ### Features:
 * - Recursive watch on `.compiledCollections/`
 * - Debounced batching via flushChangedFiles (multi-file saves → one reload pass)
 * - Surgical incremental updates with full-reload fallback on deletes
 */

import { watch, existsSync, type FSWatcher } from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let isReloading = false;
let pendingFullReload = false;

/**
 * Initializes the file system watcher for the compiled collections directory.
 */
export function startContentWatcher() {
  const targetDir = path.resolve(process.cwd(), ".compiledCollections");

  if (process.env.BENCHMARK_DEBUG === "true") {
    logger.info(`[Watcher] Monitoring collections at: ${targetDir}`);
  }

  if (!existsSync(targetDir)) {
    logger.warn(`[Watcher] Target directory does not exist: ${targetDir}`);
    return () => {};
  }

  watcher = watch(targetDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;

    const filePath = path.join(targetDir, filename);
    const exists = existsSync(filePath);
    const isDelete = eventType === "rename" && !exists;

    void (async () => {
      const { markFileDirty } = await import("./content-service.server");
      markFileDirty(filePath);
      if (isDelete) pendingFullReload = true;
    })();

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      if (isReloading) return;

      try {
        isReloading = true;
        const { contentService } = await import("./content-service.server");

        await contentService.processChangedFiles(null, undefined, {
          requireFullReload: pendingFullReload,
        });

        logger.info(`[Watcher] Content system re-synchronized (batched)`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("[Watcher] Failed to reload content system", {
          filename,
          message: error.message,
          stack: error.stack,
        });
      } finally {
        pendingFullReload = false;
        isReloading = false;
      }
    }, 400);
  });

  return () => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingFullReload = false;
  };
}
