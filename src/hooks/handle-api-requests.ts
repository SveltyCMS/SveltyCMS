/**
 * @file src/hooks/handle-api-requests.ts
 * @description
 * Hardened API request authorization middleware with tenant-scoped caching and atomic compression.
 *
 * ### Features:
 * - RBAC gate via `hasApiPermission` before resolve
 * - Tenant-scoped L1/L2 response cache with ETag / 304 support
 * - Background pre-compression (br/gzip/zstd) stored on cache entries
 * - Cache invalidation + opportunistic prewarm on mutating methods
 * - Safe header mutation via `withMutableHeaders` (immutable Response safety)
 */

import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { API_CACHE_TTL_S, cacheService } from "@src/databases/cache/cache-service";
import type { DatabaseId } from "@src/databases/db-interface";
import { metricsService } from "@src/services/observability/metrics-service";
import type { Handle } from "@sveltejs/kit/hooks";
import { AppError, getErrorMessage, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import {
  isAdmin,
  isPublicRoute,
  isBootstrapRoute,
  withMutableHeaders,
  getUserCacheId,
  buildUserCacheKey,
  MUTATION_HTTP_METHODS,
  WRITE_HTTP_METHODS,
  isGraphqlReadOperation,
} from "@utils/hook-utils";
import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";
import {
  compressSync,
  negotiateEncoding,
  hasNativeCompression,
  setCompressionHeaders,
  addVaryHeader,
  compressZstd,
} from "./handle-compression";
import {
  getCollectionFromPath,
  getCollectionFields,
  hasGuardedFields,
  assertWriteAllowed,
} from "@src/services/security/field-permission-service";

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

// ─── Request Coalescing (Stampede Prevention) ────────────────────────────────
// Only ONE request per cacheKey resolves upstream; concurrent identical GETs
// await the leader's shared cache entry instead of re-entering resolve() → DB.
// Bound the map so a burst of unique keys can never grow memory unboundedly.
interface CoalescedCacheEntry {
  data: unknown;
  body: string;
  headers: Record<string, string>;
}
const inflightApiGets = new Map<string, Promise<CoalescedCacheEntry | null>>();
const MAX_INFLIGHT_GETS = 64;

/**
 * Serves a cached API response (shared by the HIT path and coalesced waiters).
 * The entry is plain data (body + headers), so each caller builds its OWN
 * Response — never share a single Response object (bodies are single-use streams).
 */
function serveCachedEntry(cached: any, request: Request): Response {
  const ifNoneMatch = request.headers.get("if-none-match");
  const cachedEtag = cached.headers?.["etag"] || cached.headers?.["ETag"];
  if (cachedEtag && ifNoneMatch === cachedEtag) {
    return new Response(null, {
      status: 304,
      headers: { etag: cachedEtag, "X-Cache": "HIT", Vary: "Accept-Encoding" },
    });
  }

  const acceptEncoding = request.headers.get("Accept-Encoding") || "";
  const originalSize =
    cached.buffer?.length ||
    (typeof cached.body === "string" ? Buffer.byteLength(cached.body, "utf8") : 0);
  const algo = negotiateEncoding(acceptEncoding, hasNativeCompression(), {
    contentLength: originalSize,
  });
  const preComp = algo ? cached.compressed?.[algo] : null;
  // Never serve a "compressed" variant that is larger than the original.
  if (preComp && (originalSize === 0 || preComp.length < originalSize)) {
    const responseHeaders = new Headers(cached.headers || {});
    // 🐛 cached.headers carries the ORIGINAL (uncompressed) Content-Length.
    // Serving the compressed variant with it makes clients wait for bytes that
    // never arrive → "socket closed unexpectedly" on every compressed cache hit.
    responseHeaders.delete("content-length");
    responseHeaders.set("X-Cache", "HIT");
    addVaryHeader(responseHeaders, "Accept-Encoding");
    setCompressionHeaders(responseHeaders, algo!, originalSize || preComp.length, preComp.length);
    return new Response(preComp, { status: 200, headers: responseHeaders });
  }

  const responseHeaders = new Headers(cached.headers || {});
  // cached.headers carries the ORIGINAL Content-Length; when the body is
  // re-serialized from cached.data (JSON.stringify) the byte count differs
  // and clients wait for bytes that never arrive. Node recomputes
  // Content-Length for string bodies — drop the stale value.
  responseHeaders.delete("content-length");
  responseHeaders.set("Content-Type", responseHeaders.get("Content-Type") || "application/json");
  responseHeaders.set("X-Cache", "HIT");
  addVaryHeader(responseHeaders, "Accept-Encoding");
  const body = typeof cached.body === "string" ? cached.body : JSON.stringify(cached.data);
  return new Response(body, { status: 200, headers: responseHeaders });
}

// 10ms batch flusher for L2 pattern invalidations so write storms don't saturate event loop
const _pendingPatterns = new Set<string>();
let _patternFlushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePatternClear(pattern: string, tenantId?: DatabaseId | null) {
  _pendingPatterns.add(`${pattern}::${tenantId || "default"}`);
  if (!_patternFlushTimer) {
    _patternFlushTimer = setTimeout(async () => {
      _patternFlushTimer = null;
      const copy = Array.from(_pendingPatterns);
      _pendingPatterns.clear();
      for (const item of copy) {
        const [pat, tid] = item.split("::");
        await cacheService
          .clearByPattern(pat, tid === "default" ? undefined : (tid as DatabaseId))
          .catch(() => {});
      }
    }, 10);
    if (typeof _patternFlushTimer?.unref === "function") {
      _patternFlushTimer.unref();
    }
  }
}

export const handleApiRequests: Handle = async ({ event, resolve }) => {
  const { url, locals, request } = event;
  if ((locals as any).__testBypass) return resolve(event);
  if (!url.pathname.startsWith("/api/")) return resolve(event);

  const testMode = process.env.TEST_MODE === "true";
  if (isPublicRoute(url.pathname, testMode) || isBootstrapRoute(url.pathname))
    return resolve(event);

  try {
    if (!locals.user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    metricsService.incrementApiRequests();

    const apiEndpoint = getApiEndpoint(url.pathname);
    if (!apiEndpoint) throw new AppError("Invalid API path", 400, "INVALID_PATH");

    if (url.pathname !== "/api/user/logout") {
      const userRole = locals.user?.role || "guest";
      if (!hasApiPermission(userRole, apiEndpoint, isAdmin(locals.user))) {
        // Ephemeral anonymous users (no real auth) should get 401, not 403
        if ((locals.user as { isAnonymous?: boolean } | undefined)?.isAnonymous) {
          throw new AppError("Authentication required", 401, "UNAUTHORIZED");
        }
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
            // 🚀 Stash the cache entry's already-serialized payload into locals so
            // the downstream token-resolution hook reuses it instead of
            // response.clone().text() on the cache-HIT body (its #1 hot-path cost).
            (locals as any).apiData = cached?.data ?? (locals as any).apiData;
            if (typeof cached?.body === "string") (locals as any).apiBody = cached.body;
            return serveCachedEntry(cached, request);
          }
        } catch (cacheError) {
          logger.warn(`Cache read error: ${getErrorMessage(cacheError)}`);
        }
      }

      // 🚀 REQUEST COALESCING (stampede prevention): if an identical request is
      // already resolving this exact cacheKey, join it instead of re-entering
      // resolve() → DB. The leader publishes its cache entry to waiters, who
      // build their own Response from that shared plain data.
      let flightEntry: CoalescedCacheEntry | null = null;
      let releaseFlight: ((entry: CoalescedCacheEntry | null) => void) | null = null;
      const coalesceEligible = !bypassCache && !!locals.user?._id;
      if (coalesceEligible) {
        const inflight = inflightApiGets.get(cacheKey);
        if (inflight) {
          const entry = await inflight;
          if (entry) {
            metricsService.recordApiCacheHit();
            // 🚀 Same locals stash as the L2 cache-HIT path above — let the
            // downstream token-resolution hook reuse the serialized payload
            // instead of re-cloning/reading the body.
            (locals as any).apiData = entry?.data ?? (locals as any).apiData;
            if (typeof entry?.body === "string") (locals as any).apiBody = entry.body;
            return serveCachedEntry(entry, request);
          }
          // Leader produced no cacheable entry (GraphQL bypass / error) —
          // fall through to our own resolve below.
        } else if (inflightApiGets.size < MAX_INFLIGHT_GETS) {
          const flight = new Promise<CoalescedCacheEntry | null>((res) => (releaseFlight = res));
          inflightApiGets.set(cacheKey, flight);
        }
      }

      try {
        const response = await resolve(event);
        if (apiEndpoint === "graphql") {
          return withMutableHeaders(response, (headers) => {
            headers.set("X-Cache", "BYPASS");
          });
        }

        if (response.ok) {
          metricsService.recordApiCacheMiss();
          const contentType = response.headers.get("content-type");

          if (contentType?.includes("application/json")) {
            const ifNoneMatch = request.headers.get("if-none-match");

            const apiBody = (locals as any).apiBody;
            const apiData = (locals as { apiData?: unknown }).apiData || (locals as any).__apiData;
            let responseBody: string | null = typeof apiBody === "string" ? apiBody : null;
            let responseData: unknown = apiData || null;

            // Nocache: still warm sync L1 turbo map from stashed body, then return
            if (nocache && !ifNoneMatch) {
              if (responseBody && locals.user?._id) {
                const userIdStr = getUserCacheId(locals.user);
                const turboKey = buildUserResponseCacheKey(url.pathname, url.search, userIdStr);
                const etagFast = response.headers.get("etag") || generateContentEtag(responseBody);
                responseCache.set(
                  turboKey,
                  { body: responseBody, etag: etagFast },
                  300_000,
                  locals.tenantId,
                );
              }
              return withMutableHeaders(response, (headers) => {
                headers.set("X-Cache", "NOCACHE");
                headers.set("Vary", "Accept-Encoding");
              });
            }

            if (!responseBody) {
              if (apiData !== undefined) {
                responseBody = typeof apiData === "string" ? apiData : JSON.stringify(apiData);
              } else {
                const clone = response.clone();
                responseBody = await clone.text();
                if (contentType?.includes("application/json")) {
                  try {
                    responseData = JSON.parse(responseBody);
                  } catch {
                    /* non-JSON body */
                  }
                }
              }
            }

            if (responseBody) {
              let etag = response.headers.get("etag");
              if (!etag) {
                etag = generateContentEtag(responseBody);
              }

              if (request.headers.get("if-none-match") === etag) {
                return new Response(null, {
                  status: 304,
                  headers: { etag, Vary: "Accept-Encoding" },
                });
              }

              const cacheStatus = nocache ? "NOCACHE" : refresh ? "REFRESH" : "MISS";
              // Build final headers on a clone — never mutate resolve() Headers
              const finalResponse = withMutableHeaders(response, (headers) => {
                headers.set("etag", etag!);
                headers.set("Vary", "Accept-Encoding");
                headers.set("X-Cache", cacheStatus);
              });

              if (!nocache && responseData && locals.user?._id) {
                // 🚀 COALESCING: publish the leader's resolved entry so waiters
                // can serve it without re-entering resolve(). Guarded by the SAME
                // condition as the cache write — a non-cacheable payload (missing
                // responseData / nocache) must NOT be published to waiters.
                if (releaseFlight && responseBody) {
                  flightEntry = {
                    data: responseData,
                    body: responseBody,
                    headers: Object.fromEntries(finalResponse.headers),
                  };
                }

                const currentTenantId = locals.tenantId;
                const userIdStr = getUserCacheId(locals.user);
                const turboKey = buildUserResponseCacheKey(url.pathname, url.search, userIdStr);
                // Sync L1 turbo path (handleTurboGet) — must use same key builder
                responseCache.set(
                  turboKey,
                  { body: responseBody, etag },
                  API_CACHE_TTL_S * 1000,
                  currentTenantId,
                );

                const headersSnapshot = Object.fromEntries(finalResponse.headers);
                (async () => {
                  try {
                    // Compression variants only pay off above the TURBO-HIT
                    // threshold (1 KiB) — tiny bodies compress to nothing and
                    // would just burn CPU on every unique response.
                    const bodyBytes = responseBody ? Buffer.byteLength(responseBody, "utf8") : 0;
                    if (!responseBody || bodyBytes <= 1024) return;
                    const compressedPayloads: Record<string, Uint8Array> = {};
                    const compressionTasks: Promise<void>[] = [];
                    if (hasNativeCompression()) {
                      compressionTasks.push(
                        Promise.resolve().then(() => {
                          const br = compressSync(responseBody!, "br", bodyBytes);
                          if (br && br.byteLength < bodyBytes) compressedPayloads.br = br;
                          const gz = compressSync(responseBody!, "gzip", bodyBytes);
                          if (gz && gz.byteLength < bodyBytes) compressedPayloads.gzip = gz;
                        }),
                      );
                    }
                    compressionTasks.push(
                      compressZstd(responseBody!)
                        .then((zstd) => {
                          if (zstd && zstd.byteLength < bodyBytes) compressedPayloads.zstd = zstd;
                        })
                        .catch(() => {}),
                    );
                    await Promise.all(compressionTasks);

                    // 🚀 Stash the variants into the L1 turbo entry too —
                    // handleTurboGet previously re-compressed the cached body on
                    // EVERY hit (measured: 16.6µs/KB gzip, 27.4µs/KB brotli,
                    // same magnitude as the whole pipeline for >4KB payloads).
                    if (Object.keys(compressedPayloads).length > 0) {
                      responseCache.set(
                        turboKey,
                        { body: responseBody!, etag: etag!, compressed: compressedPayloads },
                        API_CACHE_TTL_S * 1000,
                        currentTenantId,
                      );
                    }

                    const turboPathKey = buildUserCacheKey(url.pathname, url.search, userIdStr);
                    const cacheEntry = {
                      data: responseData,
                      body: responseBody,
                      compressed: Object.keys(compressedPayloads).length
                        ? compressedPayloads
                        : undefined,
                      headers: headersSnapshot,
                    };
                    await Promise.all([
                      cacheService.set(cacheKey, cacheEntry, API_CACHE_TTL_S, currentTenantId),
                      cacheService.set(turboPathKey, cacheEntry, API_CACHE_TTL_S, currentTenantId),
                    ]);
                  } catch (e) {
                    logger.error(`Background cache compression failed: ${getErrorMessage(e)}`);
                  }
                })();
              }
              return finalResponse;
            }
          }
        }
        return response;
      } finally {
        // Always release coalescing waiters — with the leader's entry when
        // cacheable, null otherwise (waiters then do their own resolve).
        // Cast: TS control-flow cannot see the closure assignment, so it narrows
        // `releaseFlight` to `null` and the truthy check yields `never`.
        if (releaseFlight) {
          (releaseFlight as (entry: CoalescedCacheEntry | null) => void)(flightEntry);
          inflightApiGets.delete(cacheKey);
        }
      }
    }

    // 🔐 FIELD-LEVEL WRITE GUARD: for collections with per-field restrictions
    // (readRoles / writeRoles / requiredAuth / hidden), reject mutations the
    // caller's role may not write BEFORE the handler runs. Throws 403 via
    // enforceFieldAccess when a guarded field is present in the payload.
    // Admin/system and unguarded collections skip at zero cost; schema is
    // memoized (30s) so the mutation path stays DB-free after first load.
    if (
      WRITE_HTTP_METHODS.has(request.method) &&
      !isAdmin(locals.user) &&
      locals.user?.role !== "admin" &&
      locals.user?._id !== "system"
    ) {
      const collection = getCollectionFromPath(url.pathname);
      if (collection) {
        const fields = await getCollectionFields(collection, tenantIdString);
        if (fields && fields.length > 0 && hasGuardedFields(fields)) {
          const body = (await event.request
            .clone()
            .json()
            .catch(() => null)) as Record<string, unknown> | null;
          (locals as any).__parsedJsonBody = body;
          if (body && typeof body === "object") {
            await assertWriteAllowed(fields, body, locals.user, {
              collectionName: collection,
              entryId: url.pathname.split("/").pop() || undefined,
              tenantId: tenantIdString ?? undefined,
            });
          }
        }
      }
    }

    const gqlParsed = (locals as any).__graphqlParsedBody;
    const graphqlIsRead =
      apiEndpoint === "graphql" &&
      isGraphqlReadOperation(typeof gqlParsed?.query === "string" ? gqlParsed.query : "");

    const response = await resolve(event);
    if (
      MUTATION_HTTP_METHODS.has(request.method) &&
      response.ok &&
      !url.pathname.endsWith("/warm-cache") &&
      locals.user?._id &&
      !graphqlIsRead
    ) {
      const currentTenantId = locals.tenantId;
      try {
        const apiPathPrefix = url.pathname.includes("/local/")
          ? `/api/local/${apiEndpoint}`
          : `/api/${apiEndpoint}`;
        const pattern = `api:${tenantIdString || "global"}:${String(locals.user!._id)}:${apiPathPrefix}`;
        // L1 turbo invalidation is synchronous (Map walk) until the first
        // await inside invalidateCollection. Void the promise so L2 pattern
        // scans never sit on the mutation response path; the next GET in this
        // process already sees an empty L1.
        void responseCache.invalidateCollection(apiEndpoint, tenantIdString).catch(() => {});
        void cacheService.delete(pattern, currentTenantId).catch(() => {});
        void cacheService.delete(`${pattern}/`, currentTenantId).catch(() => {});
        // Debounce remaining L2 pattern evictions so write bursts do not
        // spawn concurrent pattern scans or steal PG connections.
        schedulePatternClear(`${pattern}*`, currentTenantId);
        schedulePatternClear(`${apiPathPrefix}*`, currentTenantId);
      } catch (e) {
        logger.error(`Cache invalidation failed: ${getErrorMessage(e)}`);
      }
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
