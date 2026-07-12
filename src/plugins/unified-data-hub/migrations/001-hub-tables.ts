/**
 * @file src/plugins/unified-data-hub/migrations/001-hub-tables.ts
 * @description Plugin migrations for Unified Data Hub collections.
 */

import type { IDBAdapter } from "@databases/db-interface";
import type { PluginMigration } from "../../types";
import { logger } from "@utils/logger";

async function ensureCollection(
  dbAdapter: IDBAdapter,
  id: string,
  fields: Array<{ label: string; name: string; type: string; required?: boolean }>,
): Promise<void> {
  await dbAdapter.collection.createModel({
    _id: id,
    name: id,
    fields,
    status: "publish",
  } as any);
}

export const migrations: PluginMigration[] = [
  {
    id: "001_connectors",
    pluginId: "unified-data-hub",
    version: 1,
    description: "Create plugin_unified-data-hub_connectors collection",
    up: async (dbAdapter) => {
      try {
        await ensureCollection(dbAdapter, "plugin_unified-data-hub_connectors", [
          { label: "Tenant ID", name: "tenantId", type: "text", required: true },
          { label: "Name", name: "name", type: "text", required: true },
          { label: "Type", name: "type", type: "text", required: true },
          { label: "Enabled", name: "enabled", type: "boolean" },
          { label: "Config", name: "config", type: "json" },
          { label: "Credentials", name: "credentials", type: "json" },
          { label: "Allowed Hosts", name: "allowedHosts", type: "json" },
          { label: "Capabilities", name: "capabilities", type: "json" },
          { label: "Health", name: "health", type: "text" },
          { label: "Last Health Check", name: "lastHealthCheck", type: "text" },
          { label: "Last Error", name: "lastError", type: "text" },
        ]);
        logger.info("[unified-data-hub] Provisioned connectors collection");
      } catch (err) {
        logger.error("[unified-data-hub] Connectors migration failed", { err });
      }
    },
  },
  {
    id: "002_virtual_schemas",
    pluginId: "unified-data-hub",
    version: 2,
    description: "Create plugin_unified-data-hub_virtual_schemas collection",
    up: async (dbAdapter) => {
      try {
        await ensureCollection(dbAdapter, "plugin_unified-data-hub_virtual_schemas", [
          { label: "Tenant ID", name: "tenantId", type: "text", required: true },
          { label: "Name", name: "name", type: "text", required: true },
          { label: "Slug", name: "slug", type: "text", required: true },
          { label: "Connector ID", name: "connectorId", type: "text", required: true },
          { label: "Source", name: "source", type: "json" },
          { label: "Fields", name: "fields", type: "json" },
          { label: "Permissions", name: "permissions", type: "json" },
          { label: "Enabled", name: "enabled", type: "boolean" },
        ]);
        logger.info("[unified-data-hub] Provisioned virtual_schemas collection");
      } catch (err) {
        logger.error("[unified-data-hub] Virtual schemas migration failed", { err });
      }
    },
  },
  {
    id: "003_federation_audit",
    pluginId: "unified-data-hub",
    version: 3,
    description: "Create plugin_unified-data-hub_federation_audit collection",
    up: async (dbAdapter) => {
      try {
        await ensureCollection(dbAdapter, "plugin_unified-data-hub_federation_audit", [
          { label: "Tenant ID", name: "tenantId", type: "text", required: true },
          { label: "User ID", name: "userId", type: "text" },
          { label: "Collection ID", name: "collectionId", type: "text" },
          { label: "Connector ID", name: "connectorId", type: "text" },
          { label: "Action", name: "action", type: "text" },
          { label: "Meta", name: "meta", type: "json" },
          { label: "Timestamp", name: "timestamp", type: "text" },
        ]);
        logger.info("[unified-data-hub] Provisioned federation_audit collection");
      } catch (err) {
        logger.error("[unified-data-hub] Audit migration failed", { err });
      }
    },
  },
];
