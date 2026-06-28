/**
 * @file src/plugins/index.ts
 * @description Plugin system initialization and main exports
 */

export * from "./types";

import { pluginServerRegistry } from "./plugin-server-registry";
import { pluginRegistry } from "./registry";
import { slotRegistry } from "./slot-registry";
export { pluginRegistry, pluginServerRegistry, slotRegistry };

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

// Isomorphic UI registration — available on client and server for slot/page renderers
for (const plugin of availablePlugins) {
  const pluginId = plugin.metadata.id;

  if (plugin.ui?.slots) {
    for (const slot of plugin.ui.slots) {
      const { server: _server, ...registered } = { ...slot, pluginId };
      slotRegistry.register(registered);

      if (slot.zone === "plugin_workspace" && slot.server) {
        pluginServerRegistry.register(pluginId, slot.server);
      }
    }
  }
}

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

    // 2. Register all available plugins
    for (const plugin of availablePlugins) {
      await pluginRegistry.register(plugin);
    }

    // 3. Run migrations for all plugins
    await pluginRegistry.runAllMigrations(dbAdapter, tenantId);

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
