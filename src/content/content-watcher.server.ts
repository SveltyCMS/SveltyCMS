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

/**
 * Starts the content watcher if in development mode.
 * Listens for changes in the config/collections directory.
 */
export function startContentWatcher() {
  if (!dev || watcher) return;

  const collectionsDir = "config/collections";
  logger.info(`👀 Starting intelligent content watcher on ${collectionsDir}`);

  // Initialize watcher with stability threshold to avoid partial file reads
  watcher = chokidar.watch(collectionsDir, {
    ignored: /(^|[/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger on startup
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 100,
    },
  });

  // Handle all relevant file events
  watcher.on("all", async (event: string, filePath: string) => {
    if (!["add", "change", "unlink"].includes(event)) return;

    logger.info(`🔄 Content change detected [${event}]: ${filePath}`);

    try {
      // Trigger incremental reload for all tenants (null)
      await contentService.fullReload(null, false, undefined, true);
      logger.info("✅ Incremental reconciliation completed");
    } catch (error) {
      logger.error("❌ Incremental reconciliation failed", error);
    }
  });

  logger.info("Content watcher active — incremental updates enabled");

  // Graceful shutdown
  process.on("SIGTERM", () => {
    watcher?.close();
    watcher = null;
  });
}
