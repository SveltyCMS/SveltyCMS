/**
 * @file src/plugins/pagespeed/index.server.ts
 * @description Server-only logic for PageSpeed plugin (migrations and hooks).
 *
 * ### Licensing (Freemium):
 * - Free tier: single-page analysis always available
 * - Premium tier: bulk, scheduled, and historical tracking require a license
 */

import { checkExtensionLicense } from "@src/utils/license-manager";
import type { IDBAdapter } from "@databases/db-interface";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { PluginContext, PluginEntryData, PluginMigration } from "../types";
import { getMultipleCachedResults } from "./service";
import { nowISODateString } from "@utils/date";

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
      const probe = await dbAdapter.crud.findMany(
        "pluginPagespeedResults",
        {},
        { limit: 1, ...withSystemScope("migration") },
      );

      if (probe.success) {
        logger.info("✅ PageSpeed: pluginPagespeedResults validated.");
      } else {
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

/**
 * beforeSave hook: gates bulk/scheduled/historical analytics behind the license.
 * Single-page analysis remains free.
 */
export async function beforeSave(
  _context: PluginContext,
  _collection: string,
  data: Record<string, unknown>,
) {
  if (data._pagespeedBulk || data._pagespeedScheduled || data._pagespeedHistorical) {
    const licenseStatus = await checkExtensionLicense("plugin", "pagespeed");
    if (!licenseStatus.active && !licenseStatus.hasLicense) {
      raise(
        403,
        "Bulk, scheduled, and historical PageSpeed features require a premium license. Single-page analysis remains free.",
      );
    }
  }
  return data;
}

/**
 * SSR hook for PageSpeed plugin.
 */
export async function ssrHook(
  context: PluginContext,
  entries: Record<string, unknown>[],
): Promise<PluginEntryData[]> {
  const { dbAdapter, collectionSchema, language, tenantId } = context;

  try {
    const entryIds = entries.map((e) => String(e._id)).filter(Boolean);
    if (entryIds.length === 0) return [];

    const cachedResults = await getMultipleCachedResults(
      dbAdapter,
      entryIds,
      String(collectionSchema._id),
      language,
      "mobile",
      tenantId || "",
    );

    const pluginData: PluginEntryData[] = [];
    for (const [entryId, result] of cachedResults.entries()) {
      pluginData.push({
        entryId,
        data: {
          performanceScore: result.performanceScore,
          fcp: result.fcp,
          lcp: result.lcp,
          cls: result.cls,
          fetchedAt: result.fetchedAt ? new Date(result.fetchedAt).toISOString() : null,
        },
        updatedAt: (result.updatedAt ? String(result.updatedAt) : nowISODateString()) as any,
      });
    }

    return pluginData;
  } catch (error) {
    logger.error("PageSpeed SSR hook failed", { error });
    return [];
  }
}
