/**
 * @file src/plugins/pagespeed/migrations.ts
 * @description Database migrations for PageSpeed plugin.
 * Ensures the persistent cache table is ready for use.
 */

import type { IDBAdapter } from "@databases/db-interface";
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
        { limit: 1, bypassTenantCheck: true },
      );

      if (probe.success) {
        logger.info("✅ PageSpeed: pluginPagespeedResults validated.");
      } else {
        // If probing fails, it might mean the table doesn't exist yet.
        // In SveltyCMS, we recommend running 'db:push' or 'db:generate'
        // when adding new plugins that define schemas.
        logger.warn(
          "⚠ PageSpeed: Collection 'pluginPagespeedResults' not detected. " +
            "Please ensure your database is synchronized (run 'bun run db:push').",
        );
      }
    } catch (err) {
      logger.error("PageSpeed Migration Failed during probe", { error: err });
    }
  },
};

export const migrations: PluginMigration[] = [createPageSpeedResultsTable];
