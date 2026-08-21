/**
 * @file src/hooks/handle-turbo-get.ts
 * @description
 * Turbo GET fast-path serving pre-compressed cached responses, including zstd.
 *
 * Short-circuits authenticated GET/HEAD/OPTIONS on cacheable API prefixes when:
 * 1. A valid session cookie maps to a warm turbo auth context, and
 * 2. `responseCache` has a pre-stringified response tuple.
 */

import type { Handle } from "@sveltejs/kit/hooks";
import type { User, Role } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import {
  responseCache,
  buildUserResponseCacheKey,
  buildGraphQLResponseCacheKey,
} from "@src/services/cache/response-cache";
import { CACHEABLE_PREFIXES } from "./request-classifier";
import { readSessionCookie } from "@src/databases/auth/constants";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { getRequestFlags } from "@utils/hook-utils";
import {
  negotiateEncoding,
  compressSync,
  hasNativeCompression,
  setCompressionHeaders,
  type CompressionAlgorithm,
} from "./handle-compression";

interface TurboAuthContext {
  user: User;
  roles: Role[];
  bitset: Uint32Array;
  tenantId: DatabaseId | null;
  expiresAt: number;
}

const turboAuthCache = new Map<string, TurboAuthContext>();
export { turboAuthCache };
const TURBO_AUTH_CACHE_MAX = 1000;
const TURBO_AUTH_TTL_MS = 60_000;

export function setTurboAuthContext(
  sessionId: string,
  user: User,
  roles: Role[],
  bitset: Uint32Array,
  tenantId: DatabaseId | null,
): void {
  if (turboAuthCache.has(sessionId)) {
    turboAuthCache.delete(sessionId);
  } else if (turboAuthCache.size >= TURBO_AUTH_CACHE_MAX) {
    const firstKey = turboAuthCache.keys().next().value;
    if (firstKey) turboAuthCache.delete(firstKey);
  }

  turboAuthCache.set(sessionId, {
    user,
    roles,
    bitset,
    tenantId,
    expiresAt: Date.now() + TURBO_AUTH_TTL_MS,
  });
}

export function getTurboAuthContext(sessionId: string): TurboAuthContext | null {
  const ctx = turboAuthCache.get(sessionId);
  if (!ctx) return null;

  if (Date.now() > ctx.expiresAt) {
    turboAuthCache.delete(sessionId);
    return null;
  }

  if (turboAuthCache.size >= TURBO_AUTH_CACHE_MAX * 0.8) {
    turboAuthCache.delete(sessionId);
    turboAuthCache.set(sessionId, ctx);
  }
  return ctx;
}

export function invalidateTurboAuthContext(sessionId: string): void {
  turboAuthCache.delete(sessionId);
}

export function clearTurboAuthCache(): void {
  turboAuthCache.clear();
}

function isCacheableApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  for (let i = 0; i < CACHEABLE_PREFIXES.length; i++) {
    if (pathname.startsWith(CACHEABLE_PREFIXES[i])) return true;
  }
  return false;
}

export const handleTurboGet: Handle = async ({ event, resolve }) => {
  const { request, url, cookies, locals } = event;
  const method = request.method;
  const flags = getRequestFlags(locals);

  if (flags.isStatic || flags.isBootstrap) return resolve(event);
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return resolve(event);
  if (!isCacheableApiPath(url.pathname)) return resolve(event);

  const sessionId = readSessionCookie(cookies) || null;

  if (!sessionId) return resolve(event);

  const turboCtx = getTurboAuthContext(sessionId);
  if (!turboCtx) return resolve(event);

  locals.user = turboCtx.user;
  locals.roles = turboCtx.roles;
  locals.tenantId = turboCtx.tenantId;
  (locals as { __turboAuth?: boolean }).__turboAuth = true;

  // 🧪 TEST-MODE TENANT PARITY: honor the per-request tenant header in test mode only
  // (same as handleAuthentication) so turbo cache keys never cross tenants in
  // tenant-isolation tests. Without this test-gate, untrusted headers could cross tenants in prod.
  const isTestMode =
    process.env.TEST_MODE === "true" ||
    process.env.PLAYWRIGHT_TEST === "true" ||
    process.env.NODE_ENV === "test";
  const requestTenant = isTestMode
    ? (request.headers.get("x-test-tenant-id") ?? request.headers.get("x-tenant-id"))
    : null;
  const cacheTenant =
    requestTenant && /^[a-zA-Z0-9_-]+$/.test(requestTenant)
      ? (requestTenant as string)
      : (turboCtx.tenantId as string);
  if (cacheTenant) locals.tenantId = cacheTenant as DatabaseId;

  const userId = turboCtx.user?._id || turboCtx.user?.id || null;
  let pathKey: string;
  if (url.pathname === "/api/graphql") {
    const query = url.searchParams.get("query") || "";
    const varsStr = url.searchParams.get("variables") || "";
    const pubFilter =
      url.searchParams.get("publicationFilter") ||
      request.headers.get("x-publication-filter") ||
      "all";
    pathKey = buildGraphQLResponseCacheKey(query, varsStr, pubFilter, userId);
  } else {
    pathKey = buildUserResponseCacheKey(url.pathname, url.search, userId);
  }

  const resEntry = responseCache.get(pathKey, cacheTenant);

  if (!resEntry || !resEntry.body) return resolve(event);

  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    "X-Cache": "TURBO-HIT",
    "Cache-Control": "private, must-revalidate",
    Vary: "Accept-Encoding, Cookie",
  });

  applyAllSecurityHeaders(
    responseHeaders,
    url.protocol === "https:",
    request.headers.get("Origin") || null,
    url.pathname,
  );

  if (resEntry.etag) {
    responseHeaders.set("ETag", resEntry.etag);
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch && (ifNoneMatch === resEntry.etag || ifNoneMatch === `W/${resEntry.etag}`)) {
      return new Response(null, {
        status: 304,
        headers: responseHeaders,
      });
    }
  }

  const rawBody = resEntry.body;
  let bodyToSend: BodyInit | Uint8Array | null = resEntry.buffer ?? rawBody;

  const acceptEncoding = request.headers.get("Accept-Encoding") || "";
  const algo = negotiateEncoding(acceptEncoding, hasNativeCompression());
  const payloadSize = resEntry.buffer
    ? resEntry.buffer.byteLength
    : Buffer.byteLength(rawBody, "utf-8");

  if (algo && payloadSize > 1024) {
    // 🚀 Serve the pre-computed variant stashed by handle-api-requests
    // (br/gzip/zstd) — re-compressing the cached body per hit cost ~17-27µs
    // per KB, i.e. the same magnitude as the whole middleware chain for
    // >4KB payloads. Fall back to on-the-fly compression when the variant
    // is missing (e.g. cold L1 entry from before the stash landed).
    const variant = resEntry.compressed?.[algo];
    if (variant && variant.length < payloadSize) {
      bodyToSend = variant;
      setCompressionHeaders(responseHeaders, algo, payloadSize, variant.length);
    } else {
      try {
        const compressed = compressSync(rawBody, algo as CompressionAlgorithm, payloadSize);
        if (compressed && compressed.length < payloadSize) {
          bodyToSend = compressed;
          setCompressionHeaders(responseHeaders, algo, payloadSize, compressed.length);
        }
      } catch {
        bodyToSend = resEntry.buffer ?? rawBody;
      }
    }
  }

  // HEAD/OPTIONS must return headers only — HTTP forbids a content body on
  // these methods. Serving the cached JSON payload (as before) violated RFC
  // 9110 and could hang clients waiting for a body that must not arrive.
  if (method === "HEAD" || method === "OPTIONS") {
    bodyToSend = null;
  }

  return new Response(bodyToSend as BodyInit, {
    status: 200,
    headers: responseHeaders,
  });
};
