/**
 * @file src/plugins/sitemap/index.server.ts
 * @description Sitemap plugin with automated indexing pings.
 */

import type { PluginLifecycleHooks } from "../types";
import { logger } from "@utils/logger";
import { invalidateSitemapCache } from "@src/services/content/seo/sitemap-cache";

/**
 * Ping search engines to notify them of a sitemap update
 */
async function pingSearchEngines(baseUrl: string) {
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  const pings = [
    {
      name: "Google",
      url: `https://www.google.com/ping?sitemap=${sitemapUrl}`,
    },
    { name: "Bing", url: `https://www.bing.com/ping?sitemap=${sitemapUrl}` },
  ];

  for (const ping of pings) {
    try {
      const res = await fetch(ping.url);
      if (res.ok) {
        logger.info(`[Sitemap] Successfully pinged ${ping.name} for ${sitemapUrl}`);
      } else {
        logger.warn(`[Sitemap] Failed to ping ${ping.name}: ${res.statusText}`);
      }
    } catch (err) {
      logger.error(`[Sitemap] Error pinging ${ping.name}`, err);
    }
  }
}

export const hooks: PluginLifecycleHooks = {
  /**
   * Ping indexing services when content is published
   */
  afterSave: async (context, collection, result) => {
    const { tenantId, settings } = context;

    // Invalidate sitemap cache for this tenant
    invalidateSitemapCache(tenantId as string);

    // Only ping if the status is "published"
    if (result && result.status === "published") {
      // Get base URL from environment or system settings
      const baseUrl = settings?.HOST_PROD || process.env.ORIGIN || "https://localhost";

      logger.info(`[Sitemap] Content published in ${collection}. Triggering indexing pings...`);

      // Fire and forget pings
      pingSearchEngines(baseUrl).catch((err) => logger.error("[Sitemap] Ping failed", err));
    }
  },

  /**
   * Invalidate sitemap cache when content is deleted
   */
  afterDelete: async (context) => {
    invalidateSitemapCache(context.tenantId as string);
  },
};
