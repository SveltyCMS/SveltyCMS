/**
 * @file src/hooks.ws.ts
 * @description WebSocket hooks for svelte-realtime.
 * Handles connection upgrades, authentication, and context assignment for WebSockets.
 */

import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import { getDbInitPromise, dbAdapter } from "@src/databases/db";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

export { message } from "svelte-realtime/server";

export let globalPlatform: any = null;

export function init({ platform }: any) {
  globalPlatform = platform;
}

/**
 * 🚀 WebSocket Upgrade Hook
 * Validates the connection and attaches session/tenant data to the WebSocket context.
 */
export async function upgrade(ctx: any) {
  try {
    // Determine URL safely based on the context format
    let urlStr = "http://localhost";
    if (ctx.url && typeof ctx.url === "object" && ctx.url.href) {
      urlStr = ctx.url.href;
    } else if (ctx.request && ctx.request.url) {
      urlStr = ctx.request.url;
    }
    const url = new URL(urlStr);

    // 1. Ensure DB is ready
    await getDbInitPromise(false, "CORE");

    // 2. Identify Tenant
    const multiTenant = getPrivateSettingSync("MULTI_TENANT") === true;
    let tenantId = null;
    if (multiTenant) {
      tenantId = getTenantIdFromHostname(url.hostname, true);
    }

    // 3. Authenticate User
    const isSecure = url.protocol === "https:" || url.hostname !== "localhost";
    const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

    // Safely parse headers depending on the provided context (uWS specific format handling)
    let cookieHeader = "";
    let testSecretHeader = "";
    let tenantIdHeader = "";

    // svelte-adapter-uws often provides headers as a raw object directly or via req
    const headersObj = ctx.headers || (ctx.req && ctx.req.headers) || {};

    if (headersObj && typeof headersObj === "object") {
      cookieHeader = headersObj["cookie"] || "";
      testSecretHeader = headersObj["x-test-secret"] || "";
      tenantIdHeader = headersObj["x-tenant-id"] || "";
    } else if (ctx.request && typeof ctx.request.headers?.get === "function") {
      cookieHeader = ctx.request.headers.get("cookie") || "";
      testSecretHeader = ctx.request.headers.get("x-test-secret") || "";
      tenantIdHeader = ctx.request.headers.get("x-tenant-id") || "";
    }

    let sessionId = null;

    // Check built-in SvelteKit cookies if available
    if (ctx.cookies && typeof ctx.cookies.get === "function") {
      sessionId = ctx.cookies.get(cookieName) || ctx.cookies.get(SESSION_COOKIE_NAME);
    } else if (cookieHeader) {
      const parsedCookies = Object.fromEntries(
        cookieHeader.split("; ").map((c: string) => {
          const splitIndex = c.indexOf("=");
          if (splitIndex === -1) return [c, ""];
          return [c.slice(0, splitIndex), decodeURIComponent(c.slice(splitIndex + 1))];
        }),
      );
      sessionId = parsedCookies[cookieName] || parsedCookies[SESSION_COOKIE_NAME];
    }

    let profile = null;
    if (sessionId && dbAdapter) {
      // Validate session via adapter
      const result = await dbAdapter.auth.validateSession(sessionId as any, {
        suppressErrorLog: true,
      });
      if (result?.success && result.data) {
        profile = result.data;

        // Tenant Isolation Check
        if (tenantId && profile.tenantId && profile.tenantId !== tenantId) {
          logger.warn(`[WS Upgrade] Tenant mismatch: local=${tenantId}, user=${profile.tenantId}`);
          return false; // Reject connection
        }
      }
    }

    // 4. Test Mode Bypass (for benchmarks and dev)
    const testSecret = testSecretHeader || url.searchParams.get("secret");
    const actualSecret = getPrivateSettingSync("TEST_API_SECRET");

    if (process.env.TEST_MODE === "true" && testSecret === actualSecret) {
      profile = profile || { _id: "system", role: "admin", isAdmin: true, username: "System" };
      tenantId = tenantId || tenantIdHeader || url.searchParams.get("tenantId") || "default";
    }

    // Reject unauthenticated connections for production safety
    if (!profile) return false;

    return {
      profile,
      tenantId,
      sessionId,
      connectedAt: Date.now(),
    };
  } catch (err) {
    logger.error("[WS Upgrade] Critical error during handshake:", err);
    return false;
  }
}
