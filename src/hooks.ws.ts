/**
 * @file src/hooks.ws.ts
 * @description
 * Enhanced WebSocket hooks for svelte-realtime with strong typing and security hardening.
 *
 * Responsibilities include:
 * - Parsing and validating WebSocket upgrade requests.
 * - Normalizing request URLs from varying contexts.
 * - Performing session resolution and tenant checks.
 *
 * ### Features:
 * - Session caching using LRU cache
 * - Test-mode authentication bypass
 * - Tenant isolation verification
 */

import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import { getDbInitPromise, dbAdapter } from "@src/databases/db";
import { getTenantIdFromHostname, isMultiTenantEnabled } from "@utils/tenant";
import { getPrivateSettingSync, loadSettingsCache } from "@src/services/core/settings-service";
import { parseCookies } from "@utils/cookie-utils";
import { LRUCache } from "lru-cache";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/content/types";

// Re-export the message hook
export { message } from "svelte-realtime/server";

// 🚀 Platform reference lives in src/lib/ws-platform.ts (extracted here
// to avoid SvelteKit's "unknown export" warning on non-hook exports).
// Import directly: import { getGlobalPlatform } from "@src/live/ws-platform";
import { initWsPlatform } from "@src/live/ws-platform";

/** Initialize platform for global broadcasting */
export function init({ platform }: { platform: App.Platform }) {
  initWsPlatform(platform);
}

// ==================== CACHE ====================
const handshakeCache = new LRUCache<string, { profile: User; tenantId: string | null }>({
  max: 500,
  ttl: 1000 * 30, // 30 seconds
});

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
    const { isSecureCookieContext } = await import("@src/databases/auth/constants");
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
    let profile: User | null = null;
    let tenantId: string | null = null;

    if (sessionId && dbAdapter) {
      const cached = handshakeCache.get(sessionId);
      if (cached) {
        profile = cached.profile;
        tenantId = cached.tenantId;
      } else {
        const result = await dbAdapter.auth.validateSession(sessionId as DatabaseId, {
          suppressErrorLog: true,
        });

        if (result?.success && result.data) {
          profile = result.data;
          tenantId = profile.tenantId || null;
          handshakeCache.set(sessionId, { profile, tenantId });
        }
      }
    }

    // Multi-tenant fallback
    const isMultiTenant = isMultiTenantEnabled();
    if (isMultiTenant && !tenantId) {
      tenantId = getTenantIdFromHostname(url.hostname, true);
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
