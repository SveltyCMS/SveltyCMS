/**
 * @file src/plugins/smart-importer/migrations/001_ledger_and_dlq.ts
 * @description Database migrations for Smart Importer plugin.
 *
 * Creates the ledger and dead-letter queue collections.
 * Executed automatically on plugin registration via the plugin registry.
 */

import type { PluginMigration } from "../../types";
import { logger } from "@utils/logger";

export const migrations: PluginMigration[] = [
  {
    id: "001_create_importer_ledger",
    pluginId: "smart-importer",
    version: 1,
    description: "Creates the plugin_importer_ledger collection for transaction tracking",
    up: async (dbAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_importer_ledger",
          name: "plugin_importer_ledger",
          slug: "plugin_importer_ledger",
          fields: [
            { label: "Transaction Token", name: "transactionToken", type: "text", required: true },
            { label: "Source Platform", name: "sourcePlatform", type: "text" },
            { label: "Target Collection", name: "targetCollection", type: "text" },
            { label: "Timestamp", name: "timestamp", type: "text" },
            { label: "Imported Count", name: "importedCount", type: "number", defaultValue: 0 },
            { label: "Highwater Mark", name: "highwaterMark", type: "text" },
            { label: "Mirrored Asset Paths", name: "mirroredAssetPaths", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info("[SmartImporter] Provisioned plugin_importer_ledger.");
      } catch (err) {
        logger.error("[SmartImporter] Failed to provision ledger:", err);
      }
    },
  },
  {
    id: "002_create_importer_dlq",
    pluginId: "smart-importer",
    version: 2,
    description: "Creates the plugin_importer_dlq collection for dead-letter queue",
    up: async (dbAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_importer_dlq",
          name: "plugin_importer_dlq",
          slug: "plugin_importer_dlq",
          fields: [
            { label: "Transaction Token", name: "transactionToken", type: "text", required: true },
            { label: "External ID", name: "externalId", type: "text" },
            { label: "Raw Entry", name: "rawEntry", type: "text" },
            { label: "Error Trace", name: "errorTrace", type: "text" },
            { label: "Timestamp", name: "timestamp", type: "text" },
            { label: "Resolved", name: "resolved", type: "boolean", defaultValue: false },
          ],
          status: "publish",
        } as any);
        logger.info("[SmartImporter] Provisioned plugin_importer_dlq.");
      } catch (err) {
        logger.error("[SmartImporter] Failed to provision DLQ:", err);
      }
    },
  },
  {
    id: "003_create_importer_presets",
    pluginId: "smart-importer",
    version: 3,
    description: "Creates the plugin_importer_presets collection for saved configurations",
    up: async (dbAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_importer_presets",
          name: "plugin_importer_presets",
          slug: "plugin_importer_presets",
          fields: [
            { label: "Name", name: "name", type: "text", required: true },
            { label: "Source Platform", name: "sourcePlatform", type: "text" },
            { label: "Target Collection", name: "targetCollection", type: "text" },
            { label: "Mappings JSON", name: "mappingsJson", type: "text" },
            { label: "Conflict Strategy", name: "conflictStrategy", type: "text" },
            { label: "Created At", name: "createdAt", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info("[SmartImporter] Provisioned plugin_importer_presets.");
      } catch (err) {
        logger.error("[SmartImporter] Failed to provision presets:", err);
      }
    },
  },
];
