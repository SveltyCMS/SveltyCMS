/**
 * @file src/services/cdn/cdn-service.ts
 * @description
 * High-performance CDN invalidation bridge for SveltyCMS.
 * High-Gain Enterprise Optimizations.
 *
 * Supports:
 * - Cloudflare (Purge by Tag / Everything)
 * - Optimized for zero-latency non-blocking operation
 */

import { logger } from "@utils/logger";

interface CdnPurgeOptions {
  tags?: string[];
  everything?: boolean;
}

export class CdnService {
  private static instance: CdnService;
  private active = false;
  private apiToken: string | null = null;
  private zoneId: string | null = null;
  private purgeMode: "all" | "tags" = "tags";

  private constructor() {}

  public static async getInstance(): Promise<CdnService> {
    if (!CdnService.instance) {
      CdnService.instance = new CdnService();
      await CdnService.instance.initialize();
    }
    return CdnService.instance;
  }

  private async initialize() {
    try {
      const { loadPrivateConfig } = await import("@src/databases/config-state");
      const config = await loadPrivateConfig();

      this.apiToken = config?.CF_API_TOKEN || null;
      this.zoneId = config?.CF_ZONE_ID || null;
      this.purgeMode = config?.CF_PURGE_MODE || "tags";

      if (this.apiToken && this.zoneId) {
        this.active = true;
        logger.info("[CDN] Cloudflare adapter initialized and active.");
      } else {
        logger.debug("[CDN] Optional CDN purging is disabled (no CF credentials).");
      }
    } catch (err) {
      logger.warn("[CDN] Initialization failed:", err);
    }
  }

  /**
   * Purges the CDN cache based on surgical tags or collection-level invalidates.
   * 🛡️ Non-blocking: Calls are executed in the background.
   */
  public async purge(options: CdnPurgeOptions) {
    if (!this.active) return;

    // Fire and forget (don't await external network calls in the main thread)
    this.executePurge(options).catch((err) => {
      logger.error("[CDN] Purge execution failed:", err);
    });
  }

  private async executePurge(options: CdnPurgeOptions) {
    if (options.everything || this.purgeMode === "all") {
      return this.purgeEverything();
    }

    if (options.tags && options.tags.length > 0) {
      return this.purgeByTags(options.tags);
    }
  }

  private async purgeEverything() {
    logger.debug("[CDN] Purging everything for Zone:", this.zoneId);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );

    const data: any = await res.json();
    if (!data.success) {
      throw new Error(`Cloudflare Purge Failed: ${JSON.stringify(data.errors)}`);
    }
    logger.info("[CDN] Successfully purged global zone cache.");
  }

  private async purgeByTags(tags: string[]) {
    logger.debug(`[CDN] Purging ${tags.length} tags for Zone:`, this.zoneId);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      },
    );

    const data: any = await res.json();
    if (!data.success) {
      throw new Error(`Cloudflare Tag Purge Failed: ${JSON.stringify(data.errors)}`);
    }
    logger.info(`[CDN] Successfully purged tags: ${tags.slice(0, 3).join(", ")}...`);
  }
}

export const cdnService = CdnService.getInstance();
