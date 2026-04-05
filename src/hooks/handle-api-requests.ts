/**
 * @file src/hooks/handle-api-requests.ts
 * @description Middleware for API request authorization and intelligent caching with streaming optimization
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { API_CACHE_TTL_S, cacheService } from "@src/databases/cache/cache-service";
import { metricsService } from "@src/services/metrics-service";
import type { Handle } from "@sveltejs/kit";
import { AppError, getErrorMessage, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { isPublicRoute } from "@utils/hook-utils";
import crypto from "node:crypto";

/** Optimized API endpoint extraction: Ultra-fast prefix triage */
function getApiEndpoint(pathname: string | null): string | null {
  if (!pathname || pathname.length < 6 || !pathname.startsWith("/api/")) return null;

  // Skip prefix "/api/" (length 5)
  const path = pathname.substring(5);

  // High-performance prefix triage
  if (path.startsWith("local/")) {
    const sub = path.substring(6); // skip "local/"
    const nextSlash = sub.indexOf("/");
    return nextSlash === -1 ? sub : sub.substring(0, nextSlash);
  }

  const nextSlash = path.indexOf("/");
  return nextSlash === -1 ? path : path.substring(0, nextSlash);
}

/** Generates a cache key for API responses. */
function generateCacheKey(pathname: string, search: string, userId: string): string {
  return `api:${userId}:${pathname}${search}`;
}

export const handleApiRequests: Handle = async ({ event, resolve }) => {
  const { url, locals, request } = event;

  if (!url.pathname.startsWith("/api/")) return resolve(event);

  const testMode = process.env.TEST_MODE === "true";
  if (isPublicRoute(url.pathname, testMode)) return resolve(event);

  try {
    if (!locals.user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    metricsService.incrementApiRequests();

    // --- Rate Limiting for Sensitive Endpoints ---
    if (["/api/website-tokens", "/api/permission/update"].some((p) => url.pathname.startsWith(p))) {
      const rateLimitKey = `ratelimit:api:sensitive:${locals.user._id}:${url.pathname}`;
      try {
        const current = await cacheService.get<{ count: number }>(rateLimitKey);
        const attempts = (current?.count ?? 0) + 1;
        if (attempts > 30) throw new AppError("Rate limit exceeded", 429, "TOO_MANY_REQUESTS");
        await cacheService.set(rateLimitKey, { count: attempts }, 60);
      } catch (e) {
        if (e instanceof AppError) throw e;
        logger.error(`Rate limit check failed: ${getErrorMessage(e)}`);
      }
    }

    const apiEndpoint = getApiEndpoint(url.pathname);
    if (!apiEndpoint) throw new AppError("Invalid API path", 400, "INVALID_PATH");

    // --- Authorization ---
    if (url.pathname !== "/api/user/logout") {
      const isAdmin =
        locals.isAdmin || locals.user.isAdmin === true || (locals.user as any).role === "admin";
      if (!hasApiPermission(locals.user.role, apiEndpoint, isAdmin)) {
        throw new AppError(
          `Forbidden: Role ${locals.user.role} denied for ${apiEndpoint}`,
          403,
          "FORBIDDEN",
        );
      }
    }

    const refresh = url.searchParams.get("refresh") === "true";
    const nocache = url.searchParams.get("nocache") === "true";
    const bypassCache = refresh || nocache;

    // === GET REQUESTS WITH CACHING ===
    if (request.method === "GET") {
      if (!bypassCache) {
        try {
          const cached = await cacheService.get<{
            data: unknown;
            headers: Record<string, string>;
          }>(generateCacheKey(url.pathname, url.search, locals.user._id), locals.tenantId);

          if (cached) {
            metricsService.recordApiCacheHit();
            const ifNoneMatch = request.headers.get("if-none-match");
            const cachedEtag = cached.headers["etag"];

            if (cachedEtag && ifNoneMatch === cachedEtag) {
              return new Response(null, {
                status: 304,
                headers: { etag: cachedEtag, "X-Cache": "HIT" },
              });
            }

            return new Response(JSON.stringify(cached.data), {
              status: 200,
              headers: { ...cached.headers, "Content-Type": "application/json", "X-Cache": "HIT" },
            });
          }
        } catch (cacheError) {
          logger.warn(`Cache read error: ${getErrorMessage(cacheError)}`);
        }
      }

      const response = await resolve(event);
      if (apiEndpoint === "graphql") {
        response.headers.set("X-Cache", "BYPASS");
        return response;
      }

      if (response.ok) {
        metricsService.recordApiCacheMiss();
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const responseClone = response.clone();
          const responseBody = await responseClone.text();
          const etag = `"${crypto.createHash("md5").update(responseBody).digest("hex")}"`;

          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, { status: 304, headers: { etag } });
          }

          response.headers.set("etag", etag);
          response.headers.set("X-Cache", nocache ? "NOCACHE" : refresh ? "REFRESH" : "MISS");

          if (!nocache) {
            (async () => {
              try {
                const responseData = JSON.parse(responseBody);
                if (!locals.user?._id) return;
                await cacheService.set(
                  generateCacheKey(url.pathname, url.search, locals.user._id),
                  { data: responseData, headers: Object.fromEntries(responseClone.headers) },
                  API_CACHE_TTL_S,
                  locals.tenantId,
                );
              } catch (e) {
                logger.error(`Background cache failed: ${getErrorMessage(e)}`);
              }
            })();
          }
          return response;
        }
      }
      return response;
    }

    // === MUTATIONS ===
    const response = await resolve(event);
    if (
      ["POST", "PUT", "DELETE", "PATCH"].includes(request.method) &&
      response.ok &&
      !url.pathname.endsWith("/warm-cache")
    ) {
      (async () => {
        try {
          if (!locals.user?._id) return;
          const apiPathPrefix = url.pathname.includes("/local/")
            ? `/api/local/${apiEndpoint}`
            : `/api/${apiEndpoint}`;
          const pattern = `api:${locals.user._id}:${apiPathPrefix}`;
          await cacheService.clearByPattern(`${pattern}*`, locals.tenantId);
        } catch (e) {
          logger.error(`Cache invalidation failed: ${getErrorMessage(e)}`);
        }
      })();
    }

    return response;
  } catch (err) {
    metricsService.incrementApiErrors();
    return handleApiError(err, event);
  }
};

// --- UTILITY EXPORTS ---

export async function invalidateApiCache(
  apiEndpoint: string,
  userId: string,
  tenantId?: string | null,
  isLocal = false,
): Promise<void> {
  const apiPathPrefix = isLocal ? `/api/local/${apiEndpoint}` : `/api/${apiEndpoint}`;
  const baseKey = `api:${userId}:${apiPathPrefix}`;
  try {
    await cacheService.clearByPattern(`${baseKey}*`, tenantId);
    await cacheService.delete(baseKey, tenantId);
  } catch (err) {
    logger.error(`Manual invalidation failed: ${getErrorMessage(err)}`);
  }
}

export function getApiHealthMetrics() {
  const report = metricsService.getReport();
  return {
    cache: {
      hits: report.api.l1Hits + report.api.l2Hits,
      misses: report.api.cacheMisses,
      hitRate: report.api.cacheHitRate,
      layers: { l1: report.api.l1Hits, l2: report.api.l2Hits },
    },
    requests: { total: report.api.requests, errors: report.api.errors },
  };
}
