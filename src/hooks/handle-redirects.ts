/**
 * @file src/hooks/handle-redirects.ts
 * @description
 * Hardened redirect middleware with atomic 404 log flushes and cache stampede protection.
 *
 * ### Features:
 * - Tenant-scoped redirect MV lookups with negative caching
 * - In-flight coalescing to prevent stampede under cold cache
 * - Buffered 404 hit logging with atomic upsert flush and delta-safe drain
 * - Content-system existence checks for language-prefixed collection paths
 */

import { getDb, isDbConnected } from "@src/databases/db";
import { isSystemReady } from "@src/stores/system/state.svelte.ts";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { getTenantIdFromHostname } from "@utils/tenant";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { getRequestFlags } from "@utils/hook-utils";
import { locales } from "@src/paraglide/runtime";

let cachedContentSystem: typeof import("@src/content/index.server").contentSystem | null = null;
async function getContentSystem() {
  if (!cachedContentSystem) {
    const mod = await import("@src/content/index.server");
    cachedContentSystem = mod.contentSystem;
  }
  return cachedContentSystem;
}

const LOG_FLUSH_INTERVAL_MS = 10000;
const MAX_LOG_BUFFER_SIZE = 1000;
const logBuffer = new Map<string, { path: string; tenantId: string; hits: number }>();

// Global timer guard to prevent interval leaks on hot-reloads
const TIMER_KEY = Symbol.for("svelty.redirects.timer");

// Cache stampede mitigation: tracks in-flight DB redirect lookups
const inflightRedirectLookups = new Map<string, Promise<any>>();

function flush404Logs() {
  if (logBuffer.size === 0) return;
  const db = getDb();
  if (!db) return;
  // Snapshot with key + hit count so entries mutated DURING the flush window
  // are retained (their un-flushed delta stays buffered for the next interval).
  const logsToFlush = Array.from(logBuffer.entries()).map(([key, log]) => ({
    key,
    path: log.path,
    tenantId: log.tenantId,
    hits: log.hits,
  }));
  // 🛡️ Do NOT clear the buffer before the async flush completes — a failed
  // flush would silently lose the buffered 404 records. Entries are removed
  // only AFTER a successful write (crash-safe retry on the next interval).

  void (async () => {
    try {
      const table = "404_logs";
      for (const log of logsToFlush) {
        const timestamp = new Date();
        if (typeof (db as any).upsertNative === "function") {
          // Atomic single-statement upsert — no read-modify-write race
          await (db as any).upsertNative(
            table,
            {
              path: log.path,
              tenantId: log.tenantId,
              hits: log.hits,
              lastHit: timestamp,
            },
            ["path", "tenantId"],
          );
        } else {
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
                lastHit: timestamp,
              } as any,
              { tenantId: log.tenantId as any },
            );
          } else {
            await db.crud.insert(table, { ...log, lastHit: timestamp } as any, {
              tenantId: log.tenantId as any,
            });
          }
        }
      }
      // Subtract the flushed delta: hits that arrived DURING the flush stay
      // buffered for the next interval (strict equality would strand them
      // in the buffer forever once the buffer grew past the snapshot).
      for (const log of logsToFlush) {
        const current = logBuffer.get(log.key);
        if (current) {
          current.hits -= log.hits;
          if (current.hits <= 0) logBuffer.delete(log.key);
        }
      }
    } catch (err) {
      logger.error("[handleRedirects] Failed to flush 404 logs:", err);
      // Buffer retained → retried on the next interval.
    }
  })();
}

function scheduleFlush() {
  if ((globalThis as any)[TIMER_KEY]) return;
  (globalThis as any)[TIMER_KEY] = setTimeout(() => {
    (globalThis as any)[TIMER_KEY] = null;
    flush404Logs();
  }, LOG_FLUSH_INTERVAL_MS);
}

class RedirectIndexService {
  async getRedirects(
    tenantId: string,
    path: string,
  ): Promise<import("@src/databases/db-interface").DatabaseResult<any[]>> {
    const db = getDb();
    if (!db)
      return {
        success: false,
        message: "Database not connected",
        error: { code: "NOT_CONNECTED", message: "Database not connected" },
      };
    try {
      const results = await db.crud.findMany<any>("redirectsMV", {
        tenantId,
        source: path,
        active: true,
      } as any);
      return { success: true, data: results.success ? results.data || [] : [] };
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

export const handleRedirects: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  const flags = getRequestFlags(event.locals as any);
  if (
    flags.isStatic ||
    path.startsWith("/api") ||
    path.startsWith("/cms") ||
    path.startsWith("/_") ||
    path.startsWith("/static") ||
    path.includes(".")
  ) {
    return resolve(event);
  }

  const tenantId =
    (event.locals as any).tenantId ||
    event.request.headers.get("x-tenant-id") ||
    getTenantIdFromHostname(event.url.hostname, false) ||
    "global";

  const cacheKey = `redirect:${path}`;
  let cached = cacheService.getSync<any>(cacheKey, tenantId);
  if (!cached) cached = await cacheService.get<any>(cacheKey, tenantId);

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
    if (connected && ready) {
      const flightKey = `${tenantId}:${cacheKey}`;

      let dbPromise = inflightRedirectLookups.get(flightKey);
      if (!dbPromise) {
        dbPromise = (async () => {
          try {
            const result = await redirectIndexService.getRedirects(tenantId, path);
            return result.success && result.data?.length > 0 ? result.data[0] : null;
          } finally {
            inflightRedirectLookups.delete(flightKey);
          }
        })();
        inflightRedirectLookups.set(flightKey, dbPromise);
      }

      const match = await dbPromise;
      if (match) {
        redirectEntry = match;
        hasRedirect = true;
        await cacheService.set(cacheKey, redirectEntry, 3600, tenantId, CacheCategory.API);
      } else {
        await cacheService.set(cacheKey, { isNegative: true }, 300, tenantId, CacheCategory.API);
      }
    }
  }

  if (hasRedirect && redirectEntry) {
    return applyRedirect(event.url, redirectEntry);
  }

  // Log 404
  if (connected && ready && path !== "/favicon.ico") {
    const logKey = `${tenantId}|${path}`;
    const existingEntry = logBuffer.get(logKey);
    if (existingEntry) {
      existingEntry.hits++;
    } else {
      logBuffer.set(logKey, { path, tenantId, hits: 1 });
    }
    if (logBuffer.size >= MAX_LOG_BUFFER_SIZE) {
      if ((globalThis as any)[TIMER_KEY]) {
        clearTimeout((globalThis as any)[TIMER_KEY]);
        (globalThis as any)[TIMER_KEY] = null;
      }
      flush404Logs();
    } else {
      scheduleFlush();
    }
  }

  // Validate route exists
  const pathSegments = path.split("/").filter(Boolean);
  if (pathSegments.length > 0) {
    const firstSegment = pathSegments[0];
    // 🚀 Use the configured Paraglide locales instead of a hardcoded ["en"].
    const availableLanguages = locales as readonly string[];
    const hasLangPrefix = availableLanguages.includes(firstSegment);
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
      if (pathSegments.length > 1 && connected && ready) {
        try {
          const contentSystem = await getContentSystem();
          await contentSystem.initialize(tenantId);
          const exists = contentSystem.getCollection(
            "/" + pathSegments.slice(1).join("/"),
            tenantId,
          );
          if (!exists)
            return new Response("Not Found", {
              status: 404,
              headers: { "Content-Type": "text/plain", "X-Robots-Tag": "none" },
            });
        } catch {}
      }
    } else if (!isAllowedRoot) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain", "X-Robots-Tag": "none" },
      });
    }
  }

  return resolve(event);
};

function applyRedirect(requestUrl: URL, redirect: any) {
  const target = redirect.target;

  // 🛡️ OPEN-REDIRECT GUARD: never follow an absolute URL to a foreign origin.
  // Only same-origin absolute URLs or relative targets are allowed — a poisoned
  // redirectsMV row can never send users to an attacker-controlled site.
  if (typeof target === "string") {
    const isAbsolute = /^https?:\/\//i.test(target) || target.startsWith("//");
    if (isAbsolute) {
      let targetHost: string | null = null;
      try {
        targetHost = new URL(target.startsWith("//") ? `https:${target}` : target).host;
      } catch {
        targetHost = null;
      }
      if (!targetHost || targetHost !== requestUrl.host) {
        logger.warn(`[Redirects] Blocked external redirect to ${target}`);
        return new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain", "X-Robots-Tag": "none" },
        });
      }
    }
  }

  return new Response(null, {
    status: redirect.type || 301,
    headers: { location: target },
  });
}

export function invalidateRedirectCache(tenantId: string) {
  cacheService.clearByPattern("redirect:", tenantId);
}
