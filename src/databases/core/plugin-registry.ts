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
      logger.warn(`[DB Registry] Plugin '${plugin.id}' is already registered. Overwriting.`);
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
    this.initialized.clear(); // 🚀  Clear state for clean boot
    const queue = Array.from(this.plugins.values());
    let progressed = true;

    logger.info(`[DB Registry] Booting ${queue.length} services...`);

    // 🚀  Settling delay to ensure proxy registration is finalized
    await new Promise((r) => setTimeout(r, 50));

    while (queue.length > 0 && progressed) {
      progressed = false;

      for (let i = 0; i < queue.length; i++) {
        const plugin = queue[i];
        const deps = plugin.dependencies || [];
        const depsMet = deps.every((d) => this.initialized.has(d));

        if (depsMet) {
          try {
            await plugin.initialize(adapter);
            this.initialized.add(plugin.id);
            queue.splice(i, 1);
            i--;
            progressed = true;
            logger.debug(`[DB Registry] Initialized: ${plugin.id}`);
          } catch (error) {
            logger.error(`[DB Registry] Failed to initialize ${plugin.id}:`, error);
            if (plugin.critical) {
              throw new Error(
                `CRITICAL BOOT FAILURE: Service '${plugin.id}' failed to initialize.`,
              );
            }
            // Non-critical failures still count as "progress" to prevent infinite loops
            this.initialized.add(plugin.id);
            queue.splice(i, 1);
            i--;
            progressed = true;
          }
        }
      }
    }

    if (queue.length > 0) {
      const remaining = queue.map((p) => p.id).join(", ");
      throw new Error(
        `[DB Registry] Circular dependency or missing services detected: ${remaining}`,
      );
    }

    logger.info("[DB Registry] System services online.");
  }
}

export const dbPluginRegistry = new DBPluginRegistry();
