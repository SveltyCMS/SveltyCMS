/**
 * @file src/plugins/index.ts
 * @description Plugin system initialization and main exports
 */

export * from "./types";
export * from "./define-plugin";
// NOTE: `./settings` and `./settings-crypto` are intentionally NOT re-exported here.
// This barrel is browser-reachable (client components import `availablePlugins` and
// side-effect-register the plugin UIs), and both modules pull `node:crypto` (plus
// `node:module` via @utils/security/crypto) into the client bundle. Server code
// imports them from their concrete paths (`@src/plugins/settings`).
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
  // slop:suppress — the plugin registry must enumerate every plugin at boot;
  // Vite needs the literal static call to transform it into the bundle.
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
