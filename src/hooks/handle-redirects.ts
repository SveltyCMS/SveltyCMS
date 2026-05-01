/**
 * @file src/hooks/handle-redirects.ts
 * @description High-performance middleware hook for processing redirects.
 */

import type { Handle } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { logger } from "@utils/logger";

// Tenant-aware cache: Map<tenantId, Map<path, Redirect>>
const redirectCache = new Map<string, Map<string, any>>();

/**
 * Middleware hook to intercept requests and apply redirects
 */
export const handleRedirects: Handle = async ({ event, resolve }) => {
  const url = new URL(event.url);
  const path = url.pathname;
  const tenantId = event.locals.tenantId || "default";

  // Skip API and system routes
  if (path.startsWith("/api") || path.startsWith("/cms") || path.startsWith("/_")) {
    return resolve(event);
  }

  // 1. Check Cache
  let tenantCache = redirectCache.get(tenantId);
  if (!tenantCache) {
    // Lazy initialize cache for this tenant
    // In production, we'd want to populate this or use a TTL
    tenantCache = new Map();
    redirectCache.set(tenantId, tenantCache);

    // Optional: Pre-warm cache for active redirects
    if (dbAdapter) {
      const result = await dbAdapter.crud.findMany("redirects", { tenantId, active: true } as any);
      if (result.success && Array.isArray(result.data)) {
        for (const redirect of result.data as any[]) {
          tenantCache.set(redirect.from, redirect);
        }
      }
    }
  }

  const redirect = tenantCache.get(path);
  if (redirect) {
    return applyRedirect(path, redirect);
  }

  // 1b. Check Regex Redirects
  for (const r of tenantCache.values()) {
    if (r.isRegex) {
      try {
        const regex = new RegExp(r.from);
        if (regex.test(path)) {
          return applyRedirect(path, r);
        }
      } catch (e) {
        logger.error(`[RedirectManager] Invalid regex pattern: ${r.from}`, e);
      }
    }
  }

  // 2. Global Rules (Example: Trailing Slash)
  // This could be configurable via plugin settings
  /*
  if (path !== '/' && path.endsWith('/')) {
      return new Response(null, {
          status: 301,
          headers: { location: path.slice(0, -1) + url.search }
      });
  }
  */

  // 2. Log 404 for unmatched path (Non-blocking)
  if (dbAdapter) {
    void (async () => {
      try {
        const table = "404_logs";
        const existing = await dbAdapter.crud.findOne(table, { path, tenantId } as any);
        if (existing.success && existing.data) {
          await dbAdapter.crud.update(table, (existing.data as any)._id, {
            hits: ((existing.data as any).hits || 0) + 1,
            lastHit: new Date().toISOString(),
          } as any);
        } else {
          await dbAdapter.crud.insert(table, {
            path,
            tenantId,
            hits: 1,
            lastHit: new Date().toISOString(),
          } as any);
        }
      } catch {
        // Silently fail to not block the request
      }
    })();
  }

  return resolve(event);
};

/**
 * Helper to apply the redirect response
 */
function applyRedirect(path: string, redirect: any) {
  logger.debug(`[RedirectManager] Redirecting ${path} -> ${redirect.to} (${redirect.type})`);
  return new Response(null, {
    status: redirect.type || 301,
    headers: {
      location: redirect.to,
    },
  });
}

/**
 * Invalidate cache for a tenant
 */
export function invalidateRedirectCache(tenantId: string) {
  redirectCache.delete(tenantId);
}
