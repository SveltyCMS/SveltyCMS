/**
 * @file src/plugins/init.server.ts
 * @description Server-only plugin boot: settings service wiring + plugin registration.
 *
 * Features:
 * - owns the settings-service factory (`PluginSettingsService`), which pulls
 *   node:crypto — kept out of the browser-reachable `./index` barrel on purpose
 * - registers every plugin, resolves parts for enabled ones, runs migrations
 * - one findMany for the effective enablement map
 */

import { logger } from "@utils/logger";
import { availablePlugins, pluginRegistry } from "./index";
import { PluginSettingsService } from "./settings";
import type { IDBAdapter } from "@databases/db-interface";

// The registry is browser-reachable and must not import the service module itself
// (node:crypto in the client bundle); it receives a factory instead. Registered at
// module load so the lazy path in `registry.togglePlugin()` works too.
pluginRegistry.setSettingsServiceFactory(
  (dbAdapter: IDBAdapter) => new PluginSettingsService(dbAdapter),
);

/**
 * Initialize plugin system
 * Registers all plugins and runs migrations
 *
 * Called during server startup from src/databases/db.ts
 */
export async function initializePlugins(dbAdapter: any, tenantId = "default"): Promise<void> {
  try {
    logger.info("🔌 Initializing plugin system...");

    // 1. Initialize settings service
    await pluginRegistry.initializeSettings(dbAdapter);

    // 1.5 Resolve effective enablement in ONE findMany (warms the L1 cache) —
    // DB state wins, else the plugin's static `metadata.enabled` default.
    const pluginStates = await pluginRegistry.getAllPluginStates(tenantId);
    const enabledById = new Map(pluginStates.map((s) => [String(s.pluginId), s.enabled === true]));
    const defaultEnabledById = new Map(
      availablePlugins.map((p) => [p.metadata.id, p.metadata.enabled !== false]),
    );
    const isEnabled = (id: string): boolean =>
      enabledById.has(id) ? enabledById.get(id) === true : (defaultEnabledById.get(id) ?? false);

    // 2. Register all available plugins. Only ENABLED plugins get their server
    //    module merged, parts resolved, and migrations run — default-disabled
    //    plugins (commerce, stripe, …) stay inert until `togglePlugin` activates
    //    them lazily. `register` still runs for every plugin so the admin list,
    //    `pluginRegistry.get()`, and metadata capabilities stay consistent.
    const maxConcurrency = parseInt(process.env.EXTENSIONS_STORAGE_MAX_CONCURRENCY || "5", 10);
    const activeIds = new Set<string>();

    for (let i = 0; i < availablePlugins.length; i += maxConcurrency) {
      const chunk = availablePlugins.slice(i, i + maxConcurrency);
      await Promise.all(
        chunk.map(async (plugin) => {
          const pluginId = plugin.metadata.id;
          const active = isEnabled(pluginId);
          if (active) activeIds.add(pluginId);

          try {
            if (active) {
              const serverMod = await import(`./${pluginId}/index.server`);
              if (serverMod.hooks) {
                plugin.hooks = { ...plugin.hooks, ...serverMod.hooks };
              }
              if ((!plugin.migrations || plugin.migrations.length === 0) && serverMod.migrations) {
                plugin.migrations = serverMod.migrations;
              }
            }
          } catch {
            /* UI-only plugin — no index.server.ts */
          }
          await pluginRegistry.register(plugin);

          // Resolve discriminated-union parts (schema, routes, capabilities, settings, etc.)
          // for active plugins only. Disabled plugins resolve lazily on enable.
          if (active) {
            pluginRegistry.resolveParts(plugin);
          }
        }),
      );
    }

    // 3. Run migrations for enabled plugins only
    await pluginRegistry.runAllMigrations(dbAdapter, tenantId, activeIds);

    // 3.5 Reconcile plugin capabilities into merged catalog
    await pluginRegistry.reconcileCapabilities();

    // 4. Mark as initialized
    pluginRegistry.markInitialized();

    logger.info("✅ Plugin system initialized");
  } catch (error) {
    logger.error("💥 Failed to initialize plugin system", { error });
    // 🚀 HARDENING: Throw the error to stop the boot process if plugins fail.
    // Incomplete migrations lead to inconsistent state and 500 errors.
    throw error;
  }
}
