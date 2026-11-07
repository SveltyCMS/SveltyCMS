/**
 * @file src/plugins/register-plugins.ts
 * @description Isomorphic plugin registration loop shared by the server catalog
 * (`./index.ts`) and the client-safe catalog (`./client.ts`).
 *
 * Features:
 * - UI slot registration, including `plugin_workspace` server resolvers
 * - Structured part registration for plugin pages and admin tools
 * - Module-level idempotency guard so the app shell and eager callers register once
 */

import { adminZoneRegistry } from "./admin-zone-registry.svelte.ts";
import { pluginPageRegistry } from "./plugin-page-registry.svelte.ts";
import { pluginServerRegistry } from "./plugin-server-registry";
import { slotRegistry } from "./slot-registry.svelte.ts";
import type { Plugin } from "./types";

/** Registration is idempotent per runtime (HMR re-evaluation / repeated callers). */
let registrationsApplied = false;

/**
 * Register the UI contributions of every plugin in `plugins`.
 *
 * Only `ui.slots` and the `page` / `adminTool` parts are handled here; server
 * parts (schemas, routes, settings) are resolved by `pluginRegistry.resolveParts`
 * during `initializePlugins`.
 */
export function registerPlugins(plugins: Plugin[]): void {
  if (registrationsApplied) return;
  registrationsApplied = true;

  for (const plugin of plugins) {
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
