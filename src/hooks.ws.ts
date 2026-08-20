/**
 * @file src/hooks.ws.ts
 * @description
 * WebSocket hooks with strong typing and security hardening.
 *
 * Responsibilities include:
 * - Parsing and validating WebSocket upgrade requests.
 * - Normalizing request URLs from varying contexts.
 * - Performing session resolution and tenant checks.
 *
 * ### Features:
 * - Shared session resolution (same pipeline as HTTP: mem LRU → store → Redis → DB)
 * - Test-mode authentication bypass
 * - Tenant isolation verification
 * - Active-connection tracking for graceful shutdown (1001 Going Away)
 */

import { SESSION_COOKIE_NAME, isSecureCookieContext } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import { getDbInitPromise } from "@src/databases/db";
import { getTenantIdFromHostname, isMultiTenantEnabled } from "@utils/tenant";
import { getPrivateSettingSync, loadSettingsCache } from "@src/services/core/settings-service";
import { parseCookies } from "@utils/cookie-utils";
import { resolveSessionForWebSocket } from "@src/hooks/handle-authentication";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/content/types";

/**
 * Minimal socket surface used for connection tracking + close frames.
 * Structural typing keeps this adapter-agnostic (works with uWS-style
 * `end(code, reason)` / `close()` sockets).
 */
interface WsSocket {
  close?: () => void;
  end?: (code?: number, reason?: string) => void;
}

// ==================== CONNECTION TRACKING ====================
// Active WebSocket connections are tracked for graceful shutdown: on SIGTERM /
// SIGINT the server sends a `1001 Going Away` close frame so clients can
// reconnect cleanly instead of hanging until the adapter force-kicks them.
const activeConnections = new Set<WsSocket>();

export function open(ws: WsSocket) {
  activeConnections.add(ws);
}

export function close(ws: WsSocket) {
  activeConnections.delete(ws);
}

/**
 * Gracefully close every tracked WebSocket connection.
 * Uses `end(1001, ...)` (Going Away) so clients can auto-reconnect.
 * Falls back to `close()` for sockets that only expose the immediate variant.
 */
export function closeAllConnections(code = 1001, reason = "Server shutting down") {
  const count = activeConnections.size;
  if (count === 0) return 0;
  for (const ws of activeConnections) {
    try {
      (ws as { end?: (c?: number, r?: string) => void }).end?.(code, reason);
      ws.close?.();
    } catch {
      /* socket may already be closing — best effort */
    }
  }
  activeConnections.clear();
  return count;
}

/** Number of currently tracked WebSocket connections (for health/telemetry). */
export function getActiveWsConnections(): number {
  return activeConnections.size;
}

// ==================== TYPES ====================
export interface WsUpgradeContext {
  url?: URL | string | { href?: string; pathname?: string; hostname?: string };
  cookies?: { get(name: string): string | undefined };
  request?: Request;
  headers?: Headers | Record<string, string | string[] | undefined>;
  req?: { headers?: Record<string, string | string[] | undefined> };
}

interface WsAuthResult {
  profile: User;
  tenantId: string;
  connectedAt: number;
}

// ==================== HELPERS ====================

/** Safely extracts URL from various SvelteKit / adapter contexts */
function normalizeUrl(ctx: WsUpgradeContext): URL {
  try {
    // Direct URL
    if (ctx.url instanceof URL) return ctx.url;

    let raw = "/";
    if (typeof ctx.url === "string") {
      raw = ctx.url;
    } else if (ctx.url && typeof ctx.url === "object") {
      raw = (ctx.url as any).href ?? (ctx.url as any).pathname ?? "/";
    } else {
      raw = ctx.request?.url ?? (ctx.req as any)?.url ?? "/";
    }

    if (raw.includes("://")) return new URL(raw);

    // Reconstruct
    const host =
      ctx.request?.headers?.get("host") ??
      (ctx.headers as any)?.host ??
      (ctx.headers as any)?.Host ??
      (ctx.req?.headers as any)?.host ??
      (ctx.req?.headers as any)?.Host ??
      "localhost";

    const proto =
      ctx.request?.headers?.get("x-forwarded-proto") ??
      (ctx.headers as any)?.["x-forwarded-proto"] ??
      (ctx.req?.headers as any)?.["x-forwarded-proto"] ??
      "http";

    return new URL(`${proto}://${host}${raw.startsWith("/") ? raw : `/${raw}`}`);
  } catch (err) {
    logger.warn("[WS Upgrade] URL normalization failed, using fallback", err);
    return new URL("http://localhost");
  }
}

/** Robust header getter that works across contexts */
function getHeader(ctx: WsUpgradeContext, name: string): string {
  const lower = name.toLowerCase();

  // Request object (preferred)
  if (ctx.request?.headers?.get) {
    return ctx.request.headers.get(lower) || "";
  }

  const headers = ctx.headers || (ctx.req as any)?.headers || {};
  return (
    (headers as Record<string, string>)[lower] ?? (headers as Record<string, string>)[name] ?? ""
  );
}

// ==================== MAIN UPGRADE HOOK ====================

export async function upgrade(ctx: WsUpgradeContext): Promise<WsAuthResult | false> {
  const start = Date.now();

  try {
    const url = normalizeUrl(ctx);

    // Ensure DB + settings are ready
    await Promise.all([
      getDbInitPromise(false, "CORE"),
      loadSettingsCache("global").catch((e) => logger.error("Settings cache load failed", e)),
    ]);

    const cookieHeader = getHeader(ctx, "cookie");
    const testSecret = getHeader(ctx, "x-test-secret") || url.searchParams.get("secret");
    const tenantIdHeader = getHeader(ctx, "x-tenant-id");

    // Cookie name handling (secure prefix)
    const isSecure = isSecureCookieContext(url.protocol, url.hostname);
    const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

    // Extract session ID
    let sessionId: string | null = null;
    if (typeof ctx.cookies?.get === "function") {
      sessionId = ctx.cookies.get(cookieName) || ctx.cookies.get(SESSION_COOKIE_NAME) || null;
    } else if (cookieHeader) {
      const parsed = parseCookies(cookieHeader);
      sessionId = parsed[cookieName] || parsed[SESSION_COOKIE_NAME] || null;
    }

    // ==================== TEST MODE BYPASS ====================
    const isTestMode = process.env.TEST_MODE === "true";
    const actualTestSecret =
      getPrivateSettingSync("TEST_API_SECRET") || process.env.TEST_API_SECRET;

    const isAuthorizedTest = Boolean(isTestMode && testSecret && testSecret === actualTestSecret);

    // ==================== SESSION RESOLUTION ====================
    // Shared pipeline with HTTP auth (handle-authentication): mem LRU →
    // session store → Redis → DB, with negative cache, idle window,
    // blocked-user cutoff and single-flight coalescing.
    const isMultiTenant = isMultiTenantEnabled();
    const hostTenant = isMultiTenant ? getTenantIdFromHostname(url.hostname, true) : null;
    let profile: User | null = null;
    let tenantId: string | null = tenantIdHeader || hostTenant;

    if (sessionId) {
      const resolved = await resolveSessionForWebSocket(sessionId, {
        tenantId: tenantId as DatabaseId,
        clientIp: getHeader(ctx, "x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: getHeader(ctx, "user-agent") || null,
      });
      if (resolved.ok) {
        profile = resolved.user;
        tenantId = resolved.tenantId ?? tenantId;
      }
    }

    // ==================== TEST MODE OVERRIDE ====================
    if (isAuthorizedTest) {
      profile ??= {
        _id: "system",
        role: "admin",
        isAdmin: true,
        username: "System",
      } as User;

      tenantId = tenantIdHeader || url.searchParams.get("tenantId") || tenantId || "default";
    }

    // ==================== WEBSOCKET RATE LIMITING ====================
    const clientIp = getHeader(ctx, "x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const wsRateLimitPrefix =
      process.env.RATE_LIMITER_WEBSOCKETS_REDIS_PREFIX || "svelty:ws:ratelimit:";
    const rawMax =
      process.env.RATE_LIMITER_WEBSOCKETS_MAX_CONNECTIONS ||
      (getPrivateSettingSync as any)("RATE_LIMITER_WEBSOCKETS_MAX_CONNECTIONS") ||
      "100";
    const maxConnsPerIp = parseInt(String(rawMax), 10);

    if (!isAuthorizedTest && clientIp !== "127.0.0.1" && clientIp !== "localhost") {
      const activeFromIp = Array.from(activeConnections).filter(
        (ws) => (ws as any).clientIp === clientIp,
      ).length;
      if (activeFromIp >= maxConnsPerIp) {
        logger.warn(
          `[WS Upgrade] Rate limit exceeded for IP: ${clientIp} (${activeFromIp}/${maxConnsPerIp}) [prefix: ${wsRateLimitPrefix}]`,
        );
        return false;
      }
    }

    // Final security checks
    if (!profile) {
      logger.info(`[WS Upgrade] Rejected - No profile (session: ${!!sessionId})`);
      return false;
    }

    if (isMultiTenant && profile.tenantId && tenantId && profile.tenantId !== tenantId) {
      logger.warn(`[WS Upgrade] Tenant mismatch rejected`, {
        userTenant: profile.tenantId,
        hostTenant: tenantId,
      });
      return false;
    }

    logger.info(`[WS Upgrade] Successful handshake in ${Date.now() - start}ms`, {
      tenantId,
      userId: profile._id,
      isTest: isAuthorizedTest,
    });

    return {
      profile,
      tenantId: tenantId || "default",
      connectedAt: Date.now(),
    };
  } catch (err) {
    logger.error("[WS Upgrade] Unexpected error during handshake", err);
    return false;
  }
}
