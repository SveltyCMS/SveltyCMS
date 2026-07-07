/**
 * @file src/plugins/pagespeed/index.server.ts
 * @description Server-only logic for PageSpeed plugin (migrations and hooks).
 *
 * ### Licensing (Freemium):
 * - Free tier: single-page analysis always available
 * - Premium tier: bulk, scheduled, and historical tracking require a license
 */

import { checkExtensionLicense } from "@src/utils/license-manager";
import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { PluginContext, PluginEntryData } from "../types";
import { getMultipleCachedResults } from "./service";
import { migrations } from "./migrations";

export { migrations };

/**
 * beforeSave hook: gates bulk/scheduled/historical analytics behind the license.
 * Single-page analysis remains free.
 */
export async function beforeSave(
  context: PluginContext,
  collection: string,
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
        updatedAt: (result.updatedAt ? String(result.updatedAt) : new Date().toISOString()) as any,
      });
    }

    return pluginData;
  } catch (error) {
    logger.error("PageSpeed SSR hook failed", { error });
    return [];
  }
}
