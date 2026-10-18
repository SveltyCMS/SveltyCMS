/**
 * @file src/routes/api/[...path]/handlers/testing/testing-shared.ts
 * @description Shared response helpers, lazy module loaders, and request context for the
 * split testing handler modules.
 */

import { logger } from "@utils/logger";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
export function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

/** Cached lazy handle to the engine server — one module-registry lookup instead of one per call. */
let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
export function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

/** Cached lazy handle to the auth constants — one module-registry lookup instead of one per call. */
let authConstantsModulePromise: Promise<typeof import("@src/databases/auth/constants")> | undefined;
export function loadAuthConstantsModule(): Promise<typeof import("@src/databases/auth/constants")> {
  return (authConstantsModulePromise ??= import("@src/databases/auth/constants"));
}

/** Cached lazy handle to the turbo GET hook — one module-registry lookup instead of one per call. */
let handleTurboGetModulePromise: Promise<typeof import("@src/hooks/handle-turbo-get")> | undefined;
export function loadHandleTurboGetModule(): Promise<typeof import("@src/hooks/handle-turbo-get")> {
  return (handleTurboGetModulePromise ??= import("@src/hooks/handle-turbo-get"));
}

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
export function loadCacheServiceModule(): Promise<
  typeof import("@src/databases/cache/cache-service")
> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
export function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

export interface TestingContext {
  event: RequestEvent;
  cms: any;
  tenantId: DatabaseId;
  params: Record<string, any>;
  initializedAdapter: DatabaseAdapter;
  action: string | null | undefined;
}

/**
 * Standard testing response helper
 */
export function rawResponse(data: any, status = 200) {
  // codeql[js/stack-trace-exposure]: /api/testing is production-gated + stripped
  // from normal builds; only plain { success, message } envelopes are serialized here.
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Explicit Set-Cookie for session tokens.
 * Playwright APIRequestContext sometimes omits Set-Cookie from response.headers()
 * when cookies only flow through SvelteKit's cookies.set merge — dual-write so
 * E2E extractAndSaveSession / applySessionCookie can always see the header.
 */
function sessionCookieHeader(
  name: string,
  value: string,
  opts: { secure: boolean; sameSite: "Strict" | "Lax"; maxAge: number },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export async function setTestingSessionCookie(
  event: RequestEvent,
  sessionId: string,
): Promise<{ cookieName: string; isSecure: boolean; setCookieHeader: string }> {
  const { getSessionCookieName, isSecureCookieContext } = await loadAuthConstantsModule();
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const cookieName = getSessionCookieName(isSecure);
  const sameSite = isSecure ? "strict" : "lax";
  const maxAge = 60 * 60 * 24;
  event.cookies.set(cookieName, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite,
    secure: isSecure,
    maxAge,
  });
  return {
    cookieName,
    isSecure,
    setCookieHeader: sessionCookieHeader(cookieName, sessionId, {
      secure: isSecure,
      sameSite: isSecure ? "Strict" : "Lax",
      maxAge,
    }),
  };
}

/**
 * Invalidate all caches (setup, cache-service, auth, API spec, theme).
 */
export async function invalidateAllCaches(tenantId: DatabaseId) {
  const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
  invalidateSetupCache(false, null);

  try {
    const { cacheService } = await loadCacheServiceModule();
    await cacheService.invalidateAll();

    const { securityResponseService } = await import("@src/services/security/response-service");
    securityResponseService.reset();

    const { invalidateUserCountCache, invalidateRolesCache } =
      await import("@src/hooks/handle-authorization");
    await invalidateUserCountCache(tenantId);
    await invalidateRolesCache(tenantId);

    // The settings-service cache is a separate in-memory map — resets wipe the
    // DB rows but not this cache, so post-reset requests would keep serving
    // stale public settings (e.g. SITE_STARTER_ENABLED) until the next boot.
    const { invalidateSettingsCache } = await loadSettingsServiceModule();
    invalidateSettingsCache(tenantId);

    const { apiSpecService } = await import("@services/system/api-spec-service");
    await apiSpecService.invalidateCache(tenantId);

    const { ThemeManager } = await import("@src/databases/theme-manager");
    const themeManager = ThemeManager.getInstance();
    if (themeManager.isInitialized()) {
      await themeManager.refresh();
    }
  } catch (err) {
    logger.warn(`[TestingHandler] Non-fatal cache invalidation error: ${err}`);
  }
}

/**
 * Wipe the media folder and recreate it empty.
 */
export async function wipeMediaFolder() {
  const { getPublicSettingSync } = await loadSettingsServiceModule();
  const mediaRoot = getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder";
  const fullMediaRoot = path.resolve(process.cwd(), mediaRoot);
  if (fs.existsSync(fullMediaRoot)) {
    try {
      await fsp.rm(fullMediaRoot, { recursive: true, force: true });
      await fsp.mkdir(fullMediaRoot, { recursive: true });
    } catch (err) {
      logger.warn(`[TestingHandler] Failed to clear media folder: ${err}`);
    }
  }
}

/**
 * Reset system state stores and rate limit buckets.
 */
export async function resetSystemStores() {
  const { resetSystemState, setSystemState } = await import("@src/stores/system/state.svelte.ts");
  resetSystemState();
  setSystemState("READY", "Test reset completed");
  const { resetInitializationState } = await import("@src/hooks/handle-system-state");
  resetInitializationState();
  try {
    const { resetRateLimitBuckets } = await import("@src/hooks/handle-rate-limit");
    resetRateLimitBuckets();
  } catch (err) {
    logger.warn(`[TestingHandler] Failed to reset rate limit buckets: ${err}`);
  }
}
