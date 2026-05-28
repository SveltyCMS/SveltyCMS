/**
 * @file src/content/content-watcher.server.ts
 * @description File system watcher for live schema updates in development.
 */

import { watch, existsSync, type FSWatcher } from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";
import { contentService } from "./content-service.server";

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let isReloading = false;

/**
 * Initializes the file system watcher for the compiled collections directory.
 * Optimized for SveltyCMS: flat directory, native fs.watch, zero dependencies.
 */
export function startContentWatcher() {
  const targetDir = path.resolve(process.cwd(), ".compiledCollections");

  if (process.env.BENCHMARK_DEBUG === "true") {
    logger.info(`[Watcher] Monitoring collections at: ${targetDir}`);
  }

  // Defensive check: prevent crashing if directory doesn't exist yet on fresh boot
  if (!existsSync(targetDir)) {
    logger.warn(`[Watcher] Target directory does not exist: ${targetDir}`);
    return () => {};
  }

  // Use native watch which uses Bun's optimized native OS watcher under Bun, and native Node under Node.
  watcher = watch(targetDir, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;

    const filePath = path.join(targetDir, filename);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      if (isReloading) return;

      try {
        isReloading = true;
        const exists = existsSync(filePath);
        const isDelete = eventType === "rename" && !exists;
        const event = isDelete ? "unlink" : "change";

        logger.debug(`[Watcher] Schema ${event} detected: ${filename}`);

        // Mark dirty + full reload
        const { markFileDirty } = await import("./content-service.server");
        markFileDirty(isDelete ? filePath : null);

        await contentService.fullReload(null, false, undefined, isDelete ? null : filePath);

        logger.info(`[Watcher] Content system re-synchronized: ${filename}`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("[Watcher] Failed to reload content system", {
          filename,
          message: error.message,
          stack: error.stack,
        });
      } finally {
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
  };
}
