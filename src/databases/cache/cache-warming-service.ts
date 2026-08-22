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
import { isSetupComplete } from "../../utils/setup-check-fast";
import { cacheService } from "./cache-service";
import { CacheCategory } from "./types";

export class CacheWarmingService {
  private lastReconcile = 0;

  /**
   * Strategically warms critical paths on startup or re-initialization.
   */
  async warmCriticalPaths(db: any) {
    logger.info("🔥 Starting Cache Warming: Critical Paths");
    const start = performance.now();

    try {
      const { withSystemScope } = await import("../system-tenant-scope");
      const systemScope = withSystemScope("bootstrap");
      let hasRedirectsCollection = false;
      // 1. Warm Core Schemas (Required for all collection loads)
      if (db?.collection?.listSchemas) {
        const schemas = await db.collection.listSchemas(null, systemScope);
        if (schemas.success && schemas.data) {
          for (const schema of schemas.data) {
            if (schema.name === "redirects") {
              hasRedirectsCollection = true;
            }
            // 🚀 Pre-encode: cache the serialized JSON string so cache hits
            // bypass JSON.stringify() entirely — direct stream to response.
            const preEncoded = JSON.stringify(schema);
            await cacheService.set(
              `schema:${schema.name}`,
              preEncoded,
              3600,
              null,
              CacheCategory.SCHEMA,
            );
          }
        }
      }

      // 2. Warm Default Theme
      if (db?.system?.themes?.getActive) {
        const theme = await db.system.themes.getActive(systemScope);
        if (theme.success && theme.data) {
          // 🚀 Pre-encode: cache serialized theme so reads never touch DB
          const preEncodedTheme = JSON.stringify(theme.data);
          await cacheService.set("active_theme", preEncodedTheme, 3600, null, CacheCategory.THEME);
        }
      }

      // 3. JIT Predictive Redirect Caching (Top 100)
      if (hasRedirectsCollection && db?.crud?.find) {
        try {
          // NOTE: crud.find takes an options bag (3rd arg) — scope must be merged in,
          // not passed positionally, or the tenant scope is silently dropped.
          const redirects = await db.crud.find("redirects", {}, { limit: 100, ...systemScope });
          if (redirects.success && redirects.data) {
            for (const r of redirects.data) {
              const preEncodedRedirect = JSON.stringify(r);
              await cacheService.set(
                `redirect:${r.from}`,
                preEncodedRedirect,
                3600,
                r.tenantId,
                CacheCategory.API,
              );
            }
          }
        } catch (err: any) {
          logger.debug(
            `Skipping redirect cache warming (collection may not exist yet): ${err.message}`,
          );
        }
      }

      // 4. Predictive Telemetry Warming (v1.2 "Agency OS" Feature)
      // ⚡ NON-BLOCKING: Run in background after a short delay to allow system to settle
      setTimeout(() => {
        this.warmFromTelemetry(db).catch((err) =>
          logger.trace("Predictive warming background error:", err),
        );
      }, 2000).unref();

      logger.info(`✨ Cache Warming Complete in ${(performance.now() - start).toFixed(2)}ms`);
    } catch (err) {
      logger.error("Failed to warm cache", err);
    }
  }

  /**
   * 🧠 [PredictiveCache] Warm from Behavioral Learning statistics.
   * Proactively pre-warms the cache using in-memory getHotCollections and getHotEntries.
   */
  async warmFromBehavioralLearning(tenantId: string, db: any) {
    // Skip pre-warming during setup — database tables don't exist yet
    if (!isSetupComplete()) {
      logger.trace("[PredictiveCache] Setup not complete, skipping behavioral pre-warming");
      return false;
    }

    try {
      const { withSystemScope } = await import("../system-tenant-scope");
      // System warming reads across tenants (behavioral data is global); the cache
      // keys below are tenant-scoped via the tenantId arg, so no cross-tenant bleed.
      const systemScope = withSystemScope("cache-warming");
      const { getHotCollections, getHotEntries } =
        await import("@src/services/intelligence/behavioral-learner");

      const hotCollections = getHotCollections(tenantId, 10);
      const hotEntries = getHotEntries(tenantId, 20);

      if (hotCollections.length === 0 && hotEntries.length === 0) {
        return false;
      }

      logger.info(
        `🧠 [PredictiveCache] Pre-warming cache from Behavioral Learner for tenant "${tenantId}"`,
      );

      // 1. Warm hot collections (per-collection error isolation — missing tables must not cascade)
      await Promise.allSettled(
        hotCollections.map(async ({ id }) => {
          if (db?.crud?.find) {
            try {
              await cacheService.getOrSetSWR(
                `collection:${id}:list`,
                () => db.crud.find(id, {}, { limit: 20, skipMeta: true, ...systemScope }),
                300_000, // 5 min TTL
                1_800_000, // 30 min stale SWR window
                tenantId,
              );
            } catch {
              logger.trace(
                `[PredictiveCache] Skipping collection "${id}" — table may not exist yet`,
              );
            }
          }
        }),
      );

      // 2. Warm hot entries (per-entry error isolation)
      await Promise.allSettled(
        hotEntries.map(async ({ collectionId, entryId }) => {
          if (db?.crud?.findOne) {
            try {
              await cacheService.getOrSetSWR(
                `entry:${collectionId}:${entryId}`,
                () => db.crud.findOne({ _id: entryId }, { tenantId, ...systemScope }),
                300_000,
                1_800_000,
                tenantId,
              );
            } catch {
              logger.trace(`[PredictiveCache] Skipping entry "${entryId}" in "${collectionId}"`);
            }
          }
        }),
      );

      return true;
    } catch (err: any) {
      logger.trace(`[PredictiveCache] Behavioral learning pre-warming skipped: ${err.message}`);
      return false;
    }
  }

  /**
   * 🧠 ENTERPRISE: Predictive Telemetry Warming
   * Warms the cache from in-memory behavioral learning data.
   *
   * Note: the audit-log aggregation fallback was removed (2026-07). Collection reads
   * are NOT audited (sub-5ms persistence target — see AGENTS.md), so `eventType:
   * "collection_find"` never existed in audit_logs and the old `$group` on
   * `$targetId` could not produce collection names anyway. The behavioral learner
   * (getHotCollections/getHotEntries) is the single source of truth for hot paths.
   */
  async warmFromTelemetry(db: any) {
    const tenantId = "global"; // Default tenant context for system warming

    const warmed = await this.warmFromBehavioralLearning(tenantId, db);
    if (warmed) {
      logger.debug("🧠 [PredictiveCache] Pre-warming complete using Behavioral Learner data.");
      return;
    }

    logger.trace(
      "[PredictiveCache] Behavioral maps empty — telemetry warming skipped (records accumulate after first page loads).",
    );
  }

  /**
   * Compatibility wrapper for initialization hook.
   * Also schedules a periodic 4-minute L1 re-warm so the cacheService L1
   * never goes cold during quiet production periods (the `collection:` TTL is
   * 5 min — running slightly earlier prevents the empty-L1 miss cycle).
   */
  async initialize(db: any) {
    const result = await this.warmCriticalPaths(db);

    // 🚀 PERIODIC RE-WARM: keep L1 hot for quiet servers.
    // unref() so this timer never prevents clean process exit.
    const REWARM_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
    const timer = setInterval(() => {
      this.warmCriticalPaths(db).catch((err) =>
        logger.trace("[CacheWarming] Periodic re-warm failed (non-fatal):", err),
      );
    }, REWARM_INTERVAL_MS);
    if (typeof (timer as any).unref === "function") (timer as any).unref();

    return result;
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
