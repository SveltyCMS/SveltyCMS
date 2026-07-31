/**
 * @file src/hooks/handle-turbo-get.ts
 * @description
 * Turbo GET fast-path serving pre-compressed cached responses, including zstd.
 *
 * Short-circuits authenticated GET/HEAD/OPTIONS on cacheable API prefixes when:
 * 1. A valid session cookie maps to a warm turbo auth context, and
 * 2. `cacheService.getSync` has a body (plain string/bytes or rich entry with
 *    optional pre-compressed buffers per algorithm).
 *
 * ### Features:
 * - Session-scoped turbo auth cache (TTL + LRU, max 1000 entries)
 * - Cookie precedence: `__Host-` → `__Secure-` → bare session name
 * - Pre-compressed cache hits (br/gzip/deflate/zstd) via `entry.compressed[algo]`
 * - Sync on-the-fly compression fallback (including zstd) via handle-compression
 * - Security headers applied on the turbo response (same as full pipeline)
 * - `__turboAuth` flag so auth/audit layers skip redundant session resolution
 *
 * Placed early in `hooks.server.ts` so hot GETs avoid full auth + handler work.
 */

import type { Handle } from "@sveltejs/kit";
import type { User, Role } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import { cacheService } from "@src/databases/cache/cache-service";
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

/** Rich cache entry shape: raw body + optional pre-compressed variants. */
interface TurboCacheRichEntry {
  body?: string | Uint8Array | null;
  compressed?: Partial<Record<CompressionAlgorithm, Uint8Array>>;
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
  "/api/media",
  "/api/widgets",
  "/api/roles",
  "/api/permission",
  "/api/automations",
  "/api/website-tokens",
];

/**
 * Store (or refresh) turbo auth context for a session.
 * Re-inserts existing keys for LRU order; evicts oldest when at capacity.
 */
export function setTurboAuthContext(
  sessionId: string,
  user: User,
  roles: Role[],
  bitset: Uint32Array,
  tenantId: DatabaseId | null,
): void {
  if (turboAuthCache.has(sessionId)) {
    // Re-insert to refresh LRU position
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

/**
 * Gets cached auth context with absolute-expiry check and LRU refresh.
 */
function getTurboAuthContext(sessionId: string): TurboAuthContext | null {
  const ctx = turboAuthCache.get(sessionId);
  if (!ctx) return null;

  if (Date.now() > ctx.expiresAt) {
    turboAuthCache.delete(sessionId);
    return null;
  }

  // LRU refresh: re-insert key to mark it most-recently used
  turboAuthCache.delete(sessionId);
  turboAuthCache.set(sessionId, ctx);
  return ctx;
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
  const flags = getRequestFlags(locals);

  if (flags.isStatic || flags.isBootstrap) return resolve(event);
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return resolve(event);
  if (!isCacheableApiPath(url.pathname)) return resolve(event);

  // Most restrictive cookie prefixes first — prevent token spoofing via bare name
  const sessionId =
    cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
    cookies.get(`__Secure-${SESSION_COOKIE_NAME}`) ||
    cookies.get(SESSION_COOKIE_NAME);

  if (!sessionId) return resolve(event);

  const turboCtx = getTurboAuthContext(sessionId);
  if (!turboCtx) return resolve(event);

  locals.user = turboCtx.user;
  locals.roles = turboCtx.roles;
  locals.tenantId = turboCtx.tenantId;
  (locals as { __turboAuth?: boolean }).__turboAuth = true;

  const cacheKey = url.pathname + url.search;
  const cachedResponse = cacheService.getSync<string | Uint8Array | TurboCacheRichEntry>(
    cacheKey,
    turboCtx.tenantId,
  );
  if (!cachedResponse) return resolve(event);

  // Cache HIT is intentionally silent at default info — use turbo pipeline debug logs when diagnosing

  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    "X-Cache": "TURBO-HIT",
    "Cache-Control": "private, must-revalidate",
    // Cookie in Vary: tenant/session-scoped payloads must not be shared across users
    Vary: "Accept-Encoding, Cookie",
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

  const entry = isRichEntry ? (cachedResponse as TurboCacheRichEntry) : null;
  const rawBody: string | Uint8Array | null = isRichEntry
    ? ((cachedResponse as TurboCacheRichEntry).body ?? null)
    : (cachedResponse as string | Uint8Array);

  let bodyToSend: BodyInit | Uint8Array | null = rawBody;

  if (rawBody) {
    const acceptEncoding = request.headers.get("Accept-Encoding") || "";
    const algo = negotiateEncoding(acceptEncoding, hasNativeCompression());

    const payloadSize =
      typeof rawBody === "string" ? Buffer.byteLength(rawBody, "utf-8") : rawBody.byteLength;

    if (algo && payloadSize > 1024) {
      try {
        // Fast-path 1: Use pre-compressed buffer from cache entry
        const preallocatedBytes = entry?.compressed?.[algo];

        if (preallocatedBytes) {
          bodyToSend = preallocatedBytes;
          setCompressionHeaders(responseHeaders, algo, payloadSize, preallocatedBytes.length);
        } else {
          // Fast-path 2: Sync dynamic compression fallback (including zstd)
          const compressed = compressSync(rawBody, algo as CompressionAlgorithm, payloadSize);

          if (compressed && compressed.length < payloadSize) {
            bodyToSend = compressed;
            setCompressionHeaders(responseHeaders, algo, payloadSize, compressed.length);
          }
        }
      } catch {
        /* fall back to raw uncompressed body */
      }
    }
  }

  return new Response(method === "HEAD" ? null : (bodyToSend as BodyInit), {
    status: 200,
    headers: responseHeaders,
  });
};
