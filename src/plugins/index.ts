/**
 * @file src/plugins/index.ts
 * @description Plugin system initialization and main exports
 */

export * from "./types";
export * from "./define-plugin";
export * from "./settings";
export * from "./settings-crypto";
export * from "./settings-declaration";
export * from "./storage";

import { pluginServerRegistry } from "./plugin-server-registry";
import { pluginRegistry } from "./registry";
import { slotRegistry } from "./slot-registry.svelte.ts";
import { pluginPageRegistry } from "./plugin-page-registry.svelte.ts";
import { adminZoneRegistry } from "./admin-zone-registry.svelte.ts";
export {
  pluginRegistry,
  pluginServerRegistry,
  slotRegistry,
  pluginPageRegistry,
  adminZoneRegistry,
};

import { logger } from "@utils/logger";
import type { Plugin } from "./types";

// 🚀 Dynamic Plugin Scanner (Vite-native eager glob parsing)
let pluginModulesRaw: Record<string, any> = {};

try {
  pluginModulesRaw = import.meta.glob("./*/index.ts", { eager: true });
} catch (err: any) {
  logger.debug(`[Plugins Scanner] Vite Glob failed: ${err.message}`);
}

// 🚀 Bun/Node Fallback for non-Vite environments (e.g. CLI, tests)
const isBrowser = typeof window !== "undefined";
if (!isBrowser && Object.keys(pluginModulesRaw).length === 0) {
  try {
    const g = globalThis as any;
    const nodeRequire =
      g["require"] ||
      (typeof require !== "undefined" ? require : undefined) ||
      (typeof import.meta !== "undefined" ? (import.meta as any).require : undefined);

    if (nodeRequire) {
      const fs = nodeRequire("node:fs");
      const path = nodeRequire("node:path");
      const projectRoot = typeof process !== "undefined" && process.cwd ? process.cwd() : ".";
      const pluginsDir = path.join(projectRoot, "src/plugins");

      if (fs.existsSync(pluginsDir)) {
        const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const indexPath = path.join(pluginsDir, entry.name, "index.ts");
            if (fs.existsSync(indexPath)) {
              try {
                const module = nodeRequire(indexPath);
                pluginModulesRaw[`./${entry.name}/index.ts`] = module;
              } catch (err: any) {
                logger.trace(
                  `[Plugins Scanner] Fallback require failed for ${entry.name}:`,
                  err.message,
                );
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.trace("[Plugins Scanner] Fallback error:", err.message);
  }
}

// Collect all resolved plugin definitions from scanned exports
export const availablePlugins: Plugin[] = [];

for (const path in pluginModulesRaw) {
  const mod = pluginModulesRaw[path];
  if (!mod) continue;

  for (const key in mod) {
    const value = mod[key];
    if (value && typeof value === "object" && value.metadata && value.metadata.id) {
      availablePlugins.push(value);
    }
  }
}

// Isomorphic UI registration — available on client and server for slot/page renderers.
//
// Idempotency guard: `+layout.svelte` (app shell) calls `registerPluginSlots()`
// so bundlers can never hoist this module into a lazy route node without
// executing it (Rolldown client builds ignore `manualChunks` when SvelteKit
// sets `codeSplitting` — see vite.config.ts). The top-level call below keeps
// server boot, dev, and eager consumers working; the exported function makes
// the app shell a runtime dependency of the registration loop.
let registrationsApplied = false;

export function registerPluginSlots(): void {
  if (registrationsApplied) return;
  registrationsApplied = true;

  for (const plugin of availablePlugins) {
    const pluginId = plugin.metadata.id;

    if (plugin.ui?.slots) {
      for (const slot of plugin.ui.slots) {
        const registered = { ...slot, pluginId };
        slotRegistry.register(registered);

        if (slot.zone === "plugin_workspace" && slot.server) {
          pluginServerRegistry.register(pluginId, slot.server);
        }
      }
    }

    // Structured parts → isomorphic registries (pages + admin zones). Server-side
    // validation happens in pluginRegistry.resolveParts during initializePlugins.
    if (plugin.parts) {
      for (const part of plugin.parts) {
        if (part.type === "page") {
          for (const page of part.pages) {
            pluginPageRegistry.register(pluginId, page);
          }
        } else if (part.type === "adminTool") {
          for (const tool of part.tools) {
            adminZoneRegistry.registerTool(pluginId, tool);
          }
        }
      }
    }
  }
}

// Register eagerly — runs wherever this module executes (server boot, dev, HMR).
registerPluginSlots();

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
