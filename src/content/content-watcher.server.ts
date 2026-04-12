/**
 * @file src/content/content-watcher.server.ts
 * @description
 * Intelligent file watcher for collection schemas in development mode.
 * Detects additions, changes, and deletions to trigger incremental reconciliation.
 */

import { dev } from "$app/environment";
import { logger } from "@utils/logger.server";
import chokidar, { type FSWatcher } from "chokidar";
import { contentService } from "./content-service.server";

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let isReloading = false;

/**
 * Stops the content watcher.
 */
export function stopContentWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    logger.info("Content watcher stopped");
  }
}

/**
 * Starts the content watcher if in development mode.
 * Listens for changes in the .compiledCollections directory.
 */
export function startContentWatcher() {
  if (!dev || watcher) return;

  // Fix: Watches source config/collections but service reads .compiledCollections — changed to watch compiled output
  const compiledDir = ".compiledCollections";
  logger.info(`👀 Starting intelligent content watcher on ${compiledDir}`);

  // Initialize watcher with stability threshold to avoid partial file reads
  watcher = chokidar.watch(compiledDir, {
    ignored: /(^|[/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger on startup
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  // Fix: No watcher.on("error") handler — added one to prevent process crash
  watcher.on("error", (error) => {
    logger.error("Content watcher error:", error);
  });

  // Handle all relevant file events
  watcher.on("all", async (event: string, filePath: string) => {
    if (!["add", "change", "unlink"].includes(event)) return;

    logger.info(`🔄 Content change detected [${event}]: ${filePath}`);

    // Fix: No debounce and no concurrency lock — rapid saves trigger racing reconciliations
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      if (isReloading) {
        logger.debug("Skipping reconciliation: Reload already in progress");
        return;
      }

      isReloading = true;
      try {
        // Trigger incremental reload for all tenants (null)
        await contentService.fullReload(null, false, undefined, true);
        logger.info("✅ Incremental reconciliation completed");
      } catch (error) {
        logger.error("❌ Incremental reconciliation failed", error);
      } finally {
        isReloading = false;
      }
    }, 500); // 300ms debounce
  });

  logger.info("Content watcher active — incremental updates enabled");
}

// Fix: SIGTERM handler registered inside function body; no SIGINT handler — moved to top level
if (typeof process !== "undefined") {
  process.on("SIGTERM", stopContentWatcher);
  process.on("SIGINT", stopContentWatcher);
}
