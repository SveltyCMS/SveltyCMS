/**
 * @file src/databases/core/plugin-registry.ts
 * @description Orchestrates the database initialization sequence using a plugin-based registry.
 */

import { logger } from "@src/utils/logger";
import type { IDBAdapter } from "../db-interface";

export interface DBInitPlugin {
  /**
   * Unique identifier for the plugin (e.g., 'auth', 'media', 'seo')
   */
  id: string;

  /**
   * List of plugin IDs that must be initialized before this one.
   */
  dependencies?: string[];

  /**
   * If true, failure to initialize this plugin will halt the system boot.
   */
  critical?: boolean;

  /**
   * Initialization logic for the service.
   */
  initialize(adapter: IDBAdapter): Promise<void>;
}

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

    // Zero settling delay — proxy registrations are synchronous.

    while (queue.length > 0) {
      const readyToBoot: DBInitPlugin[] = [];
      const blocked: DBInitPlugin[] = [];
      for (let i = 0; i < queue.length; i++) {
        const plugin = queue[i];
        const deps = plugin.dependencies;
        if (!deps || deps.every((d) => this.initialized.has(d))) {
          readyToBoot.push(plugin);
        } else {
          blocked.push(plugin);
        }
      }

      if (readyToBoot.length === 0) {
        const remaining = blocked.map((p) => p.id).join(", ");
        throw new Error(
          `[DB Registry] Circular dependency or missing services detected: ${remaining}`,
        );
      }

      await Promise.all(
        readyToBoot.map(async (plugin) => {
          try {
            logger.debug(`[DB Registry] Initializing service: ${plugin.id}...`);
            await plugin.initialize(adapter);
            this.initialized.add(plugin.id);
            logger.debug(`[DB Registry] Initialized: ${plugin.id}`);
          } catch (error) {
            logger.error(`[DB Registry] Failed to initialize ${plugin.id}:`, error);
            if (plugin.critical) {
              throw new Error(
                `CRITICAL BOOT FAILURE: Service '${plugin.id}' failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
            this.initialized.add(plugin.id);
          }
        }),
      );
      queue.length = 0;
      for (let i = 0; i < blocked.length; i++) queue.push(blocked[i]);
    }

    logger.info("[DB Registry] System services online.");
  }
}

export const dbPluginRegistry = new DBPluginRegistry();
