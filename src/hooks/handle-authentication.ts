/**
 * @file src/hooks/handle-authentication.ts
 * @description Enterprise-grade authentication middleware with session validation, rotation, and multi-tenancy.
 *
 * @summary This hook runs after handleSystemState and handleSetup confirm the system is ready. It provides:
 * - **Session Management**: Validates session cookies with 3-layer caching (in-memory → Redis → database)
 * - **Security Token Rotation**: Automatic token rotation for active sessions (prevents session hijacking)
 * - **Multi-tenancy**: Hostname-based tenant identification with strict isolation
 * - **Memory Optimization**: WeakRef-based cache with automatic garbage collection
 * - **Rate Limiting**: Session rotation rate limits to prevent abuse
 * - **Metrics Integration**: Comprehensive tracking viametrics-service *
 *
 * ### Features
 * - Session rotation every 60 minutes for active users (optimized)
 * - WeakRef cache with LRU eviction (top 100 hot sessions)
 * - Tenant isolation enforcement (prevents cross-tenant access)
 * - Rate-limited refresh attempts (100/min per IP)
 * - Automatic cleanup of expired sessions
 * - Zero-downtime session validation
 *
 * @prerequisite handleSystemState and handleSetup have already confirmed readiness
 */

import type { ISODateString } from "@databases/db-interface";
import { generateCsrfToken } from "@utils/security/csrf-utils";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import type { User } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import { cacheService, SESSION_CACHE_TTL_MS } from "@src/databases/cache/cache-service";
import { auth, dbAdapter } from "@src/databases/db";
import { metricsService } from "@src/services/metrics-service";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { RateLimiter } from "sveltekit-rate-limiter/server";
import { isStaticOrInternalRequest, isPublicRoute } from "@utils/hook-utils";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { getTenantIdFromHostname } from "@utils/tenant-utils";
import { dev } from "$app/environment";

// --- MODULE-LEVEL CACHES & STATE ---
let multiTenantCached: boolean | null = null;
let demoModeCached: boolean | null = null;
let rotationRateLimiter: RateLimiter | null = null;

function getCachedSettings() {
  if (multiTenantCached === null) multiTenantCached = !!getPrivateSettingSync("MULTI_TENANT");
  if (demoModeCached === null) demoModeCached = !!getPrivateSettingSync("DEMO");
  return { multiTenant: multiTenantCached, isDemoMode: demoModeCached };
}

/**
 * Lazy initialization for the rotation rate limiter.
 * This runs only once per server lifecycle when the first protected request arrives.
 */
function initRotationRateLimiter() {
  if (rotationRateLimiter) return rotationRateLimiter;
  rotationRateLimiter = new RateLimiter({
    IP: [100, "m"],
    cookie: {
      name: "session_rotation_limit",
      secret: getPrivateSettingSync("JWT_SECRET_KEY") || "fallback-dev-secret",
      rate: [100, "m"],
      preflight: true,
    },
  });
  return rotationRateLimiter;
}

// --- IN-MEMORY SESSION CACHE WITH WEAKREF-BASED CLEANUP ---

interface SessionCacheEntry {
  timestamp: number;
  user: User;
}

const sessionCache = new Map<string, WeakRef<SessionCacheEntry>>();
const sessionCacheRegistry = new FinalizationRegistry<string>((sessionId) => {
  sessionCache.delete(sessionId);
});

const MAX_STRONG_REFS = 100;
const strongRefs = new Map<string, SessionCacheEntry>();
const lastRefreshAttempt = new Map<string, number>();
const lastRotationAttempt = new Map<string, number>();

/**
 * Session rotation interval: 60 minutes
 * Balances security (regular token refresh) with reduced database write impact.
 */
const SESSION_ROTATION_INTERVAL_MS = 60 * 60 * 1000;

const pendingDemoTenants = new Map<string, string>();

/**
 * Gets a session from the cache, handling WeakRef dereferencing.
 */
function getSessionFromCache(sessionId: string): SessionCacheEntry | null {
  const now = Date.now();
  const strongRef = strongRefs.get(sessionId);
  if (strongRef && now - strongRef.timestamp < SESSION_CACHE_TTL_MS) {
    return strongRef;
  }
  const weakRef = sessionCache.get(sessionId);
  if (weakRef) {
    const entry = weakRef.deref();
    if (entry && now - entry.timestamp < SESSION_CACHE_TTL_MS) {
      addToStrongRefs(sessionId, entry);
      return entry;
    }
  }
  return null;
}

/**
 * Sets a session in the cache with WeakRef.
 */
function setSessionInCache(sessionId: string, entry: SessionCacheEntry): void {
  addToStrongRefs(sessionId, entry);
  const weakRef = new WeakRef(entry);
  sessionCache.set(sessionId, weakRef);
  sessionCacheRegistry.register(entry, sessionId);
}

/**
 * Adds/updates a session in the strong reference LRU cache.
 */
function addToStrongRefs(sessionId: string, entry: SessionCacheEntry): void {
  if (strongRefs.has(sessionId)) strongRefs.delete(sessionId);
  strongRefs.set(sessionId, entry);
  if (strongRefs.size > MAX_STRONG_REFS) {
    const firstKey = strongRefs.keys().next().value;
    if (firstKey) strongRefs.delete(firstKey);
  }
}

// Periodic cleanup
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [sessionId, data] of strongRefs.entries()) {
        if (now - data.timestamp > SESSION_CACHE_TTL_MS) strongRefs.delete(sessionId);
      }
      for (const [sessionId, timestamp] of lastRefreshAttempt.entries()) {
        if (now - timestamp > 300_000) lastRefreshAttempt.delete(sessionId);
      }
      for (const [sessionId, timestamp] of lastRotationAttempt.entries()) {
        if (now - timestamp > SESSION_ROTATION_INTERVAL_MS * 2)
          lastRotationAttempt.delete(sessionId);
      }
    },
    5 * 60 * 1000,
  );
}

// --- UTILITY FUNCTIONS ---

/** Multi-layer user session retrieval (in-memory → distributed → DB) */
async function getUserFromSession(
  sessionId: string,
  tenantId?: DatabaseId | null,
): Promise<User | null> {
  const now = Date.now();
  const memCached = getSessionFromCache(sessionId);
  if (memCached) return memCached.user;

  try {
    const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
    const redisCached = await cacheService.get<SessionCacheEntry>(cacheKey, tenantId ?? undefined);
    if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
      setSessionInCache(sessionId, redisCached);
      return redisCached.user;
    }
  } catch (err) {
    logger.warn(`Redis session read failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const lastAttempt = lastRefreshAttempt.get(sessionId);
  if (lastAttempt && now - lastAttempt < 60_000) return null;
  lastRefreshAttempt.set(sessionId, now);

  if (!auth) return null;

  try {
    const user = await auth.validateSession(sessionId as DatabaseId);
    if (user) {
      const sessionData: SessionCacheEntry = { user, timestamp: now };
      setSessionInCache(sessionId, sessionData);
      const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
      await cacheService
        .set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId as DatabaseId)
        .catch((err: any) => logger.warn(`Session cache set failed: ${err.message}`));
      return user;
    }
  } catch (err) {
    logger.error(`Session validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}

/**
 * Handles automatic session rotation for security.
 */
async function handleSessionRotation(
  event: RequestEvent,
  user: User,
  oldSessionId: string,
): Promise<void> {
  const now = Date.now();
  const lastRotation = lastRotationAttempt.get(oldSessionId);
  if (lastRotation && now - lastRotation < SESSION_ROTATION_INTERVAL_MS) return;

  const limiter = initRotationRateLimiter();
  if (await limiter.isLimited(event)) return;

  try {
    if (!(auth?.createSession && auth?.destroySession)) return;

    const newSession = await auth.createSession({
      user_id: user._id as DatabaseId,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() as ISODateString,
      tenantId: event.locals.tenantId as DatabaseId,
    });

    if (newSession && newSession._id !== oldSessionId) {
      const newSessionId = newSession._id;
      const isProd = !dev && process.env.TEST_MODE !== "true";
      const isSecure =
        event.url.protocol === "https:" || (event.url.hostname !== "localhost" && isProd);
      const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

      event.cookies.set(cookieName, newSessionId, {
        path: "/",
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "strict" : "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
      generateCsrfToken(event.cookies, isSecure);

      await auth.destroySession(oldSessionId as DatabaseId).catch(() => {});
      invalidateSessionCache(oldSessionId, event.locals.tenantId as DatabaseId);
      setSessionInCache(newSessionId, { user, timestamp: now });
      lastRotationAttempt.set(newSessionId, now);
      event.locals.session_id = newSessionId;
    }
  } catch (err) {
    logger.error(`Session rotation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Handles automatic demo tenant generation and seeding.
 */
async function handleDemoTenantAssignment(event: RequestEvent, isUserPresent: boolean) {
  const { cookies, url, locals } = event;
  const tenantIdFromCookie = cookies.get("demo_tenant_id") || null;

  if (tenantIdFromCookie) {
    locals.tenantId = tenantIdFromCookie as DatabaseId;
    return;
  }

  if (cookies.get(SESSION_COOKIE_NAME) && !isUserPresent) return;

  const sessionKey = url.hostname;
  const existing = pendingDemoTenants.get(sessionKey);
  let tenantId: string;

  if (existing) {
    tenantId = existing;
  } else {
    tenantId = crypto.randomUUID();
    pendingDemoTenants.set(sessionKey, tenantId);
    setTimeout(() => pendingDemoTenants.delete(sessionKey), 10_000);

    try {
      const { seedDemoTenant } = await import("@src/routes/setup/seed");
      await seedDemoTenant(dbAdapter!, tenantId);
    } catch (e) {
      logger.error(`Failed to seed demo tenant ${tenantId}:`, e);
    }
  }

  cookies.set("demo_tenant_id", tenantId, {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 3600,
  });
  locals.tenantId = tenantId as DatabaseId;
}

// --- MAIN HOOK ---

export const handleAuthentication: Handle = async ({ event, resolve }) => {
  const { locals, url, cookies } = event;
  const pathname = url.pathname;

  if (isStaticOrInternalRequest(pathname)) return resolve(event);
  if (isPublicRoute(pathname, process.env.TEST_MODE === "true")) return resolve(event);

  try {
    locals.dbAdapter = dbAdapter;
    if (!dbAdapter) return await resolve(event);

    const { multiTenant, isDemoMode } = getCachedSettings();

    if (multiTenant) {
      if (isDemoMode) {
        await handleDemoTenantAssignment(event, false);
      } else {
        locals.tenantId = getTenantIdFromHostname(url.hostname, true) as DatabaseId;
      }

      const workerIndex = event.request.headers.get("x-test-worker-index");
      if (process.env.TEST_MODE === "true" && workerIndex) {
        locals.tenantId = `test-worker-${workerIndex}` as DatabaseId;
      }
    }

    const isProd = !dev && process.env.TEST_MODE !== "true";
    const isSecure = url.protocol === "https:" || (url.hostname !== "localhost" && isProd);
    const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

    const sessionId = cookies.get(cookieName) || cookies.get(SESSION_COOKIE_NAME);
    if (sessionId) {
      metricsService.incrementAuthValidations();
      if (!auth) return await resolve(event);

      const user = await getUserFromSession(sessionId as string, locals.tenantId as DatabaseId);

      if (isDemoMode && !locals.tenantId && !user) {
        await handleDemoTenantAssignment(event, !!user);
        generateCsrfToken(cookies, isSecure);
      }

      if (user) {
        // --- NEW: Global Admin Exemption ---
        // Global admins (no tenantId) are authorized to access any tenant path.
        const isGlobalAdmin = !user.tenantId || user.tenantId === null;
        if (
          locals.tenantId &&
          !isGlobalAdmin &&
          user.tenantId &&
          user.tenantId !== locals.tenantId
        ) {
          metricsService.incrementAuthFailures();
          cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
          throw new AppError("Tenant isolation violation", 403, "FORBIDDEN_TENANT");
        }
        locals.user = user;
        locals.session_id = sessionId as DatabaseId;
        locals.permissions = user.permissions || [];
        await handleSessionRotation(event, user, sessionId);
      } else {
        metricsService.incrementAuthFailures();
        cookies.delete(cookieName, { path: "/" });
      }
    }

    return await resolve(event);
  } catch (err) {
    if (url.pathname.startsWith("/api/")) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};

// --- UTILITY EXPORTS ---

export function invalidateSessionCache(sessionId: string, tenantId?: DatabaseId | null): void {
  sessionCache.delete(sessionId);
  strongRefs.delete(sessionId);
  lastRefreshAttempt.delete(sessionId);
  lastRotationAttempt.delete(sessionId);

  const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
  cacheService.delete(cacheKey, tenantId ?? undefined).catch(() => {});
}

export function clearSessionRefreshAttempt(sessionId: string): void {
  lastRefreshAttempt.delete(sessionId);
}

export function forceSessionRotation(sessionId: string): void {
  lastRotationAttempt.delete(sessionId);
}

export function clearAllSessionCaches(): void {
  sessionCache.clear();
  strongRefs.clear();
  lastRefreshAttempt.clear();
  lastRotationAttempt.clear();
}

export function getSessionCacheStats() {
  return {
    weakRefs: sessionCache.size,
    strongRefs: strongRefs.size,
    pendingRefreshes: lastRefreshAttempt.size,
    pendingRotations: lastRotationAttempt.size,
    maxStrongRefs: MAX_STRONG_REFS,
  };
}
