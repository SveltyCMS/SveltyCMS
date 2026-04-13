/**
 * @file src/plugins/pagespeed/index.ts
 * @description Google PageSpeed Insights integration for performance monitoring.
 * Monitors Core Web Vitals and performance scores with intelligent caching.
 */

import { logger } from "@utils/logger.server";
import type { Plugin, PluginContext, PluginEntryData } from "../types";
import { migrations } from "./migrations";
import { getMultipleCachedResults } from "./service";

/**
 * SSR hook for PageSpeed plugin.
 * Enriches entry list with cached PageSpeed data for ultra-fast load times.
 */
async function ssrHook(
  context: PluginContext,
  entries: Record<string, unknown>[],
): Promise<PluginEntryData[]> {
  const { dbAdapter, collectionSchema, language, tenantId } = context;

  try {
    const entryIds = entries.map((e) => String(e._id)).filter(Boolean);
    if (entryIds.length === 0) return [];

    // Get cached results for all entries (mobile is standard for Core Web Vitals)
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

    logger.debug("PageSpeed SSR hook completed", {
      collectionId: collectionSchema._id,
      language,
      entries: entries.length,
      enriched: pluginData.length,
    });

    return pluginData;
  } catch (error) {
    logger.error("PageSpeed SSR hook failed", { error });
    return [];
  }
}

export const pageSpeedPlugin: Plugin = {
  metadata: {
    id: "pagespeed",
    name: "Google PageSpeed Insights",
    version: "1.1.0",
    description:
      "Monitors Core Web Vitals and performance scores using Google PageSpeed Insights API with caching.",
    author: "SveltyCMS",
    icon: "mdi:speedometer",
    enabled: false,
    category: "performance",
  },
  migrations,
  ssrHook,
  ui: {
    columns: [
      {
        id: "performance_score",
        label: "Performance",
        width: "110px",
        sortable: false,
        component: "score", // Resolved via plugin component loader
        props: {
          score: "performanceScore",
          fcp: "fcp",
          lcp: "lcp",
          cls: "cls",
          fetchedAt: "fetchedAt",
        },
      },
    ],
    actions: [
      {
        id: "refresh_pagespeed",
        label: "Refresh PageSpeed",
        icon: "mdi:refresh",
        handler: "refreshPageSpeed", // Handled by centralized action registry
        confirm: "This will call Google API and may consume your quota. Continue?",
      },
    ],
  },
  config: {
    public: {
      defaultDevice: "mobile",
    },
    private: {
      apiKeySource: "settings", // GOOGLE_PAGESPEED_API_KEY expected in Private Settings
    },
  },
  enabledCollections: [], // Collections must explicitly enable this plugin
};
