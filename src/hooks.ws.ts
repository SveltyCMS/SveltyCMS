/**
 * @file src/hooks.ws.ts
 * @description Enhanced WebSocket hooks for svelte-realtime with strong typing and security hardening.
 */

import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import { getDbInitPromise, dbAdapter } from "@src/databases/db";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { parseCookies } from "@utils/http/cookie-utils";
import { LRUCache } from "lru-cache";
import type { User } from "@src/databases/auth/types";

// Re-export the message hook from svelte-realtime
export { message } from "svelte-realtime/server";

// Strongly typed platform reference
export let globalPlatform: App.Platform | null = null;

/**
 * 🛰️ WebSocket Initialization
 * Captures the platform object for global event broadcasting.
 */
export function init({ platform }: { platform: App.Platform }) {
  globalPlatform = platform;
}

/**
 * 🛡️ Session Validation Cache
 * Prevents database thrashing during high-frequency reconnection storms.
 * Max 500 entries with a short 30s TTL.
 */
const handshakeCache = new LRUCache<string, { profile: User; tenantId: string | null }>({
  max: 500,
  ttl: 1000 * 30,
});

/**
 * Interface representing the WebSocket upgrade context.
 * Normalizes differences between Vite dev mode and production adapters.
 */
export interface WsUpgradeContext {
  url?: URL | { href: string; pathname: string; hostname: string; protocol: string };
  cookies?: { get(name: string): string | undefined };
  request?: Request;
  headers?: Record<string, string>;
  req?: { headers?: Record<string, string> };
}

/**
 * 🚀 WebSocket Upgrade Hook
 * Performs authentication, tenant identification, and security gating.
 */
export async function upgrade(ctx: WsUpgradeContext) {
  try {
    // 1. Safe URL normalization
    let url: URL;
    try {
      const u = ctx.url;
      if (u instanceof URL) {
        url = u;
      } else {
        const urlStr =
          (u as any)?.href ||
          ctx.request?.url ||
          `http://${(ctx.headers as any)?.host || "localhost"}${(u as any)?.pathname || "/"}`;
        url = new URL(urlStr);
      }
    } catch {
      url = new URL("http://localhost");
    }

    // 2. Database readiness check
    await getDbInitPromise(false, "CORE");

    // 3. Robust header extraction
    const getHeader = (name: string): string => {
      const lower = name.toLowerCase();
      if (typeof ctx.request?.headers?.get === "function")
        return ctx.request.headers.get(lower) || "";
      const h = ctx.headers || ctx.req?.headers || {};
      return (h as Record<string, string>)[lower] || (h as Record<string, string>)[name] || "";
    };

    const cookieHeader = getHeader("cookie");
    const testSecretHeader = getHeader("x-test-secret");
    const tenantIdHeader = getHeader("x-tenant-id");

    // 4. Identity & Tenant Extraction
    const isSecure = url.protocol === "https:" || url.hostname !== "localhost";
    const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

    let sessionId: string | null = null;
    if (typeof ctx.cookies?.get === "function") {
      sessionId = ctx.cookies.get(cookieName) || ctx.cookies.get(SESSION_COOKIE_NAME) || null;
    } else if (cookieHeader) {
      const parsed = parseCookies(cookieHeader);
      sessionId = parsed[cookieName] || parsed[SESSION_COOKIE_NAME] || null;
    }

    // 5. Auth Bypasses (Strictly gated)
    const testSecret = testSecretHeader || url.searchParams.get("secret");
    const actualSecret = getPrivateSettingSync("TEST_API_SECRET");
    const isAuthorizedTest =
      process.env.TEST_MODE === "true" && testSecret === actualSecret && actualSecret;

    // 6. Resolve Session & Profile
    let profile: User | null = null;
    let tenantId: string | null = null;

    if (sessionId && dbAdapter) {
      // Check cache first
      const cached = handshakeCache.get(sessionId);
      if (cached) {
        profile = cached.profile;
        tenantId = cached.tenantId;
      } else {
        const result = await dbAdapter.auth.validateSession(sessionId as any, {
          suppressErrorLog: true,
        });
        if (result?.success && result.data) {
          profile = result.data;
          tenantId = profile.tenantId || null;
          handshakeCache.set(sessionId, { profile, tenantId });
        }
      }
    }

    // 7. Apply Tenant Logic
    const multiTenant = getPrivateSettingSync("MULTI_TENANT") === true;
    if (multiTenant && !tenantId) {
      tenantId = getTenantIdFromHostname(url.hostname, true);
    }

    // 8. Security Finalization
    if (isAuthorizedTest) {
      profile =
        profile || ({ _id: "system", role: "admin", isAdmin: true, username: "System" } as any);
      // Only allow tenant override in authorized test mode
      tenantId = tenantIdHeader || url.searchParams.get("tenantId") || tenantId || "default";
    }

    // Reject unauthenticated connections in production
    if (!profile) return false;

    // Tenant Isolation Enforcement
    if (multiTenant && profile.tenantId && tenantId && profile.tenantId !== tenantId) {
      logger.warn(
        `[WS Upgrade] Security: Tenant mismatch rejected. user=${profile.tenantId}, host=${tenantId}`,
      );
      return false;
    }

    return {
      profile,
      tenantId: tenantId || "default",
      sessionId,
      connectedAt: Date.now(),
    };
  } catch (err) {
    logger.error("[WS Upgrade] Handshake failure:", err);
    return false;
  }
}
