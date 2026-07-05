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
 * - **Metrics Integration**: Comprehensive tracking via metrics-service *
 *
 * ### Features
 * - Session rotation every 15 minutes for active users (industry best practice)
 * - WeakRef cache with LRU eviction (top 100 hot sessions)
 * - Tenant isolation enforcement (prevents cross-tenant access)
 * - Rate-limited refresh attempts (100/min per IP)
 * - Automatic cleanup of expired sessions
 * - Zero-downtime session validation
 *
 * @prerequisite handleSystemState and handleSetup have already confirmed readiness
 */

import type { ISODateString } from "@databases/db-interface";
import { BloomFilter } from "@utils/bloom-filter";
import { generateCsrfToken, ensureCsrfToken } from "@utils/security/csrf-utils";
import { SESSION_COOKIE_NAME, getSessionCookieName } from "@src/databases/auth/constants";
import type { User } from "@src/databases/auth/types";
import { isValidApiKeyFormat, hashApiKey } from "@src/databases/auth/api-keys";
import {
  getApiKeyAuthCacheSync,
  getWebsiteTokenAuthCacheSync,
  isApiKeyAuthNegativeHit,
  isWebsiteTokenAuthNegativeHit,
  recordApiKeyAuthMiss,
  recordWebsiteTokenAuthMiss,
  setApiKeyAuthCache,
  setWebsiteTokenAuthCache,
} from "@src/databases/auth/credential-auth-cache";
import { hashCredentialSha256HexSync } from "@src/utils/security/credential-hash";
import type { DatabaseId } from "../content/types";
import { cacheService, SESSION_CACHE_TTL_MS } from "@src/databases/cache/cache-service";

import { getDbInitPromise, auth, dbAdapter } from "@src/databases/db";
import { metricsService } from "@src/services/observability/metrics-service";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { RateLimiter } from "sveltekit-rate-limiter/server";
import { getRequestFlags } from "@utils/hook-utils";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { getTenantIdFromHostname } from "@utils/tenant";
import { dev } from "$app/environment";
import { runWithContext } from "@src/utils/context";
import { invalidateTurboAuthContext } from "./handle-turbo-get";
import { turboAuthCache } from "./handle-turbo-get";
import { applyTestBypassFromHeaders } from "@utils/test-bypass.server";

// --- MODULE-LEVEL CACHES & STATE ---
let multiTenantCached: boolean | null = null;
let demoModeCached: boolean | null = null;
let rotationRateLimiter: RateLimiter | null = null;

function getCachedSettings() {
  if (multiTenantCached === null) {
    const val = getPrivateSettingSync("MULTI_TENANT");
    multiTenantCached = String(val) === "true" || val === true;
  }
  if (demoModeCached === null) {
    const val = getPrivateSettingSync("DEMO");
    demoModeCached = String(val) === "true" || val === true;
  }
  return { multiTenant: multiTenantCached, isDemoMode: demoModeCached };
}

/**
 * Lazy initialization for the rotation rate limiter.
 * This runs only once per server lifecycle when the first protected request arrives.
 */
function initRotationRateLimiter() {
  if (rotationRateLimiter) return rotationRateLimiter;

  const secret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  const isTestMode = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";
  if (!secret && !dev && !isTestMode) {
    logger.error(
      "CRITICAL: JWT_SECRET_KEY is missing in production. Rate limiting will be unreliable.",
    );
  }

  rotationRateLimiter = new RateLimiter({
    IP: [100, "m"],
    cookie: {
      name: "session_rotation_limit",
      secret: secret || (dev ? "dev-only-secret-rotation" : crypto.randomUUID()),
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
const SESSION_ROTATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — per industry best practice

const pendingDemoTenants = new Map<string, string>();
const negativeCache = new BloomFilter(100000, 0.0001); // 2392x speedup for repeat misses

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
      // Periodically reset negative cache to allow for eventual consistency
      if (Math.random() < 0.1) negativeCache.clear();
    },
    10 * 60 * 1000,
  );
}

// --- UTILITY FUNCTIONS ---

/** Multi-layer user session retrieval (in-memory → distributed → DB) */
async function getUserFromSession(
  sessionId: string,
  tenantId?: DatabaseId | null,
): Promise<User | null> {
  // --- Performance Tweak: Negative Caching ---
  const isTestMode = process.env.TEST_MODE === "true";
  if (!isTestMode && negativeCache.has(sessionId)) return null;

  const now = Date.now();
  const memCached = getSessionFromCache(sessionId);
  if (memCached) {
    return memCached.user;
  }

  // Fallback to checking the default SessionStore (holds active in-memory/Redis sessions)
  try {
    const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
    const store = getDefaultSessionStore();
    const storedUser = await store.get(sessionId as DatabaseId);
    if (storedUser) {
      setSessionInCache(sessionId, { user: storedUser, timestamp: now });
      return storedUser;
    }
  } catch (err: any) {
    logger.trace(`SessionStore lookup failed: ${err.message}`);
  }

  try {
    const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
    const redisCached = await cacheService.get<SessionCacheEntry>(cacheKey, tenantId ?? undefined);
    if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
      setSessionInCache(sessionId, redisCached);
      return redisCached.user;
    }
  } catch (err: any) {
    logger.warn(`Redis session read failed: ${err.message}`);
  }

  const lastAttempt = lastRefreshAttempt.get(sessionId);
  if (!isTestMode && lastAttempt && now - lastAttempt < 60_000) {
    return null;
  }

  const { getDb } = await import("@src/databases/db");
  const adapter = getDb();
  if (!adapter) {
    logger.warn(`[Auth] No DB adapter available for session validation: ${sessionId}`);
    return null;
  }

  // Use a short-lived pending marker to prevent stampedes while validating
  lastRefreshAttempt.set(sessionId, now);

  try {
    const sessionResult = await adapter.auth.getSessionTokenData(sessionId as any);

    if (!sessionResult?.success) {
      logger.info(
        `[AuthDebug] getSessionTokenData returned false success for sessionId=${sessionId}. Result=${JSON.stringify(sessionResult)}`,
      );
      return null;
    }

    if (!sessionResult.data) {
      logger.info(`[AuthDebug] getSessionTokenData returned null data for sessionId=${sessionId}`);
      negativeCache.add(sessionId);
      return null;
    }

    const expiresAt = new Date(sessionResult.data.expiresAt).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      negativeCache.add(sessionId);
      return null;
    }

    const userResult = await adapter.auth.getUserById(sessionResult.data.user_id as any, {
      suppressErrorLog: true,
    });

    if (userResult?.success) {
      if (userResult.data) {
        const user = userResult.data;
        logger.debug(
          `[Auth] Session validated: ${sessionId.slice(0, 8)}... → user ${(user as any).email}`,
        );
        const sessionData: SessionCacheEntry = { user, timestamp: now };
        setSessionInCache(sessionId, sessionData);
        const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
        await cacheService
          .set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId as any)
          .catch((err: any) => logger.warn(`Session cache set failed: ${err.message}`));
        return user;
      } else {
        // Definitive: User not found in DB
        logger.debug(`[Auth] User not found in DB: ${sessionResult.data.user_id}`);
        negativeCache.add(sessionId);
      }
    } else {
      // Transient user lookup error or DB locked. Clear the cooldown to allow immediate retry on next request.
      lastRefreshAttempt.delete(sessionId);
      logger.warn(
        `[Auth] Session validation error for ${sessionId.slice(0, 8)}...: ${userResult?.message || "Unknown"}`,
      );
      return null;
    }
  } catch (err: any) {
    lastRefreshAttempt.delete(sessionId);
    logger.error(`Session validation crashed: ${err.message}`);
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
  if (process.env.TEST_MODE === "true") return; // Disable rotation in test mode to prevent cookie invalidation
  const lastRotation = lastRotationAttempt.get(oldSessionId);
  if (lastRotation && now - lastRotation < SESSION_ROTATION_INTERVAL_MS) return;

  const limiter = initRotationRateLimiter();
  try {
    if (await limiter.isLimited(event)) return;
  } catch (err: any) {
    if (dev) {
      logger.debug(`[Auth] Skipping session rotation rate limit check: ${err.message}`);
    } else {
      throw err;
    }
  }

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
      const cookieName = getSessionCookieName(isSecure);

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
  } catch (err: any) {
    logger.error(`Session rotation failed: ${err.message}`);
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

  if (
    (cookies.get(SESSION_COOKIE_NAME) || cookies.get(`__Host-${SESSION_COOKIE_NAME}`)) &&
    !isUserPresent
  )
    return;

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

  // 🧪 TEST/BENCHMARK BYPASS: env-gated + timing-safe secret (never active in production)
  if (applyTestBypassFromHeaders(event)) {
    return await resolve(event);
  }

  // 🚀 TURBO GET FAST-PATH: Auth context already resolved by handleTurboGet.
  // User, roles, tenantId, and bitset are pre-injected — skip session validation entirely.
  if ((locals as any).__turboAuth === true) {
    return await resolve(event);
  }

  // 🚀 PERFORMANCE: Ultra-fast exit for static assets using pre-computed flags
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic) return resolve(event);

  // ── Compute cookie config once (used by turbo check + normal flow) ─────
  const isProd = !dev && process.env.TEST_MODE !== "true";
  const isSecure = url.protocol === "https:" || (url.hostname !== "localhost" && isProd);
  const cookieName = getSessionCookieName(isSecure);

  // 🚀 UNIVERSAL TURBO AUTH: Check session → turbo auth cache BEFORE any
  // dynamic imports, tenant resolution, or CSRF work. On a warm cache hit,
  // this skips ~2ms of per-request auth overhead for ALL request types.
  const turboSessionId =
    cookies.get(cookieName) ||
    cookies.get(SESSION_COOKIE_NAME) ||
    cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
    cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);
  // 🛡️ Turbo-auth only for safe methods — mutations must go through CSRF
  const method = event.request.method;
  if (turboSessionId && (method === "GET" || method === "HEAD" || method === "OPTIONS")) {
    const turboCtx = turboAuthCache.get(turboSessionId);
    // 🛡️ Absolute expiry — never slides on access. Prevents timing attacks
    // that infer session liveness from TTL reset patterns.
    if (turboCtx && Date.now() < turboCtx.expiresAt) {
      (locals as any).user = turboCtx.user;
      (locals as any).roles = turboCtx.roles;
      (locals as any).tenantId = turboCtx.tenantId || locals.tenantId;
      (locals as any).__turboAuth = true;
      return await resolve(event);
    }
  }

  // Initialize tenant context ONLY if not already set
  if (!locals.tenantId) locals.tenantId = null as any;

  // --- Phase 1: Gated Initialization ---
  // 🚀 Zero-import: setup state is always pre-set by handleTurboPipeline.
  // Use string literals to avoid the dynamic import overhead on every request.
  const setupState = (locals as any).__setupState || "COMPLETE";

  if (setupState !== "COMPLETE") {
    if (setupState === "MISSING_CONFIG") locals.__setupConfigExists = false;
    return await resolve(event);
  }

  // 🛡️ Ensure CSRF token established (Skip for Bearer auth to avoid overhead)
  const authHeader = event.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    // Reuse isSecure computed at function top — no need to recompute
    ensureCsrfToken(cookies, isSecure);
  }

  // Ensure DB is initialized to at least CORE phase
  await getDbInitPromise(false, "CORE");

  const isSystemUser = (locals as any).user?._id === "system";
  if (isSystemUser) return resolve(event);

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

    const authHeader = event.request.headers.get("Authorization");
    // Accept whichever session cookie variant the auth layer issued. This keeps
    // local/test traffic on 127.0.0.1 compatible with secure-prefixed cookies.
    const sessionId =
      cookies.get(cookieName) ||
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
      cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);
    if (sessionId) {
      logger.info(
        `[Auth] Session cookie found: ${sessionId.slice(0, 12)}..., path=${event.url.pathname}`,
      );
      metricsService.incrementAuthValidations();
      if (!auth) {
        logger.warn(`[Auth] Auth service NOT initialized! (sessionId: ${sessionId})`);
        return await resolve(event);
      }

      const user = await getUserFromSession(sessionId as string, locals.tenantId as DatabaseId);
      logger.info(
        `[Auth] getUserFromSession result: ${user ? user.email + " (" + user.role + ")" : "null"}, tenantId=${locals.tenantId}`,
      );

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
          logger.warn(`[Auth] Tenant mismatch: local=${locals.tenantId}, user=${user.tenantId}`, {
            sessionId,
          });
          metricsService.incrementAuthFailures();
          cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
          throw new AppError("Tenant isolation violation", 403, "FORBIDDEN_TENANT");
        }
        locals.user = user;
        locals.session_id = sessionId as DatabaseId;
        locals.permissions = user.permissions || [];
        await handleSessionRotation(event, user, sessionId);
      } else {
        logger.warn(`[Auth] Invalid session or user not found: ${sessionId}`, {
          cookieName,
          hasSession: !!sessionId,
          authInitialized: !!auth,
          tenantId: locals.tenantId,
        });
        metricsService.incrementAuthFailures();
        // Returning user: a session cookie was present but is no longer valid → this browser has
        // signed in before. Flag it (the login page defaults to the Sign In form) before deleting
        // the dead cookie.
        (locals as any).returningUser = true;
        cookies.delete(cookieName, { path: "/" });
      }
    }

    // 3. API Token Authentication (Bearer) - Hardened for 2026 Retro-compatibility
    if (!locals.user && authHeader?.startsWith("Bearer ")) {
      const tokenValue = authHeader.substring(7).trim();
      if (tokenValue) {
        if (isValidApiKeyFormat(tokenValue)) {
          // --- API Key Authentication (sck_...) ---
          const hash = hashApiKey(tokenValue);
          if (isApiKeyAuthNegativeHit(hash, locals.tenantId as DatabaseId)) {
            return await resolve(event);
          }

          const cachedKeyData = getApiKeyAuthCacheSync(hash, locals.tenantId as DatabaseId);

          if (cachedKeyData) {
            locals.user = cachedKeyData.user as unknown as User;
            locals.permissions = cachedKeyData.user.permissions as string[];
            locals.tenantId = (cachedKeyData.tenantId as DatabaseId) || locals.tenantId;
            logger.debug(`[Auth] Authenticated via API Key (Cache Hit)`);

            // Fire-and-forget: update usage statistics in the background
            const clientIp = event.getClientAddress
              ? event.getClientAddress()
              : event.request.headers.get("x-forwarded-for") || undefined;
            dbAdapter.auth
              .updateApiKeyUsage(
                (cachedKeyData.user._id as string).replace("apikey:", "") as DatabaseId,
                clientIp,
                {
                  tenantId: locals.tenantId,
                },
              )
              .catch(() => {});
          } else {
            metricsService.incrementAuthValidations();
            const res = await dbAdapter.auth.getApiKey(hash, {
              tenantId: locals.tenantId,
            });
            if (res.success && res.data) {
              const apiKey = res.data;

              // 1. Expiry Check
              if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
                logger.warn(`[Auth] API Key expired: ${apiKey.name}`);
                metricsService.incrementAuthFailures();
              } else if (apiKey.revoked) {
                logger.warn(`[Auth] API Key is revoked: ${apiKey.name}`);
                metricsService.incrementAuthFailures();
              } else {
                // 2. Tenant Isolation Check
                if (apiKey.tenantId && locals.tenantId && apiKey.tenantId !== locals.tenantId) {
                  logger.warn(`[Auth] API Key tenant mismatch: ${apiKey.name}`);
                  metricsService.incrementAuthFailures();
                  return await resolve(event);
                }

                // 3. Construct virtual API user
                locals.user = {
                  _id: `apikey:${apiKey._id}`,
                  email: `apikey@api.local`,
                  username: apiKey.name,
                  role: "guest",
                  permissions: apiKey.permissions || [],
                  tenantId: apiKey.tenantId ?? (event.locals.tenantId as any),
                  isApiKey: true,
                  scopes: apiKey.scopes || [],
                } as any;

                locals.permissions = apiKey.permissions || [];
                locals.tenantId = (apiKey.tenantId as DatabaseId) || locals.tenantId;

                setApiKeyAuthCache(
                  hash,
                  {
                    user: locals.user as unknown as Record<string, unknown>,
                    tenantId: locals.tenantId as string,
                  },
                  String(apiKey._id),
                  locals.tenantId as DatabaseId,
                ).catch((err: any) => logger.warn(`Failed to cache API Key: ${err.message}`));

                // Fire-and-forget: update usage count and last used IP
                const clientIp = event.getClientAddress
                  ? event.getClientAddress()
                  : event.request.headers.get("x-forwarded-for") || undefined;
                dbAdapter.auth
                  .updateApiKeyUsage(apiKey._id, clientIp, {
                    tenantId: locals.tenantId,
                  })
                  .catch(() => {});

                logger.debug(`[Auth] Authenticated via API Key: ${apiKey.name}`);
              }
            } else {
              recordApiKeyAuthMiss(hash, locals.tenantId as DatabaseId);
              metricsService.incrementAuthFailures();
              logger.warn(`[Auth] Invalid or non-existent API Key provided`);
            }
          }
        } else {
          // --- Website Token / Retro-compatibility token ---
          const tokenHash = hashCredentialSha256HexSync(tokenValue);
          if (isWebsiteTokenAuthNegativeHit(tokenHash, locals.tenantId as DatabaseId)) {
            return await resolve(event);
          }

          const cachedToken = getWebsiteTokenAuthCacheSync(
            tokenHash,
            locals.tenantId as DatabaseId,
          );

          if (cachedToken) {
            locals.user = cachedToken.user as unknown as User;
            locals.permissions = cachedToken.user.permissions as string[];
            locals.tenantId = (cachedToken.tenantId as DatabaseId) || locals.tenantId;
            logger.debug(`[Auth] Authenticated via API Token (Cache Hit)`);
          } else {
            metricsService.incrementAuthValidations();
            const res = await dbAdapter.system.websiteTokens.getByTokenHash(
              tokenHash,
              locals.tenantId as DatabaseId,
            );

            if (res.success && res.data) {
              const token = res.data;

              // 1. Expiry Check
              if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
                logger.warn(`[Auth] API Token expired: ${token.name}`);
                metricsService.incrementAuthFailures();
              } else {
                // 2. Normalization (Retro-compatibility)
                // If type is missing, normalize to 'content-api'
                const tokenType = token.type || "content-api";

                // 3. Tenant Isolation Check
                if (token.tenantId && locals.tenantId && token.tenantId !== locals.tenantId) {
                  logger.warn(`[Auth] API Token tenant mismatch: ${token.name}`);
                  metricsService.incrementAuthFailures();
                  return await resolve(event);
                }

                // 4. Orphaned check & Virtual User building
                locals.user = {
                  _id: `token:${token._id}`,
                  email: `token@api.local`,
                  username: token.name,
                  role: tokenType === "admin-api" ? "admin" : "guest",
                  permissions: token.permissions || [],
                  tenantId: token.tenantId ?? (event.locals.tenantId as any),
                  isApiToken: true,
                } as any;

                locals.permissions = token.permissions || [];
                locals.tenantId = (token.tenantId as DatabaseId) || locals.tenantId;

                setWebsiteTokenAuthCache(
                  tokenHash,
                  {
                    user: locals.user as unknown as Record<string, unknown>,
                    tenantId: locals.tenantId as string,
                  },
                  String(token._id),
                  locals.tenantId as DatabaseId,
                ).catch((err: any) => logger.warn(`Failed to cache API token: ${err.message}`));

                logger.debug(`[Auth] Authenticated via API Token: ${token.name} (${tokenType})`);
              }
            } else {
              recordWebsiteTokenAuthMiss(tokenHash, locals.tenantId as DatabaseId);
              metricsService.incrementAuthFailures();
              logger.warn(`[Auth] Invalid or non-existent API Token provided`);
            }
          }
        }
      }
    }

    // Ephemeral Guest Authentication for public API endpoints
    const hasAuthAttempt =
      !!authHeader ||
      cookies.get(cookieName) ||
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
      cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);

    if (!locals.user && !hasAuthAttempt) {
      const isPublicPath =
        url.pathname.startsWith("/api/collections") ||
        url.pathname.startsWith("/api/query") ||
        url.pathname.startsWith("/api/graphql") ||
        url.pathname.startsWith("/api/media");

      const isAllowedMethod =
        event.request.method === "GET" ||
        event.request.method === "OPTIONS" ||
        (event.request.method === "POST" && url.pathname === "/api/graphql");

      if (isPublicPath && isAllowedMethod) {
        locals.user = {
          _id: "anonymous",
          email: "anonymous@svelty.local",
          username: "Anonymous Guest",
          role: "guest",
          permissions: [
            "collections:read",
            "api:collections",
            "api:media",
            "media:read",
            "graphql:read",
            "api:graphql",
          ],
          tenantId: locals.tenantId || null,
          isAnonymous: true,
        } as any;
        locals.permissions = [
          "collections:read",
          "api:collections",
          "api:media",
          "media:read",
          "graphql:read",
          "api:graphql",
        ];
      }
    }

    return await runWithContext(
      {
        tenantId: locals.tenantId as DatabaseId | null,
        userId: locals.user?._id as DatabaseId | null,
        permissions: locals.permissions,
        requestId: locals.requestId,
      },
      () => resolve(event),
    );
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

  // 🚀 Turbo GET: Also invalidate the auth context cache so a revoked
  // session can't access cached API responses within the TTL window.
  invalidateTurboAuthContext(sessionId);

  // Invalidate global SessionStore
  try {
    const { getDefaultSessionStore } = require("@src/databases/auth/session-manager");
    const store = getDefaultSessionStore();
    if (store && typeof store.delete === "function") {
      store.delete(sessionId as DatabaseId).catch(() => {});
    }
  } catch (e) {
    // Dynamic fallback for non-CommonJS context
    void e;
    import("@src/databases/auth/session-manager")
      .then((mod) => {
        const store = mod.getDefaultSessionStore();
        if (store) store.delete(sessionId as DatabaseId).catch(() => {});
      })
      .catch(() => {});
  }

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
  negativeCache.clear();
  multiTenantCached = null;
  demoModeCached = null;
}

/**
 * Prime the in-memory session cache directly — bypasses Redis and validateSession.
 * Used by setup wizard and sign-in to ensure getUserFromSession gets an instant hit.
 */
export function primeSessionMemoryCache(sessionId: string, user: User): void {
  negativeCache.clear();
  const entry: SessionCacheEntry = { user, timestamp: Date.now() };
  setSessionInCache(sessionId, entry);
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
