/**
 * @file src/plugins/pagespeed/migrations.ts
 * @description Database migrations for PageSpeed plugin.
 * Ensures the persistent cache table is ready for use.
 */

import type { IDBAdapter } from "@databases/db-interface";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { logger } from "@utils/logger";
import type { PluginMigration } from "../types";

/**
 * Migration 001: Validate/Initialize PageSpeed Results table.
 * SveltyCMS uses Drizzle for schema management; this migration ensures the
 * underlying database is synchronized with the plugin requirements.
 */
export const createPageSpeedResultsTable: PluginMigration = {
  id: "001_create_pagespeed_results_table",
  pluginId: "pagespeed",
  version: 1,
  description: "Ensure plugin_pagespeed_results collection exists",

  async up(dbAdapter: IDBAdapter) {
    logger.info(
      "PageSpeed Migration: Ensuring collection 'pluginPagespeedResults' is available...",
    );

    try {
      // 1. Probe for the collection/table
      const probe = await dbAdapter.crud.findMany(
        "pluginPagespeedResults",
        {},
        { limit: 1, ...withSystemScope("migration") },
      );

      if (probe.success) {
        logger.info("✅ PageSpeed: pluginPagespeedResults validated.");
      } else {
        // If probing fails, it might mean the table doesn't exist yet. Collection
        // tables are provisioned by the adapter (`createModel`) — a restart lets the
        // schema boot pass create or refresh this plugin's collection.
        logger.warn(
          "⚠ PageSpeed: Collection 'pluginPagespeedResults' not detected. " +
            "Restart the server so the schema boot pass can provision it.",
        );
      }
    } catch (err) {
      logger.error("PageSpeed Migration Failed during probe", { error: err });
    }
  },
};

export const migrations: PluginMigration[] = [createPageSpeedResultsTable];
