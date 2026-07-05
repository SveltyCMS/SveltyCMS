/**
 * @file src/hooks/handle-api-requests.ts
 * @description Hardened API request authorization middleware with tenant-scoped caching and atomic compression.
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { API_CACHE_TTL_S, cacheService } from "@src/databases/cache/cache-service";
import { metricsService } from "@src/services/observability/metrics-service";
import type { Handle } from "@sveltejs/kit";
import { AppError, getErrorMessage, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isAdmin, isPublicRoute } from "@utils/hook-utils";
import { xxhash64 } from "hash-wasm";
import {
  compressSync,
  negotiateEncoding,
  hasNativeCompression,
  setCompressionHeaders,
  compressZstd,
} from "./handle-compression";

function getApiEndpoint(pathname: string | null): string | null {
  if (!pathname || pathname.length < 6 || !pathname.startsWith("/api/")) return null;
  const path = pathname.substring(5);
  if (path.startsWith("local/")) {
    const sub = path.substring(6);
    const nextSlash = sub.indexOf("/");
    return nextSlash === -1 ? sub : sub.substring(0, nextSlash);
  }
  const nextSlash = path.indexOf("/");
  return nextSlash === -1 ? path : path.substring(0, nextSlash);
}

function generateCacheKey(
  pathname: string,
  search: string,
  userId: string,
  tenantId: string | null,
): string {
  const safeTenant = tenantId || "global";
  return `api:${safeTenant}:${userId}:${pathname}${search}`;
}

export const handleApiRequests: Handle = async ({ event, resolve }) => {
  const { url, locals, request } = event;
  if ((locals as any).__testBypass) return resolve(event);
  if (!url.pathname.startsWith("/api/")) return resolve(event);

  const testMode = process.env.TEST_MODE === "true";
  if (isPublicRoute(url.pathname, testMode)) return resolve(event);

  try {
    if (!locals.user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    metricsService.incrementApiRequests();

    const apiEndpoint = getApiEndpoint(url.pathname);
    if (!apiEndpoint) throw new AppError("Invalid API path", 400, "INVALID_PATH");

    if (url.pathname !== "/api/user/logout") {
      const userRole = locals.user?.role || "guest";
      if (!hasApiPermission(userRole, apiEndpoint, isAdmin(locals.user))) {
        throw new AppError(
          `Forbidden: Role ${userRole} denied for ${apiEndpoint}`,
          403,
          "FORBIDDEN",
        );
      }
    }

    const tenantIdString = locals.tenantId ? String(locals.tenantId) : null;
    const cacheKey = generateCacheKey(
      url.pathname,
      url.search,
      String(locals.user._id),
      tenantIdString,
    );

    const refresh = url.searchParams.get("refresh") === "true";
    const nocache =
      url.searchParams.get("nocache") === "true" || url.searchParams.get("bypassCache") === "true";
    const bypassCache = refresh || nocache;

    if (request.method === "GET") {
      if (!bypassCache && locals.user?._id) {
        try {
          const cached = await cacheService.get<any>(cacheKey, locals.tenantId);
          if (cached) {
            metricsService.recordApiCacheHit();
            const ifNoneMatch = request.headers.get("if-none-match");
            const cachedEtag = cached.headers?.["etag"] || cached.headers?.["ETag"];
            if (cachedEtag && ifNoneMatch === cachedEtag) {
              return new Response(null, {
                status: 304,
                headers: {
                  etag: cachedEtag,
                  "X-Cache": "HIT",
                  Vary: "Accept-Encoding",
                },
              });
            }

            const acceptEncoding = request.headers.get("Accept-Encoding") || "";
            const algo = negotiateEncoding(acceptEncoding, hasNativeCompression());
            const preComp = algo ? cached.compressed?.[algo] : null;
            if (preComp) {
              const responseHeaders = new Headers(cached.headers || {});
              responseHeaders.set("X-Cache", "HIT");
              responseHeaders.set("Vary", "Accept-Encoding");
              setCompressionHeaders(
                responseHeaders,
                algo!,
                cached.body?.length || preComp.length,
                preComp.length,
              );
              return new Response(preComp, {
                status: 200,
                headers: responseHeaders,
              });
            }

            return Response.json(cached.data, {
              status: 200,
              headers: {
                ...cached.headers,
                "X-Cache": "HIT",
                Vary: "Accept-Encoding",
              },
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
          const ifNoneMatch = request.headers.get("if-none-match");
          const isBenchmark =
            process.env.BENCHMARK === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true";

          if ((nocache && !ifNoneMatch) || (isBenchmark && !ifNoneMatch)) {
            response.headers.set("X-Cache", nocache ? "NOCACHE" : "BYPASS-BENCH");
            response.headers.set("Vary", "Accept-Encoding");
            return response;
          }

          const apiData = (locals as any).apiData;
          let responseBody: string | null = null;
          let responseData: any = null;

          if (apiData) {
            responseData = apiData;
            responseBody = JSON.stringify(apiData);
          } else {
            const clone = response.clone();
            responseBody = await clone.text();
            try {
              responseData = JSON.parse(responseBody);
            } catch {}
          }

          if (responseBody) {
            let etag = response.headers.get("etag");
            if (!etag) {
              etag = `"${await xxhash64(responseBody)}"`;
              response.headers.set("etag", etag);
            }
            response.headers.set("Vary", "Accept-Encoding");

            if (request.headers.get("if-none-match") === etag) {
              return new Response(null, {
                status: 304,
                headers: { etag, Vary: "Accept-Encoding" },
              });
            }

            response.headers.set("X-Cache", nocache ? "NOCACHE" : refresh ? "REFRESH" : "MISS");

            if (!nocache && responseData && locals.user?._id) {
              const currentTenantId = locals.tenantId;
              (async () => {
                try {
                  const compressedPayloads: Record<string, any> = {};
                  const compressionTasks: Promise<void>[] = [];
                  if (hasNativeCompression()) {
                    compressionTasks.push(
                      Promise.resolve().then(() => {
                        const br = compressSync(responseBody!, "br");
                        if (br) compressedPayloads.br = br;
                        const gz = compressSync(responseBody!, "gzip");
                        if (gz) compressedPayloads.gzip = gz;
                      }),
                    );
                  }
                  compressionTasks.push(
                    compressZstd(responseBody!)
                      .then((zstd) => {
                        if (zstd) compressedPayloads.zstd = zstd;
                      })
                      .catch(() => {}),
                  );
                  // Atomic: wait for all compression variants before cache write
                  await Promise.all(compressionTasks);

                  await cacheService.set(
                    cacheKey,
                    {
                      data: responseData,
                      body: responseBody,
                      compressed: Object.keys(compressedPayloads).length
                        ? compressedPayloads
                        : undefined,
                      headers: Object.fromEntries(response.headers),
                    },
                    API_CACHE_TTL_S,
                    currentTenantId,
                  );
                } catch (e) {
                  if (process.env.NODE_ENV !== "test") {
                    logger.error(`Background cache compression failed: ${getErrorMessage(e)}`);
                  }
                }
              })();
            }
          }
          return response;
        }
      }
      return response;
    }

    const response = await resolve(event);
    if (
      ["POST", "PUT", "DELETE", "PATCH"].includes(request.method) &&
      response.ok &&
      !url.pathname.endsWith("/warm-cache") &&
      locals.user?._id
    ) {
      const currentTenantId = locals.tenantId;
      (async () => {
        try {
          const apiPathPrefix = url.pathname.includes("/local/")
            ? `/api/local/${apiEndpoint}`
            : `/api/${apiEndpoint}`;
          const pattern = `api:${tenantIdString || "global"}:${String(locals.user!._id)}:${apiPathPrefix}`;
          await cacheService.clearByPattern(`${pattern}*`, currentTenantId);

          if (
            ["POST", "PUT", "PATCH"].includes(request.method) &&
            event.url.origin &&
            process.env.BENCHMARK_MODE !== "1"
          ) {
            const prewarmUrl = new URL(event.url.pathname, event.url.origin);
            prewarmUrl.searchParams.set("warm-cache", "true");
            fetch(prewarmUrl.toString(), {
              method: "GET",
              headers: {
                Cookie: event.request.headers.get("Cookie") || "",
                Authorization: event.request.headers.get("Authorization") || "",
              },
            }).catch(() => {});
          }
        } catch (e) {
          if (process.env.NODE_ENV !== "test") {
            logger.error(`Cache invalidation failed: ${getErrorMessage(e)}`);
          }
        }
      })();
    }
    return response;
  } catch (err) {
    metricsService.incrementApiErrors();
    return handleApiError(err, event);
  }
};

export async function invalidateApiCache(
  apiEndpoint: string,
  userId: string,
  tenantId?: string | null,
  isLocal = false,
): Promise<void> {
  const apiPathPrefix = isLocal ? `/api/local/${apiEndpoint}` : `/api/${apiEndpoint}`;
  const safeTenant = tenantId ? String(tenantId) : "global";
  const baseKey = `api:${safeTenant}:${userId}:${apiPathPrefix}`;
  try {
    await cacheService.clearByPattern(`${baseKey}*`, tenantId ?? undefined);
    await cacheService.delete(baseKey, tenantId ?? undefined);
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      logger.error(`Manual invalidation failed: ${getErrorMessage(err)}`);
    }
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
