/**
 * @file src/hooks/handle-redirects.ts
 * @description High-performance middleware hook for processing redirects using the Materialized View Index.
 *
 * This hook intercepts requests and applies redirects by first checking in-memory cache,
 * then querying a dedicated, pre-indexed RedirectIndexService (MV), and finally checking regex rules.
 */

import { getDb, isDbConnected } from "@src/databases/db";
import { isSystemReady, getSystemState } from "@src/stores/system/state.svelte";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

// --- 404 Log Buffering (Enterprise Performance) ---
const LOG_FLUSH_INTERVAL_MS = 10000; // Flush every 10 seconds
const MAX_LOG_BUFFER_SIZE = 1000; // Force flush if we hit 1k unique 404s
const logBuffer = new Map<string, { path: string; tenantId: string; hits: number }>();
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Flush buffered 404 logs to the database in one background task.
 */
function flush404Logs() {
  if (logBuffer.size === 0) return;
  const db = getDb();
  if (!db) return;

  const logsToFlush = Array.from(logBuffer.values());
  logBuffer.clear();

  void (async () => {
    try {
      const table = "404_logs";
      for (const log of logsToFlush) {
        const existing = await db.crud.findOne(table, {
          path: log.path,
          tenantId: log.tenantId,
        } as any);
        if (existing.success && existing.data && (existing.data as any)._id) {
          await db.crud.update(
            table,
            (existing.data as any)._id,
            {
              hits: ((existing.data as any).hits || 0) + log.hits,
              lastHit: new Date().toISOString(),
            } as any,
            { tenantId: log.tenantId as any },
          );
        } else {
          await db.crud.insert(table, { ...log, lastHit: new Date().toISOString() } as any, {
            tenantId: log.tenantId as any,
          });
        }
      }
    } catch (err) {
      logger.error("[handleRedirects] Failed to flush 404 logs:", err);
    }
  })();
}

/**
 * @description Service layer responsible for querying the Materialized View for redirects.
 */
class RedirectIndexService {
  /**
   * Fetches redirects by querying the dedicated Materialized View (MV).
   * @param tenantId - The current tenant ID.
   * @param path - The requested URL path.
   */
  async getRedirects(
    tenantId: string,
    path: string,
  ): Promise<import("@src/databases/db-interface").DatabaseResult<any[]>> {
    const db = getDb();
    if (!db) {
      return {
        success: false,
        message: "Database not connected",
        error: { code: "NOT_CONNECTED", message: "Database not connected" },
      };
    }

    try {
      const results = await db.crud.findMany<any>("redirectsMV", {
        tenantId: tenantId,
        source: path,
        active: true,
      } as any);

      return {
        success: true,
        data: results.success ? results.data || [] : [],
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: { code: "QUERY_FAILED", message: err.message },
      };
    }
  }
}

const redirectIndexService = new RedirectIndexService();

import { getTenantIdFromHostname } from "@utils/tenant";

export const handleRedirects: Handle = async ({ event, resolve }) => {
  const url = new URL(event.url);
  const path = url.pathname;

  // Skip API and system routes early
  if (
    path.startsWith("/api") ||
    path.startsWith("/cms") ||
    path.startsWith("/_") ||
    path.startsWith("/static") ||
    path.includes(".")
  ) {
    return resolve(event);
  }

  // 🚀 SMART TENANT RESOLUTION: Ensure we have a tenant ID even if auth hook hasn't run yet.
  const tenantId =
    (event.locals as any).tenantId ||
    event.request.headers.get("x-tenant-id") ||
    getTenantIdFromHostname(event.url.hostname, true) ||
    "default";

  const cacheKey = `redirect:${path}`;

  // 1. Synchronous L1 Check (Zero Micro-task Overhead for hot paths)
  let cached = cacheService.getSync<any>(cacheKey, tenantId);

  if (!cached) {
    // 2. Distributed L2 Check (Redis)
    cached = await cacheService.get<any>(cacheKey, tenantId);
  }

  if (cached) {
    if (cached.isNegative) return resolve(event);
    logger.debug(`[handleRedirects] Cache HIT for ${path}: ${cached.target}`);
    return applyRedirect(path, cached);
  }

  const state = getSystemState().overallState;
  const ready = isSystemReady() || state === "SETUP";
  const connected = isDbConnected();

  // 2. DB Lookup
  if (connected && ready) {
    try {
      const result = await redirectIndexService.getRedirects(tenantId, path);

      if (result.success && result.data && result.data.length > 0) {
        const redirectEntry = result.data[0];
        logger.debug(
          `[handleRedirects] Match found for ${path}: ${redirectEntry.target} (${redirectEntry.type})`,
        );
        // Store in cache for 1 hour
        await cacheService.set(cacheKey, redirectEntry, 3600, tenantId, CacheCategory.API);
        return applyRedirect(path, redirectEntry);
      } else {
        // Negative cache for 5 minutes to prevent DB hammering on 404s
        await cacheService.set(cacheKey, { isNegative: true }, 300, tenantId, CacheCategory.API);
      }
    } catch (err) {
      logger.error(`[handleRedirects] Lookup error for ${path}:`, err);
    }
  }

  // 1b. Check Regex Redirects (If we wanted to support them via the same service)
  // For now, standard rules follow.

  // 3. Log 404 for unmatched path (Buffered for performance)
  if (connected && ready && path !== "/favicon.ico") {
    const logKey = `${tenantId}|${path}`;
    const existingEntry = logBuffer.get(logKey);
    if (existingEntry) {
      existingEntry.hits++;
    } else {
      logBuffer.set(logKey, { path, tenantId, hits: 1 });
    }

    // Force immediate flush if buffer is getting too large
    if (logBuffer.size >= MAX_LOG_BUFFER_SIZE) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush404Logs();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush404Logs();
      }, LOG_FLUSH_INTERVAL_MS);
    }
  }

  return resolve(event);
};

/**
 * Helper to apply the redirect response
 */
function applyRedirect(path: string, redirect: any) {
  logger.debug(`[RedirectManager] Redirecting ${path} -> ${redirect.target} (${redirect.type})`);
  return new Response(null, {
    status: redirect.type || 301,
    headers: {
      location: redirect.target,
    },
  });
}

/**
 * Invalidate cache for a tenant
 */
export function invalidateRedirectCache(tenantId: string) {
  cacheService.clearByPattern("redirect:", tenantId);
}
