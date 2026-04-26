/**
 * @file src/content/content-watcher.ts
 * @description File system watcher for live schema updates in development.
 */

import chokidar from "chokidar";
import path from "node:path";
import { logger } from "@utils/logger";
import { contentService } from "./content-service.server";

let debounceTimer: NodeJS.Timeout | null = null;
let isReloading = false;

/**
 * Initializes the file system watcher for the compiled collections directory.
 */
export function startContentWatcher() {
  const targetDir = path.resolve(process.cwd(), ".compiledCollections");

  logger.info(`[Watcher] Monitoring collections at: ${targetDir}`);

  const watcher = chokidar.watch(targetDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("all", (event, filePath) => {
    if (!["add", "change", "unlink"].includes(event)) return;
    if (!filePath.endsWith(".js")) return;

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      if (isReloading) return;

      try {
        isReloading = true;
        logger.debug(
          `[Watcher] Schema ${event} detected: ${path.basename(filePath)}. Reloading...`,
        );

        const { markFileDirty } = await import("./content-service.server");
        markFileDirty(event === "unlink" ? filePath : null);

        await contentService.fullReload(
          null,
          false,
          undefined,
          event === "unlink" ? null : filePath,
        );

        logger.info("[Watcher] Content system re-synchronized successfully.");
      } catch (err) {
        if (err instanceof Error) {
          logger.error("[Watcher] Failed to reload content system", {
            message: err.message,
            stack: err.stack,
            name: err.name,
          });
        } else {
          logger.error("[Watcher] Failed to reload content system (unknown error type)", {
            error: String(err),
          });
        }
      } finally {
        isReloading = false;
      }
    }, 400);
  });

  return () => watcher.close();
}
