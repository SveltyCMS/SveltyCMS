/**
 * @file src/databases/cache/cache-warming-service.ts
 * @description
 * Predictive prefetching and background cache warming service.
 * Monitors system access patterns to proactively load data into hot cache.
 *
 * Features:
 * - Deterministic pattern warming (Collections -> Schemas -> Widgets)
 * - Access-based frequency warming
 * - Staggered non-blocking background loads
 * - Structural reconciliation for cache integrity
 */

import { logger } from "@utils/logger";
import { cacheService } from "./cache/cache-service";
import { CacheCategory } from "./cache/types";

export class CacheWarmingService {
  private lastReconcile = 0;

  /**
   * Strategically warms critical paths on startup or re-initialization.
   */
  async warmCriticalPaths(db: any) {
    logger.info("🔥 Starting Cache Warming: Critical Paths");
    const start = performance.now();

    try {
      // 1. Warm Core Schemas (Required for all collection loads)
      if (db?.collection?.listSchemas) {
        const schemas = await db.collection.listSchemas();
        if (schemas.success && schemas.data) {
          for (const schema of schemas.data) {
            await cacheService.set(
              `schema:${schema.name}`,
              schema,
              3600,
              null,
              CacheCategory.SCHEMA,
            );
          }
        }
      }

      // 2. Warm Default Theme
      if (db?.system?.themes?.getActive) {
        const theme = await db.system.themes.getActive();
        if (theme.success && theme.data) {
          await cacheService.set("active_theme", theme.data, 3600, null, CacheCategory.THEME);
        }
      }

      // 3. Warm Hot Redirects (High-performance SEO Suite)
      if (db?.crud?.find) {
        const redirects = await db.crud.find("redirects", {}, { limit: 100 });
        if (redirects.success && redirects.data) {
          for (const r of redirects.data) {
            await cacheService.set(`redirect:${r.from}`, r, 3600, r.tenantId, CacheCategory.API);
          }
        }
      }

      // 4. Register standard prefetch patterns
      cacheService.registerPrefetchPattern("schema:", ["collection:data:"]);

      // User lifecycle patterns (Predicted by docs/architecture/cache-system.mdx)
      cacheService.registerPrefetchPattern("user:", ["user:permissions:", "user:roles:"]);

      logger.info(`✨ Cache Warming Complete in ${(performance.now() - start).toFixed(2)}ms`);
    } catch (err) {
      logger.error("Failed to warm cache", err);
    }
  }

  /**
   * Compatibility wrapper for initialization hook
   */
  async initialize(db: any) {
    return this.warmCriticalPaths(db);
  }

  /**
   * Structural reconciliation - ensures cache matches database structure.
   * This implements the "Self-Healing Cache 2.0" pattern.
   */
  async reconcile(db: any) {
    const now = Date.now();
    if (now - this.lastReconcile < 300000) return; // Only reconcile every 5 minutes max

    this.lastReconcile = now;
    logger.debug("🔎 Running Cache Structural Reconciliation...");

    try {
      // 1. Check Content Version Consistency
      const cachedVersion = await cacheService.get("system:content_version");
      const dbVersion = await db.system.preferences.get("system:content_version");

      if (dbVersion.success && dbVersion.data && cachedVersion !== dbVersion.data) {
        logger.warn(
          `[Reconcile] Content version mismatch (DB: ${dbVersion.data}, Cache: ${cachedVersion}). Triggering selective invalidation.`,
        );
        await cacheService.invalidateByCategory(CacheCategory.CONTENT);
        await cacheService.set("system:content_version", dbVersion.data, 0);
      }

      // 2. Structural Count Verification for critical collections
      const criticalCollections = ["system_content_structure", "auth_users", "media"];
      for (const coll of criticalCollections) {
        const countRes = await db.crud.count(coll);
        if (countRes.success) {
          // If counts are wildly different or missing from cache, we might need to invalidate
          // For now, we just ensure the count metadata exists
          await cacheService.set(
            `meta:count:${coll}`,
            countRes.data,
            600,
            null,
            CacheCategory.SYSTEM,
          );
        }
      }

      logger.debug("✅ Cache Structural Reconciliation Finished.");
    } catch (err) {
      logger.error("Cache reconciliation failed", err);
    }
  }
}

// Instance export expected by db-init
export const cacheWarmingService = new CacheWarmingService();
