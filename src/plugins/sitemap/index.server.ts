/**
 * @file src/plugins/sitemap/index.server.ts
 * @description Sitemap plugin server-side — automated indexing pings with headless domain support.
 *
 * Features:
 * - Bing sitemap ping (Google ping deprecated — returns 404)
 * - Uses config's frontendDomain instead of localhost
 * - Proper error handling with structured logging
 * - Sitemap cache invalidation on content changes
 */

import type { PluginLifecycleHooks } from "../types";
import { logger } from "@utils/logger";
import { invalidateSitemapCache } from "@src/services/content/seo/sitemap-cache";

/**
 * Ping Bing search engine to notify of a sitemap update.
 * Google's /ping endpoint has been deprecated and returns 404,
 * so we only keep Bing's active endpoint.
 */
async function pingBing(sitemapUrl: string): Promise<void> {
  try {
    const res = await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    if (res.ok) {
      logger.info(`[Sitemap] Successfully pinged Bing for ${sitemapUrl}`);
    } else {
      logger.warn(`[Sitemap] Bing ping returned ${res.status} ${res.statusText} for ${sitemapUrl}`);
    }
  } catch (err) {
    logger.error("[Sitemap] Failed to ping Bing", { error: err, sitemapUrl });
  }
}

export const hooks: PluginLifecycleHooks = {
  /**
   * Ping indexing services when content is published
   */
  afterSave: async (context, collection, result) => {
    const { tenantId, pluginConfig } = context;

    // Invalidate sitemap cache for this tenant
    invalidateSitemapCache(tenantId as string);

    // Only ping if the status is "published"
    if (result && result.status === "published") {
      // Use config's frontendDomain if configured, fall back to environment
      const frontendDomain =
        (pluginConfig as any)?.frontendDomain ||
        context.settings?.HOST_PROD ||
        process.env.ORIGIN ||
        "https://localhost";

      const sitemapUrl = `${frontendDomain}/sitemap.xml`;

      logger.info(
        `[Sitemap] Content published in ${collection}. Triggering indexing ping to ${sitemapUrl}...`,
      );

      // Fire and forget — don't block the save operation
      pingBing(sitemapUrl).catch((err) =>
        logger.error("[Sitemap] Bing ping fire-and-forget failed", {
          error: err,
        }),
      );
    }
  },

  /**
   * Invalidate sitemap cache when content is deleted
   */
  afterDelete: async (context) => {
    invalidateSitemapCache(context.tenantId as string);
  },
};
