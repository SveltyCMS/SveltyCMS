/**
 * @file src/hooks/handle-redirects.ts
 * @description High-performance middleware hook for processing redirects using the Materialized View Index.
 *
 * This hook intercepts requests and applies redirects by first checking in-memory cache,
 * then querying a dedicated, pre-indexed RedirectIndexService (MV), and finally checking regex rules.
 */

import { getDb, isDbConnected } from "@src/databases/db";
import { isSystemReady } from "@src/stores/system/state.svelte.ts";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

// 🚀 PRE-CACHED IMPORTS: Avoid lazy import overhead in hot validation path
let cachedContentSystem: typeof import("@src/content/index.server").contentSystem | null = null;
async function getContentSystem() {
  if (!cachedContentSystem) {
    const mod = await import("@src/content/index.server");
    cachedContentSystem = mod.contentSystem;
  }
  return cachedContentSystem;
}

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

  // 🛡️ Verify the table schema exists before flushing to prevent ER_NO_SUCH_TABLE
  const schemaExists = cacheService.getSync<any>("schema:404_logs");
  if (!schemaExists) return;

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

  const ready = isSystemReady();
  const connected = isDbConnected();

  let hasRedirect = false;
  let redirectEntry = null;

  if (cached) {
    if (!cached.isNegative) {
      hasRedirect = true;
      redirectEntry = cached;
    }
  } else {
    // 2. DB Lookup
    if (connected && ready) {
      try {
        const result = await redirectIndexService.getRedirects(tenantId, path);

        if (result.success && result.data && result.data.length > 0) {
          redirectEntry = result.data[0];
          hasRedirect = true;
          // Debug-level logging; gated to avoid overhead in production
          if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
            logger.debug(
              `[handleRedirects] Match found for ${path}: ${redirectEntry.target} (${redirectEntry.type})`,
            );
          }
          // Store in cache for 1 hour
          await cacheService.set(cacheKey, redirectEntry, 3600, tenantId, CacheCategory.API);
        } else {
          // Negative cache for 5 minutes to prevent DB hammering on 404s
          await cacheService.set(cacheKey, { isNegative: true }, 300, tenantId, CacheCategory.API);
        }
      } catch (err) {
        logger.error(`[handleRedirects] Lookup error for ${path}:`, err);
      }
    }
  }

  if (hasRedirect && redirectEntry) {
    return applyRedirect(path, redirectEntry);
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

  // 4. Validate if path is a valid route to prevent 200 OK on 404 SPA fallback
  const pathSegments = path.split("/").filter(Boolean);

  if (pathSegments.length > 0) {
    const firstSegment = pathSegments[0];
    const availableLanguages = (
      await import("@src/services/core/settings-service")
    ).getPublicSettingSync("AVAILABLE_CONTENT_LANGUAGES") || ["en"];
    const hasLangPrefix = availableLanguages.includes(firstSegment);

    // List of allowed root-level folders/routes
    const allowedRoots = new Set([
      "login",
      "setup",
      "robots.txt",
      "sitemap.xml",
      "favicon.ico",
      "api",
      "cms",
      "static",
      "files",
      "email-previews",
      "ui-test",
      "admin",
      "config",
      "dashboard",
      "mediagallery",
      "user",
    ]);

    const isAllowedRoot = allowedRoots.has(firstSegment);

    if (hasLangPrefix) {
      if (pathSegments.length > 1) {
        const collectionPath = "/" + pathSegments.slice(1).join("/");
        if (connected && ready) {
          try {
            const contentSystem = await getContentSystem();
            await contentSystem.initialize(tenantId);
            const exists = contentSystem.getCollection(collectionPath, tenantId);
            if (!exists) {
              return new Response("Not Found", {
                status: 404,
                headers: {
                  "Content-Type": "text/plain",
                  "X-Robots-Tag": "none",
                },
              });
            }
          } catch {
            // Fallback to SvelteKit resolve on error
          }
        }
      }
    } else {
      if (!isAllowedRoot) {
        return new Response("Not Found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
            "X-Robots-Tag": "none",
          },
        });
      }
    }
  }

  return resolve(event);
};

/**
 * Helper to apply the redirect response
 */
function applyRedirect(path: string, redirect: any) {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    logger.debug(`[RedirectManager] Redirecting ${path} -> ${redirect.target} (${redirect.type})`);
  }
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
