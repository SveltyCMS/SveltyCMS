/**
 * @file src/databases/core/plugin-registry.ts
 * @description Orchestrates the database initialization sequence using a plugin-based registry.
 */

import { logger } from "@src/utils/logger";
import type { IDBAdapter } from "../db-interface";
import type { DBInitPlugin } from "./plugin-interface";

export class DBPluginRegistry {
  private plugins: Map<string, DBInitPlugin> = new Map();
  private initialized: Set<string> = new Set();

  /**
   * Register a new initialization plugin.
   */
  public register(plugin: DBInitPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.info(`[DB Registry] Plugin '${plugin.id}' is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * 🚀  RESET: Fully clear all registered plugins and state.
   * Required for benchmarks and tests that need a clean boot.
   */
  public reset(): void {
    this.plugins.clear();
    this.initialized.clear();
    logger.info("[DB Registry] Plugin registry reset.");
  }

  /**
   * Orchestrates the initialization of all registered plugins.
   * Uses a basic topological sort to resolve dependencies.
   */
  public async bootAll(adapter: IDBAdapter): Promise<void> {
    logger.info(`[DB Registry] bootAll started with ${this.plugins.size} plugins`);
    this.initialized.clear();
    const queue = Array.from(this.plugins.values());

    logger.info(`[DB Registry] Booting ${queue.length} services...`);

    // 🚀 PERFORMANCE: Reduced settling delay from 50ms to 5ms.
    // This is just to ensure any Proxy-based registration is finalized.
    await new Promise((r) => setTimeout(r, 5));
    logger.info(`[DB Registry] bootAll settling delay finished`);

    while (queue.length > 0) {
      // Find all plugins whose dependencies are met
      const readyToBoot = queue.filter((plugin) => {
        const deps = plugin.dependencies || [];
        return deps.every((d) => this.initialized.has(d));
      });

      if (readyToBoot.length === 0) {
        const remaining = queue.map((p) => p.id).join(", ");
        throw new Error(
          `[DB Registry] Circular dependency or missing services detected: ${remaining}`,
        );
      }

      // 🚀 PERFORMANCE: Parallelize initialization of all ready plugins
      await Promise.all(
        readyToBoot.map(async (plugin) => {
          try {
            logger.info(`[DB Registry] Initializing service: ${plugin.id}...`);
            await plugin.initialize(adapter);
            this.initialized.add(plugin.id);
            // Remove from queue
            const index = queue.findIndex((p) => p.id === plugin.id);
            if (index !== -1) queue.splice(index, 1);
            logger.debug(`[DB Registry] Initialized: ${plugin.id}`);
          } catch (error) {
            logger.error(`[DB Registry] Failed to initialize ${plugin.id}:`, error);
            if (plugin.critical) {
              throw new Error(
                `CRITICAL BOOT FAILURE: Service '${plugin.id}' failed to initialize.`,
              );
            }
            this.initialized.add(plugin.id);
            const index = queue.findIndex((p) => p.id === plugin.id);
            if (index !== -1) queue.splice(index, 1);
          }
        }),
      );
    }

    logger.info("[DB Registry] System services online.");
  }
}

export const dbPluginRegistry = new DBPluginRegistry();
