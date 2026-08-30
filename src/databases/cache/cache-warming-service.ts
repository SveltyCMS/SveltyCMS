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
      // 🔴 FIX 1 (cross-tenant + dead work): the previous code wrote
      // `cacheService.set("schema:${schema.name}", ..., /* tenantId */ null, ...)`.
      // (a) That key is NOT read by any consumer — the real schema cache read by
      //     `peekReadySchema()`/`resolveSchema()` is `_schemaCache` in
      //     schema-store.ts, keyed `${tenant||"global"}:${collectionId.toLowerCase()}` and
      //     populated via `prewarmCollectionSchemas()`. These writes were pure dead work.
      // (b) tenantId hardcoded to `null` collapsed every tenant's schema sharing a name
      //     into the single `tenant:default:schema:<name>` slot (e.g. Tenant A's "posts"
      //     overwrote Tenant B's "posts") = cross-tenant cache pollution.
      // Correct behavior: warm the REAL, tenant-scoped schema cache so identical collection
      // names across tenants never collide and the entries are actually read.
      const { prewarmCollectionSchemas } =
        await import("@src/services/sdk/namespaces/collections/schema-store");
      if (db?.collection?.listSchemas && typeof prewarmCollectionSchemas === "function") {
        const schemas = await db.collection.listSchemas(null, systemScope);
        if (schemas.success && Array.isArray(schemas.data)) {
          for (const schema of schemas.data) {
            if (schema.name === "redirects") {
              hasRedirectsCollection = true;
            }
            const schemaTenant = (schema as { tenantId?: string | null }).tenantId ?? null;
            try {
              // Keys by `${schemaTenant||global}:${_id}`, so tenant isolation is preserved.
              prewarmCollectionSchemas([schema], db, schemaTenant);
            } catch {
              // Partial/fieldless schema — non-fatal; resolveSchema covers the miss.
            }
          }
        }
      }

      // 🔴 FIX 2 (dead work): the previous code wrote `cacheService.set("active_theme", ...)` —
      // a key NO read path consumes (ThemeManager/getTheme read `theme:${tenant||"global"}` /
      // adapter `theme:active:<tenant>`). The "active_theme" write was pure dead load that also
      // gave false confidence via the "✨ Cache Warming Complete" log. Write the key that is
      // actually read by theme-manager.ts (`theme:${tenant||"global"}`).
      if (db?.system?.themes?.getActive) {
        const theme = await db.system.themes.getActive(systemScope);
        if (theme.success && theme.data) {
          const themeTenant = (theme.data as { tenantId?: string | null }).tenantId ?? "global";
          const preEncodedTheme = JSON.stringify(theme.data);
          await cacheService.set(
            `theme:${themeTenant}`,
            preEncodedTheme,
            3600,
            themeTenant,
            CacheCategory.THEME,
          );
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

      const tenantPrefix = tenantId ? `${tenantId}:` : "global:";

      // 1. Warm hot collections (per-collection error isolation — missing tables must not cascade)
      await Promise.allSettled(
        hotCollections.map(async ({ id }) => {
          if (db?.crud?.find) {
            try {
              const res = await db.crud.find(id, {}, { limit: 50, skipMeta: true, ...systemScope });
              if (res?.success && res.data) {
                const listData = Array.isArray(res.data) ? res.data : [];
                const payload = { success: true, data: listData };
                const defaultKey = `${tenantPrefix}collection:${id}:find:default_50:published`;
                const defaultKeyAll = `${tenantPrefix}collection:${id}:find:default_50`;
                await cacheService.set(defaultKey, payload, 300, tenantId);
                await cacheService.set(defaultKeyAll, payload, 300, tenantId);
              }
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
              const docRes = await db.crud.findOne(
                collectionId,
                { _id: entryId },
                { tenantId, ...systemScope },
              );
              if (docRes?.success && docRes.data) {
                const item = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
                const payload = { success: true, data: item };
                const listPayload = { success: true, data: [item] };
                const keyPublished = `${tenantPrefix}collection:${collectionId}:${entryId}:published`;
                const keyAll = `${tenantPrefix}collection:${collectionId}:${entryId}`;
                const keyFindId = `${tenantPrefix}collection:${collectionId}:find:id:${entryId}`;
                await cacheService.set(keyPublished, payload, 300, tenantId);
                await cacheService.set(keyAll, payload, 300, tenantId);
                await cacheService.set(keyFindId, listPayload, 300, tenantId);
              }
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
}

// Instance export expected by db-init
export const cacheWarmingService = new CacheWarmingService();
