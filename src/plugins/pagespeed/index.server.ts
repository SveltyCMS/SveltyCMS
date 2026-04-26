/**
 * @file src/plugins/pagespeed/index.server.ts
 * @description Server-only logic for PageSpeed plugin (migrations and hooks).
 */

import { logger } from "@utils/logger";
import type { PluginContext, PluginEntryData } from "../types";
import { getMultipleCachedResults } from "./service";
import { migrations } from "./migrations";

export { migrations };

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
