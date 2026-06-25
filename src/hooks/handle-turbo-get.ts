/**
 * @file src/hooks/handle-turbo-get.ts
 * @description Turbo GET fast-path serving pre-compressed cached responses, including zstd.
 */

import type { Handle } from "@sveltejs/kit";
import type { User, Role } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import { cacheService } from "@src/databases/cache/cache-service";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { dev } from "$app/environment";
import {
  negotiateEncoding,
  compressSync,
  hasNativeCompression,
  setCompressionHeaders,
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

const CACHEABLE_API_PREFIXES = [
  "/api/collections",
  "/api/content",
  "/api/settings",
  "/api/system",
  "/api/schema",
  "/api/navigation",
  "/api/themes",
  "/api/config",
];

export function setTurboAuthContext(
  sessionId: string,
  user: User,
  roles: Role[],
  bitset: Uint32Array,
  tenantId: DatabaseId | null,
): void {
  if (turboAuthCache.size >= TURBO_AUTH_CACHE_MAX) {
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

export function invalidateTurboAuthContext(sessionId: string): void {
  turboAuthCache.delete(sessionId);
}
export function clearTurboAuthCache(): void {
  turboAuthCache.clear();
}

function isCacheableApiPath(pathname: string): boolean {
  for (const prefix of CACHEABLE_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export const handleTurboGet: Handle = async ({ event, resolve }) => {
  const { request, url, cookies, locals } = event;
  const method = request.method;

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return resolve(event);
  if (!isCacheableApiPath(url.pathname)) return resolve(event);

  // Prioritize most restrictive cookie prefixes first to prevent token spoofing
  const sessionId =
    cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
    cookies.get(`__Secure-${SESSION_COOKIE_NAME}`) ||
    cookies.get(SESSION_COOKIE_NAME);

  if (!sessionId) return resolve(event);

  const turboCtx = turboAuthCache.get(sessionId);
  if (!turboCtx || Date.now() > turboCtx.expiresAt) {
    if (turboCtx) turboAuthCache.delete(sessionId);
    return resolve(event);
  }

  locals.user = turboCtx.user;
  locals.roles = turboCtx.roles;
  locals.tenantId = turboCtx.tenantId;
  (locals as any).__turboAuth = true;

  const cacheKey = url.pathname + url.search;
  const cachedResponse: any = cacheService.getSync<string>(cacheKey, turboCtx.tenantId);
  if (!cachedResponse) return resolve(event);

  if (dev) {
    const duration = performance.now() - ((locals as any).requestStart || performance.now());
    console.log(`[TurboGET] ${method} ${cacheKey} → HIT (${duration.toFixed(2)}ms)`);
  }

  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    "X-Cache": "TURBO-HIT",
    "Cache-Control": "private, must-revalidate",
    Vary: "Accept-Encoding",
  });
  applyAllSecurityHeaders(
    responseHeaders,
    url.protocol === "https:",
    request.headers.get("Origin") || null,
    url.pathname,
  );

  const isRichEntry =
    typeof cachedResponse === "object" &&
    cachedResponse !== null &&
    !(cachedResponse instanceof Uint8Array) &&
    !Buffer.isBuffer(cachedResponse);
  const entry = isRichEntry ? cachedResponse : null;
  const rawBody: string | Uint8Array | null = isRichEntry
    ? (cachedResponse.body ?? null)
    : cachedResponse;
  let bodyToSend: BodyInit | Uint8Array = rawBody as any;

  if (rawBody && typeof rawBody === "string") {
    const acceptEncoding = request.headers.get("Accept-Encoding") || "";
    const algo = negotiateEncoding(acceptEncoding, hasNativeCompression());
    const payloadSize = Buffer.byteLength(rawBody, "utf-8");

    if (algo && payloadSize > 1024) {
      try {
        // Support all pre-compressed formats including zstd
        const preallocatedBytes = entry?.compressed?.[algo];
        if (preallocatedBytes) {
          bodyToSend = preallocatedBytes;
          setCompressionHeaders(responseHeaders, algo, payloadSize, preallocatedBytes.length);
        } else if (["br", "gzip", "deflate"].includes(algo)) {
          const compressed = compressSync(rawBody, algo as any);
          if (compressed && compressed.length < payloadSize) {
            bodyToSend = compressed;
            setCompressionHeaders(responseHeaders, algo, payloadSize, compressed.length);
          }
        }
      } catch {
        /* fall through to raw */
      }
    }
  }

  return new Response(method === "HEAD" ? null : (bodyToSend as BodyInit), {
    status: 200,
    headers: responseHeaders,
  });
};
