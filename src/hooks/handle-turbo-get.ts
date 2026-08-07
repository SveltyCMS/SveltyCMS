/**
 * @file src/hooks/handle-turbo-get.ts
 * @description
 * Turbo GET fast-path serving pre-compressed cached responses, including zstd.
 *
 * Short-circuits authenticated GET/HEAD/OPTIONS on cacheable API prefixes when:
 * 1. A valid session cookie maps to a warm turbo auth context, and
 * 2. `responseCache` has a pre-stringified response tuple.
 */

import type { Handle } from "@sveltejs/kit";
import type { User, Role } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import {
  responseCache,
  buildUserResponseCacheKey,
  buildGraphQLResponseCacheKey,
} from "@src/services/cache/response-cache";
import { CACHEABLE_PREFIXES } from "./request-classifier";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
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

function getTurboAuthContext(sessionId: string): TurboAuthContext | null {
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

/** Stable turbo-auth key for x-test-secret / BENCHMARK synthetic sessions. */
export function buildBenchmarkTurboSessionId(secret: string): string {
  return `bench:${secret}`;
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

  // Cookie session (production) OR warm benchmark turbo key (only if already in turboAuthCache)
  let sessionId =
    cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
    cookies.get(`__Secure-${SESSION_COOKIE_NAME}`) ||
    cookies.get(SESSION_COOKIE_NAME) ||
    null;

  if (!sessionId) {
    const testSecret = request.headers.get("x-test-secret") || request.headers.get("X-Test-Secret");
    if (testSecret) {
      const expected = process.env.TEST_API_SECRET;
      // Fail-closed: secret must match env AND entry must already exist in turboAuthCache
      if (expected && testSecret === expected) {
        sessionId = buildBenchmarkTurboSessionId(testSecret);
      }
    }
  }

  if (!sessionId) return resolve(event);

  const turboCtx = getTurboAuthContext(sessionId);
  if (!turboCtx) return resolve(event);

  locals.user = turboCtx.user;
  locals.roles = turboCtx.roles;
  locals.tenantId = turboCtx.tenantId;
  (locals as { __turboAuth?: boolean }).__turboAuth = true;

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

  const resEntry = responseCache.get(pathKey, turboCtx.tenantId as string);

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

  if (resEntry.etag) responseHeaders.set("ETag", resEntry.etag);

  const rawBody = resEntry.body;
  let bodyToSend: BodyInit | Uint8Array | null = rawBody;

  const acceptEncoding = request.headers.get("Accept-Encoding") || "";
  const algo = negotiateEncoding(acceptEncoding, hasNativeCompression());
  const payloadSize = Buffer.byteLength(rawBody, "utf-8");

  if (algo && payloadSize > 1024) {
    try {
      const compressed = compressSync(rawBody, algo as CompressionAlgorithm, payloadSize);
      if (compressed && compressed.length < payloadSize) {
        bodyToSend = compressed;
        setCompressionHeaders(responseHeaders, algo, payloadSize, compressed.length);
      }
    } catch {
      bodyToSend = rawBody;
    }
  }

  return new Response(bodyToSend as BodyInit, {
    status: 200,
    headers: responseHeaders,
  });
};
