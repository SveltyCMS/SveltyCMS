/**
 * @file src/plugins/unified-data-hub/index.server.ts
 * @description Server-side bootstrap for Unified Data Hub plugin.
 *
 * Per plugin architecture: hooks, migrations, and MCP registration live here.
 *
 * Features:
 * - Abstract migrations via ensureCollection
 * - License-gated beforeSave on plugin-owned collections only
 * - WebMCP MCP extension registration
 * - Plugin init on first import
 */

import type { IDBAdapter } from "@databases/db-interface";
import { checkExtensionLicense } from "@src/utils/license-manager";
import type { PluginContext, PluginLifecycleHooks } from "../types";
import { migrations } from "./migrations/001-hub-tables";
import { registerMcpExtension } from "./server/mcp-extension";

export { migrations };

const PLUGIN_COLLECTION_PREFIX = "plugin_unified-data-hub_";

function isPluginOwnedCollection(collectionId: string): boolean {
  return collectionId.startsWith(PLUGIN_COLLECTION_PREFIX);
}

export const hooks: PluginLifecycleHooks = {
  beforeSave: async (_context: PluginContext, collection: string, data: unknown) => {
    if (!isPluginOwnedCollection(collection)) return data;

    const status = await checkExtensionLicense("plugin", "unified-data-hub");
    if (!status.active && !status.hasLicense) {
      throw new Error("403 Forbidden: Unified Data Hub license or trial required.");
    }
    return data;
  },
};

let initialized = false;

export function initializeUnifiedDataHub(db: IDBAdapter): void {
  if (initialized) return;
  registerMcpExtension(db);
  initialized = true;
}

// Auto-register when server module loads with db available
if (typeof window === "undefined") {
  import("@src/databases/db")
    .then(({ getDb }) => {
      const db = getDb();
      if (db) initializeUnifiedDataHub(db);
    })
    .catch(() => {});
}
