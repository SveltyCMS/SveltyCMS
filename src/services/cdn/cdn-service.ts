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
  private static instance: CdnService | null = null;
  private static initPromise: Promise<CdnService> | null = null;
  private active = false;
  private apiToken: string | null = null;
  private zoneId: string | null = null;
  private purgeMode: "all" | "tags" = "tags";

  private constructor() {}

  /**
   * Race-free singleton: concurrent callers await the same initialization
   * promise instead of receiving the not-yet-initialized instance.
   */
  public static getInstance(): Promise<CdnService> {
    if (!CdnService.initPromise) {
      CdnService.initPromise = (async () => {
        const instance = new CdnService();
        await instance.initialize();
        CdnService.instance = instance;
        return instance;
      })();
    }
    return CdnService.initPromise;
  }

  /** The initialized singleton, or null while initialization is still pending. */
  public static get resolved(): CdnService | null {
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

/**
 * Lazily-resolving singleton handle. `getInstance()` is async, so exporting its
 * return value produced a `Promise<CdnService>` and broke the documented
 * `cdnService.purge(...)` call shape. This proxy delegates to the initialized
 * instance and awaits first-use initialization, keeping the sync API working.
 */
export const cdnService: CdnService = new Proxy({} as CdnService, {
  get(_target, prop) {
    if (prop === "then") return undefined; // never accidentally thenable
    const instance = CdnService.resolved;
    if (instance) {
      const value = Reflect.get(instance, prop);
      return typeof value === "function" ? value.bind(instance) : value;
    }
    // First access before initialization: bootstrap, then forward once ready.
    return async (...args: unknown[]) => {
      const resolved = await CdnService.getInstance();
      const value = Reflect.get(resolved, prop);
      return typeof value === "function" ? value.apply(resolved, args) : value;
    };
  },
});
