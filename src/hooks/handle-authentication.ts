/**
 * @file src/hooks/handle-authentication.ts
 * @description
 * Enterprise-grade authentication middleware with session validation, rotation, and multi-tenancy.
 *
 * Runs after handleSystemState confirms the system is ready. Provides:
 * - **Session Management**: Validates session cookies with 3-layer caching (in-memory → Redis → database)
 * - **Security Token Rotation**: Automatic token rotation for active sessions (prevents session hijacking)
 * - **Multi-tenancy**: Hostname-based tenant identification with strict isolation
 * - **Memory Optimization**: LRU cache with TTL-based eviction (no WeakRef GC flakiness)
 * - **Rate Limiting**: Session rotation rate limits to prevent abuse
 * - **Metrics Integration**: Comprehensive tracking via metrics-service
 *
 * ### Features:
 * - Session rotation every 15 minutes for active users
 * - LRU session cache (top 10,000 hot sessions) with TTL eviction
 * - Tenant isolation enforcement (prevents cross-tenant access)
 * - API key auth with usage tracking via `getClientIp()` (no XFF spoofing)
 * - Turbo GET hand-off when `__turboAuth` is already resolved
 * - Login-time turbo-auth write-through via primeSessionMemoryCache
 *
 * @prerequisite handleSystemState has already confirmed readiness
 */

import type { ISODateString } from "@databases/db-interface";
import { generateCsrfToken, ensureCsrfToken } from "@utils/security/csrf-utils";
import {
  getSessionCookieName,
  isSecureCookieContext,
  readSessionCookie,
  clearAllSessionCookies as clearCookiesHelper,
  sessionTtlMs,
  isAdmin,
} from "@src/databases/auth/constants";
import type { User } from "@src/databases/auth/types";
import { isValidApiKeyFormat, hashApiKey } from "@src/databases/auth/api-keys";
import { recordApiKeyUsage } from "@src/databases/auth/api-key-usage-accumulator";
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
import { evaluateSessionAnomaly, toSafeSessionUser } from "@src/databases/auth/session-user";

import { getDbInitPromise, auth, dbAdapter, isDbConnected } from "@src/databases/db";
import { metricsService } from "@src/services/observability/metrics-service";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError, isAppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { RateLimiter } from "./handle-rate-limit";

/** Mask an email for log safety: r***s@web.de */
function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return "***@***";
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  return local[0] + "***" + local[local.length - 1] + domain;
}

/**
 * Resolves the configured cookie path from system settings.
 * Falls back to "/" when COOKIE_PATH is not configured or empty.
 */
function getCookiePath(): string {
  const configuredPath = getPrivateSettingSync("COOKIE_PATH");
  if (configuredPath && typeof configuredPath === "string" && configuredPath.length > 0) {
    logger.debug(`[Auth] Cookie path from settings: ${configuredPath}`);
    return configuredPath;
  }
  logger.debug(`[Auth] Cookie path defaulting to "/"`);
  return "/";
}

import { getClientIp, getRequestFlags } from "@utils/hook-utils";
import { getPrivateSettingSync, getPublicSettingSync } from "@src/services/core/settings-service";
import { getTenantIdFromHostname, isMultiTenantEnabled } from "@utils/tenant";
import { dev } from "$app/env";
import { runWithContext } from "@src/utils/context";
import {
  invalidateTurboAuthContext,
  turboAuthCache,
  getTurboAuthContext,
  setTurboAuthContext,
} from "./handle-turbo-get";
import {
  applyAdapterTenantContext,
  bindRequestDbAdapter,
  runWithTenantAdapter,
} from "@src/databases/tenant-adapter";

let sessionManagerPromise: Promise<typeof import("@src/databases/auth/session-manager")> | null =
  null;
function getSessionManagerLazy() {
  return (sessionManagerPromise ??= import("@src/databases/auth/session-manager"));
}

// --- MODULE-LEVEL CACHES & STATE ---
let multiTenantCached: boolean | null = null;
let demoModeCached: boolean | null = null;
let rotationRateLimiter: RateLimiter | null = null;

function getCachedSettings() {
  if (multiTenantCached === null) {
    multiTenantCached = isMultiTenantEnabled();
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

  // JWT_SECRET_KEY is an infrastructure key (config/env only). The sync settings
  // cache may not be warmed yet on API-only cold boots (e.g. benchmark servers
  // that never load a page), so fall back to the runtime env before declaring
  // the secret missing — it arrives via env in every env-based deployment.
  const secret = (getPrivateSettingSync("JWT_SECRET_KEY") as string) || process.env.JWT_SECRET_KEY;
  const isTestMode =
    process.env.TEST_MODE === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.BENCHMARK === "true" ||
    process.env.SVELTY_BENCHMARK_SUITE === "true";
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

/**
 * 🚀 Pre-warms the authentication lazy promises, settings caches, and rate limiters at system startup.
 */
export function prewarmAuthenticationHotPaths(): void {
  getCachedSettings();
  initRotationRateLimiter();
  void getSessionManagerLazy().catch(() => {});
}

// --- IN-MEMORY SESSION CACHE WITH WEAKREF-BASED CLEANUP ---

interface SessionCacheEntry {
  timestamp: number;
  user: User;
}

/**
 * Result of a session resolution attempt.
 * - ok        → valid user (all cache layers + DB)
 * - invalid   → definitively invalid (expired / revoked / user deleted / blocked)
 * - transient → could not be resolved right now (DB blip, in-flight coalesce);
 *               the caller must NOT delete the session cookie on this status
 */
export type SessionResolution =
  | { status: "ok"; user: User }
  | { status: "invalid" }
  | { status: "transient" };

const MAX_SESSION_CACHE = 10_000;
const sessionCache = new Map<string, SessionCacheEntry>();
const lastRefreshAttempt = new Map<string, number>();
const lastRotationAttempt = new Map<string, number>();

// Single-flight: coalesce concurrent cold-session validations instead of
// denying the losers (which previously logged users out on cold start).
const inflightSessionChecks = new Map<string, Promise<SessionResolution>>();

/**
 * Session rotation interval: 60 minutes
 * Balances security (regular token refresh) with reduced database write impact.
 */
const SESSION_ROTATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — per industry best practice

// 🛡️ Bounded NEGATIVE session cache — an EXACT Map with TTL, never a Bloom
// filter: a Bloom false positive would randomly reject VALID sessions
// (users logged out by a probabilistic collision on the auth gate). The Map
// has deterministic zero-false-positive semantics with the same bounded memory.
const MAX_NEGATIVE_CACHE = 10_000;
const NEGATIVE_CACHE_TTL_MS = 60_000; // 1 minute negative-hit TTL
const negativeSessionCache = new Map<string, number>();

function isNegativeSessionHit(sessionId: string): boolean {
  const expiry = negativeSessionCache.get(sessionId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    negativeSessionCache.delete(sessionId);
    return false;
  }
  return true;
}

function addNegativeSessionHit(sessionId: string): void {
  if (negativeSessionCache.size >= MAX_NEGATIVE_CACHE) {
    const oldestKey = negativeSessionCache.keys().next().value;
    if (oldestKey) negativeSessionCache.delete(oldestKey);
  }
  negativeSessionCache.set(sessionId, Date.now() + NEGATIVE_CACHE_TTL_MS);
}

/**
 * Cooldown for log-only session-context anomaly warnings (per session).
 * IP / user-agent drift is reported at most once per hour per session to keep
 * rotating-NAT / mobile-network noise out of the logs.
 */
const SESSION_ANOMALY_LOG_COOLDOWN_MS = 60 * 60 * 1000;
const lastAnomalyLog = new Map<string, number>();

/**
 * Gets a session from the cache (LRU eviction, no WeakRef).
 */
function getSessionFromCache(sessionId: string): SessionCacheEntry | null {
  const now = Date.now();
  const entry = sessionCache.get(sessionId);
  if (entry && now - entry.timestamp < SESSION_CACHE_TTL_MS) {
    // Only re-insert to track LRU order when cache is full/near capacity (>80%)
    if (sessionCache.size >= MAX_SESSION_CACHE * 0.8) {
      sessionCache.delete(sessionId);
      sessionCache.set(sessionId, entry);
    }
    return entry;
  }
  // Expired entry — drop it immediately
  if (entry) sessionCache.delete(sessionId);
  return null;
}

/**
 * Sets a session in the cache with LRU eviction.
 */
function setSessionInCache(sessionId: string, entry: SessionCacheEntry): void {
  if (sessionCache.has(sessionId)) sessionCache.delete(sessionId);
  sessionCache.set(sessionId, entry);
  if (sessionCache.size > MAX_SESSION_CACHE) {
    const firstKey = sessionCache.keys().next().value;
    if (firstKey) sessionCache.delete(firstKey);
  }
}

// Periodic cleanup — guarded against duplicate timers on HMR reload
const SESSION_CLEANUP_KEY = "__svelty_session_cleanup__";
if (typeof setInterval !== "undefined" && !(globalThis as any)[SESSION_CLEANUP_KEY]) {
  (globalThis as any)[SESSION_CLEANUP_KEY] = setInterval(
    () => {
      const now = Date.now();
      for (const [sessionId, data] of sessionCache.entries()) {
        if (now - data.timestamp > SESSION_CACHE_TTL_MS) sessionCache.delete(sessionId);
      }
      for (const [sessionId, timestamp] of lastRefreshAttempt.entries()) {
        if (now - timestamp > 300_000) lastRefreshAttempt.delete(sessionId);
      }
      for (const [sessionId, timestamp] of lastRotationAttempt.entries()) {
        if (now - timestamp > SESSION_ROTATION_INTERVAL_MS * 2)
          lastRotationAttempt.delete(sessionId);
      }
      for (const [sessionId, timestamp] of lastAnomalyLog.entries()) {
        if (now - timestamp > SESSION_ANOMALY_LOG_COOLDOWN_MS * 2) lastAnomalyLog.delete(sessionId);
      }
      for (const [sessionId, expiry] of negativeSessionCache.entries()) {
        if (now > expiry) negativeSessionCache.delete(sessionId);
      }
    },
    10 * 60 * 1000,
  );
}

// --- UTILITY FUNCTIONS ---

/**
 * Idle timeout window (ms) from SESSION_IDLE_HOURS (0 = disabled).
 * Rides on the session-cache LRU timestamps — no extra queries or writes.
 */
function getIdleWindowMs(): number {
  const hours = Number(getPrivateSettingSync("SESSION_IDLE_HOURS")) || 0;
  return hours > 0 ? hours * 60 * 60 * 1000 : 0;
}

/** Log-only IP/user-agent drift detection (OWASP session guidance). */
function recordSessionAnomaly(
  sessionId: string,
  clientIp: string | null | undefined,
  userAgent: string | null | undefined,
  sessionRecord: {
    ipAddress?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  } | null,
): void {
  const record = sessionRecord ?? null;
  const drift = evaluateSessionAnomaly({
    currentIp: clientIp,
    currentUserAgent: userAgent,
    storedIp: record?.ipAddress ?? record?.ip ?? null,
    storedUserAgent: record?.userAgent ?? null,
  });
  if (!drift.ipChanged && !drift.userAgentChanged) return;

  const now = Date.now();
  const last = lastAnomalyLog.get(sessionId);
  if (last && now - last < SESSION_ANOMALY_LOG_COOLDOWN_MS) return;
  lastAnomalyLog.set(sessionId, now);

  logger.warn(
    `[Auth] Session context change (log-only, no action taken): session=${sessionId.slice(0, 8)}...` +
      (drift.ipChanged ? " ip changed" : "") +
      (drift.userAgentChanged ? " user-agent changed" : ""),
  );
}

/** Multi-layer user session retrieval (in-memory → distributed → DB) */
async function getUserFromSession(
  sessionId: string,
  tenantId?: DatabaseId | null,
  clientIp?: string | null,
  userAgent?: string | null,
): Promise<SessionResolution> {
  // --- Performance Tweak: Negative Caching (deterministic Map, not Bloom) ---
  const isTestMode = process.env.TEST_MODE === "true";
  if (!isTestMode && isNegativeSessionHit(sessionId)) return { status: "invalid" };

  const now = Date.now();
  const idleMs = getIdleWindowMs();
  const memCached = getSessionFromCache(sessionId);
  if (memCached) {
    // Idle timeout: the LRU entry timestamp is the sliding last-activity clock.
    if (idleMs > 0 && now - memCached.timestamp > idleMs) {
      invalidateSessionCache(sessionId, tenantId);
      addNegativeSessionHit(sessionId);
      return { status: "invalid" };
    }
    // Slide the clock — the entry object is shared with the Map.
    memCached.timestamp = now;
    // NOTE: cached users are snapshots — a NEW block is detected via cache
    // invalidation on block/unblock/delete (batchAction purge), after which the
    // next request re-validates against the DB and hits the blocked check below.
    return { status: "ok", user: memCached.user };
  }

  // Fallback to checking the default SessionStore (holds active in-memory/Redis sessions)
  try {
    const { getDefaultSessionStore } = await getSessionManagerLazy();
    const store = getDefaultSessionStore();
    // Credential stripping at the store boundary (defense-in-depth: the store
    // already strips on set, but a stale pre-strip entry must never leak).
    const storedUser = await store.get(sessionId as DatabaseId);
    if (storedUser) {
      const safeStoredUser = toSafeSessionUser(storedUser);
      setSessionInCache(sessionId, { user: safeStoredUser, timestamp: now });
      return { status: "ok", user: safeStoredUser };
    }
  } catch (err: any) {
    logger.trace(`SessionStore lookup failed: ${err.message}`);
  }

  try {
    const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
    const redisCached = await cacheService.get<SessionCacheEntry>(cacheKey, tenantId ?? undefined);
    if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
      // Idle timeout applies to distributed entries too.
      if (idleMs > 0 && now - redisCached.timestamp > idleMs) {
        invalidateSessionCache(sessionId, tenantId);
        addNegativeSessionHit(sessionId);
        return { status: "invalid" };
      }
      setSessionInCache(sessionId, { user: toSafeSessionUser(redisCached.user), timestamp: now });
      return { status: "ok", user: toSafeSessionUser(redisCached.user) };
    }
  } catch (err: any) {
    logger.warn(`Redis session read failed: ${err.message}`);
  }

  // Single-flight: another request is already validating this session — await
  // its outcome instead of denying (denial used to delete the session cookie
  // and log users out on cold start / cache flush).
  const inflight = inflightSessionChecks.get(sessionId);
  if (inflight) return inflight;

  const lastAttempt = lastRefreshAttempt.get(sessionId);
  if (!isTestMode && lastAttempt && now - lastAttempt < 60_000) {
    // A previous validation completed recently but left no cache entry (e.g.
    // transient failure). Do not hammer the DB — stay unauthenticated for this
    // request WITHOUT deleting the cookie; the next request retries.
    return { status: "transient" };
  }

  // dbAdapter is imported at module top; the hook bails earlier when it is
  // missing (pre-CORE boot). Using it directly avoids a dynamic import on the
  // cold path and keeps the single-flight section fully synchronous.
  if (!dbAdapter) {
    logger.warn(`[Auth] No DB adapter available for session validation: ${sessionId}`);
    return { status: "transient" };
  }

  // Use a short-lived pending marker to prevent stampedes while validating
  lastRefreshAttempt.set(sessionId, now);

  const work = (async (): Promise<SessionResolution> => {
    try {
      if (typeof dbAdapter.auth?.validateSession === "function") {
        const valRes = await dbAdapter.auth.validateSession(sessionId as any);
        const user = (valRes as any)?.success !== undefined ? (valRes as any).data : valRes;
        if (user && user._id) {
          if (user.blocked) {
            addNegativeSessionHit(sessionId);
            return { status: "invalid" };
          }
          const safeUser = toSafeSessionUser(user);
          const sessionData: SessionCacheEntry = { user: safeUser, timestamp: now };
          setSessionInCache(sessionId, sessionData);
          const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
          await cacheService
            .set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId as any)
            .catch(() => {});
          return { status: "ok", user: safeUser };
        } else if (user === null || (valRes as any)?.success === true) {
          addNegativeSessionHit(sessionId);
          return { status: "invalid" };
        }
        // Adapter has validateSession but the lookup failed (transient). Do
        // not fall through to getSessionTokenData + getUserById — that is two
        // extra round-trips on a path that already joined session→user.
        lastRefreshAttempt.delete(sessionId);
        return { status: "transient" };
      }

      const sessionResult = await dbAdapter.auth.getSessionTokenData(sessionId as any);

      if (!sessionResult?.success) {
        logger.debug(
          `[Auth] getSessionTokenData unsuccessful for sessionId=${sessionId.slice(0, 12)}...`,
        );
        return { status: "transient" };
      }

      if (!sessionResult.data) {
        logger.debug(
          `[Auth] getSessionTokenData returned null data for sessionId=${sessionId.slice(0, 12)}...`,
        );
        addNegativeSessionHit(sessionId);
        return { status: "invalid" };
      }

      const expiresAt = new Date(sessionResult.data.expiresAt).getTime();
      if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
        addNegativeSessionHit(sessionId);
        return { status: "invalid" };
      }

      const userResult = await dbAdapter.auth.getUserById(sessionResult.data.user_id as any, {
        suppressErrorLog: true,
      });

      if (userResult?.success) {
        if (userResult.data) {
          const user = userResult.data;
          // 🛡️ Blocked users are cut off at DB re-validation time (not just
          // cached entries) — a block must take effect immediately.
          if (user.blocked) {
            addNegativeSessionHit(sessionId);
            return { status: "invalid" };
          }
          // 🛡️ Session-context drift (IP / user-agent) — log-only per OWASP
          // session-management guidance. Never blocks, never logs the actor out.
          recordSessionAnomaly(sessionId, clientIp, userAgent, sessionResult.data as any);
          logger.debug(
            `[Auth] Session validated: ${sessionId.slice(0, 8)}... → user ${maskEmail((user as any).email)}`,
          );
          const safeUser = toSafeSessionUser(user);
          const sessionData: SessionCacheEntry = { user: safeUser, timestamp: now };
          setSessionInCache(sessionId, sessionData);
          const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
          await cacheService
            .set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId as any)
            .catch((err: any) => logger.warn(`Session cache set failed: ${err.message}`));
          return { status: "ok", user: safeUser };
        } else {
          // Definitive: User not found in DB
          logger.debug(`[Auth] User not found in DB: ${sessionResult.data.user_id}`);
          addNegativeSessionHit(sessionId);
          return { status: "invalid" };
        }
      } else {
        // Transient user lookup error or DB locked. Clear the cooldown to allow immediate retry on next request.
        lastRefreshAttempt.delete(sessionId);
        logger.warn(
          `[Auth] Session validation error for ${sessionId.slice(0, 8)}...: ${userResult?.message || "Unknown"}`,
        );
        return { status: "transient" };
      }
    } catch (err: any) {
      lastRefreshAttempt.delete(sessionId);
      logger.error(`Session validation crashed: ${err.message}`);
      return { status: "transient" };
    }
  })();

  inflightSessionChecks.set(sessionId, work);
  try {
    return await work;
  } finally {
    inflightSessionChecks.delete(sessionId);
  }
}

/**
 * Shared session resolution for WebSocket upgrades.
 *
 * WebSocket handshakes have no `RequestEvent`, so they cannot reuse the
 * `handleAuthentication` hook directly. This thin wrapper runs the SAME
 * pipeline as HTTP sessions (mem LRU → session store → Redis → DB with
 * negative cache, idle window, blocked-user cutoff and single-flight
 * coalescing) so WS upgrades no longer need their own parallel 30s LRU.
 */
export async function resolveSessionForWebSocket(
  sessionId: string,
  opts: { tenantId?: DatabaseId | null; clientIp?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; user: User; tenantId: string | null } | { ok: false }> {
  const res = await getUserFromSession(
    sessionId,
    opts.tenantId ?? null,
    opts.clientIp ?? null,
    opts.userAgent ?? null,
  );
  if (res.status !== "ok" || !res.user) return { ok: false };
  const userTenant = (res.user as { tenantId?: string | null }).tenantId;
  return {
    ok: true,
    user: res.user,
    tenantId: userTenant ?? opts.tenantId ?? null,
  };
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

    // Rotated sessions keep the configured session lifetime (SESSION_TTL_HOURS,
    // default 24h) — rotation must NOT extend the session beyond the policy,
    // and device info is carried over for the device-policy + sessions UI.
    const newSession = await auth.createSession({
      user_id: user._id as DatabaseId,
      expires: new Date(
        Date.now() + sessionTtlMs(getPrivateSettingSync("SESSION_TTL_HOURS")),
      ).toISOString() as ISODateString,
      tenantId: event.locals.tenantId as DatabaseId,
      userAgent: event.request.headers.get("user-agent") || undefined,
      deviceId: event.request.headers.get("x-device-id") || undefined,
      ipAddress:
        event.getClientAddress?.() ||
        event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        undefined,
    });

    if (newSession && newSession._id !== oldSessionId) {
      const newSessionId = newSession._id;
      const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
      const cookieName = getSessionCookieName(isSecure);

      event.cookies.set(cookieName, newSessionId, {
        path: getCookiePath(),
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "strict" : "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
      generateCsrfToken(event.cookies, isSecure);

      await auth.destroySession(oldSessionId as DatabaseId).catch(() => {});
      invalidateSessionCache(oldSessionId, event.locals.tenantId as DatabaseId);
      setSessionInCache(newSessionId, { user: toSafeSessionUser(user), timestamp: now });
      lastRotationAttempt.set(newSessionId, now);
      event.locals.session_id = newSessionId;
    }
  } catch (err: any) {
    logger.error(`Session rotation failed: ${err.message}`);
  }
}

/**
 * Determines the secure cookie name for demo tenant identification.
 * Uses __Host- prefix on HTTPS per RFC 6265bis for subdomain isolation.
 */
function getDemoTenantCookieName(isSecure: boolean): string {
  return isSecure ? "__Host-demo_tenant_id" : "demo_tenant_id";
}

/**
 * Reads DEMO_TTL from public settings (default: 60 minutes).
 * Returns the TTL in seconds for cookie maxAge.
 */
function getDemoTTLSeconds(): number {
  try {
    const demoTTL = Number(getPublicSettingSync("DEMO_TTL")) || 60;
    return demoTTL * 60; // Convert minutes to seconds
  } catch {
    return 3600; // Default: 60 minutes
  }
}

/**
 * Handles automatic demo tenant generation and seeding.
 * Each visitor gets their own unique tenantId — no hostname-based dedup.
 */
async function handleDemoTenantAssignment(event: RequestEvent, isUserPresent: boolean) {
  const { cookies, url, locals } = event;
  const isSecure = url.protocol === "https:";
  const cookieName = getDemoTenantCookieName(isSecure);
  const tenantIdFromCookie =
    cookies.get(cookieName) ||
    // Also check the unprefixed variant for backward compat
    (!isSecure ? null : cookies.get("demo_tenant_id")) ||
    null;

  if (tenantIdFromCookie) {
    locals.tenantId = tenantIdFromCookie as DatabaseId;
    return;
  }

  // If user has a session cookie but no user is present, skip assignment
  if (readSessionCookie(cookies, isSecure) && !isUserPresent) return;

  // Generate a unique tenantId per visitor — no shared dedup
  const tenantId = crypto.randomUUID();

  // SET COOKIE FIRST (before async seeding) to prevent race conditions
  // where sign-up arrives mid-seed and generates a different tenantId.
  const maxAge = getDemoTTLSeconds();
  cookies.set(cookieName, tenantId, {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge,
  });
  locals.tenantId = tenantId as DatabaseId;

  // Seed immediately so the first authenticated demo route has its content tree.
  try {
    const { seedDemoTenant } = await import("@src/routes/setup/seed");
    await seedDemoTenant(dbAdapter!, tenantId);
  } catch (e) {
    logger.error(`Failed to seed demo tenant ${tenantId}:`, e);
  }
}

// --- MAIN HOOK ---

export const handleAuthentication: Handle = async ({ event, resolve }) => {
  const { locals, url, cookies } = event;

  // 🚀 TURBO GET FAST-PATH: Auth context already resolved by handleTurboGet.
  // User, roles, tenantId, and bitset are pre-injected — skip session validation entirely.
  if ((locals as any).__turboAuth === true) {
    // Keep locals.dbAdapter populated — downstream handlers (GraphQL route,
    // dispatcher) must not see an undefined adapter and fall back to getDb()
    // (identity flips between proxy and raw break schema caches).
    locals.dbAdapter = dbAdapter;
    (locals as any).dbAdapterUnscoped = dbAdapter;
    const tenantP = applyAdapterTenantContext(dbAdapter, locals.tenantId ?? null);
    if (tenantP) await tenantP;
    return resolve(event);
  }

  // 🚀 PERFORMANCE: Ultra-fast exit for static assets using pre-computed flags
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic) return resolve(event);

  // ── Compute cookie config once (used by turbo check + normal flow) ─────
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const cookieName = getSessionCookieName(isSecure);

  // 🧪 TEST-MODE TENANT HEADER: Resolve once so ALL turbo fast paths (and the
  // main flow) honor x-test-tenant-id even when a warm session context exists.
  // Without this, a cached turboCtx.tenantId from an earlier request in the same
  // session (e.g. tenant A) leaks into later requests for tenant B.
  const testMode = process.env.TEST_MODE === "true" || process.env.PLAYWRIGHT_TEST === "true";
  const testTenantHeader = testMode ? event.request.headers.get("x-test-tenant-id") : null;
  const testTenantOverride =
    testTenantHeader && testTenantHeader.length > 0 && testTenantHeader !== "null"
      ? (testTenantHeader as DatabaseId)
      : null;

  // 🚀 UNIVERSAL TURBO AUTH: Check session → turbo auth cache BEFORE any
  // dynamic imports, tenant resolution, or CSRF work. On a warm cache hit,
  // this skips ~2ms of per-request auth overhead for ALL request types.
  const turboSessionId = readSessionCookie(cookies, isSecure);
  // 🛡️ Turbo-auth only for safe methods — mutations must go through CSRF
  const method = event.request.method;
  if (turboSessionId && (method === "GET" || method === "HEAD" || method === "OPTIONS")) {
    const turboCtx = turboAuthCache.get(turboSessionId);
    // 🛡️ Absolute expiry — never slides on access. Prevents timing attacks
    // that infer session liveness from TTL reset patterns.
    if (turboCtx && Date.now() < turboCtx.expiresAt) {
      (locals as any).user = turboCtx.user;
      (locals as any).roles = turboCtx.roles;
      (locals as any).tenantId = testTenantOverride ?? turboCtx.tenantId ?? locals.tenantId;
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

  // 🚀 UNIVERSAL TURBO AUTH: After CSRF establishment on mutations, check if session is warm
  if (turboSessionId) {
    const turboCtx = turboAuthCache.get(turboSessionId);
    if (turboCtx && Date.now() < turboCtx.expiresAt) {
      (locals as any).user = turboCtx.user;
      (locals as any).roles = turboCtx.roles;
      (locals as any).tenantId = testTenantOverride ?? turboCtx.tenantId ?? locals.tenantId;
      locals.dbAdapter = dbAdapter;
      (locals as any).dbAdapterUnscoped = dbAdapter;
      (locals as any).__turboAuth = true;
      return await resolve(event);
    }
  }

  // Ensure DB is initialized to at least CORE phase
  if (!isDbConnected()) {
    await getDbInitPromise(false, "CORE");
  }

  const isSystemUser = (locals as any).user?._id === "system";
  if (isSystemUser) return resolve(event);

  // 🚀 REUSE UPSTREAM VALIDATED USER: If handleTurboPipeline or test bypass already validated this user
  if (locals.user && (locals.user as any)._id) {
    if (!locals.permissions) {
      locals.permissions = locals.user.permissions || [];
    }
    if (!(locals as any).roles) {
      (locals as any).roles = [(locals.user as any).role || "user"];
    }
    locals.dbAdapter = dbAdapter;
    (locals as any).dbAdapterUnscoped = dbAdapter;
    return await resolve(event);
  }

  try {
    // Raw adapter first; re-bound after tenant resolution (forTenant inject).
    locals.dbAdapter = dbAdapter;
    (locals as any).dbAdapterUnscoped = dbAdapter;
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

    // TEST_MODE: allow black-box multi-tenant isolation tests without flipping
    // MULTI_TENANT for the whole process. Header is ignored outside test mode.
    const testMode = process.env.TEST_MODE === "true" || process.env.PLAYWRIGHT_TEST === "true";
    if (testMode) {
      const explicitTenant = event.request.headers.get("x-test-tenant-id");
      if (explicitTenant && explicitTenant.length > 0 && explicitTenant !== "null") {
        locals.tenantId = explicitTenant as DatabaseId;
      }
    }

    // 🛡️ Request-scoped tenant binding (early — refined after session/user load).
    // System/scheduler: use locals.dbAdapterUnscoped + bypassTenantCheck.
    // The tenant resolved before the session lookup is captured so the post-
    // user bind below is skipped when nothing changed (avoids a duplicate
    // tenant-injecting proxy wrap on every authenticated multi-tenant request).
    const preUserTenant = locals.tenantId as DatabaseId | null | undefined;
    {
      const bound = bindRequestDbAdapter(
        dbAdapter,
        locals.tenantId as DatabaseId,
        multiTenant || testMode,
      );
      locals.dbAdapter = bound.dbAdapter as any;
      (locals as any).dbAdapterUnscoped = bound.dbAdapterUnscoped;
      const tenantP = applyAdapterTenantContext(bound.dbAdapterUnscoped, locals.tenantId ?? null);
      if (tenantP) await tenantP;
    }

    const authHeader = event.request.headers.get("Authorization");
    const apiKey = event.request.headers.get("x-api-key");
    const websiteToken = event.request.headers.get("x-website-token");

    const sessionId = readSessionCookie(cookies, isSecure);

    // 🚀 ULTRA-FAST GUEST FAST PATH: No credentials at all on safe read request
    if (
      !sessionId &&
      !authHeader &&
      !apiKey &&
      !websiteToken &&
      (method === "GET" || method === "HEAD" || method === "OPTIONS")
    ) {
      const testSecret = event.request.headers.get("x-test-secret");
      const isPublicPath =
        url.pathname.startsWith("/api/collections") ||
        url.pathname.startsWith("/api/query") ||
        url.pathname.startsWith("/api/graphql") ||
        url.pathname.startsWith("/api/media");

      if (isPublicPath && !testSecret) {
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
        (locals as any).roles = ["guest"];
      } else {
        locals.user = null;
        (locals as any).roles = [];
        locals.permissions = [];
      }
      return await resolve(event);
    }
    if (sessionId) {
      // 🛡️ Guard: wrap session validation in try-catch so malformed/invalid session
      // cookies don't crash the server (integration tests inject poisoned values).
      try {
        if (logger.isEnabled("debug")) {
          logger.debug(`[Auth] SESSION: ${sessionId.slice(0, 12)}... path=${event.url.pathname}`);
        }
        metricsService.incrementAuthValidations();
        if (!auth) {
          logger.warn(`[Auth] Auth service NOT initialized! (sessionId: ${sessionId})`);
          return await resolve(event);
        }

        const turboCtx = getTurboAuthContext(sessionId as string);
        let user: User | null = null;
        let resolution: SessionResolution = { status: "invalid" };
        if (turboCtx) {
          user = turboCtx.user;
          resolution = { status: "ok", user };
          (locals as any).roles = turboCtx.roles;
          (locals as any)._rbacBitset = turboCtx.bitset;
        } else {
          resolution = await getUserFromSession(
            sessionId as string,
            locals.tenantId as DatabaseId,
            getClientIp(event),
            event.request.headers.get("user-agent") || "",
          );
          user = resolution.status === "ok" ? resolution.user : null;
        }
        logger.debug(
          `[Auth] getUserFromSession: ${user ? "FOUND " + maskEmail(user.email) + " (" + user.role + ")" : "NULL"} path=${event.url.pathname} tenantId=${locals.tenantId}`,
        );

        if (isDemoMode && !locals.tenantId && !user) {
          await handleDemoTenantAssignment(event, !!user);
          generateCsrfToken(cookies, isSecure);
        }

        if (user) {
          // --- NEW: Global Admin Exemption ---
          // Global admins (isAdmin AND no tenantId) are authorized to access
          // any tenant path. 🛡️ HARDENING: previously ANY user with a missing
          // tenantId (common after enabling multi-tenancy on an existing DB)
          // was treated as global admin — a privilege escalation. Now the role
          // must also be admin.
          const isGlobalAdmin = isAdmin(user) && (!user.tenantId || user.tenantId === null);
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
            clearAllSessionCookies(event);
            throw new AppError("Tenant isolation violation", 403, "FORBIDDEN_TENANT");
          }
          locals.user = user;
          locals.session_id = sessionId as DatabaseId;
          locals.permissions = user.permissions || [];
          if (!turboCtx && sessionId) {
            setTurboAuthContext(
              sessionId as string,
              user,
              (locals as any).roles || [],
              (locals as any)._rbacBitset || new Uint32Array(1),
              locals.tenantId || null,
            );
          }
          // Prefer host/header tenant; if only user.tenantId is set, bind that for MT.
          if (!locals.tenantId && user.tenantId) {
            locals.tenantId = user.tenantId as DatabaseId;
          }
          // Re-bind only when the tenant changed during user resolution (e.g.
          // hostname had no tenant and the user's tenantId was adopted). The
          // common case — hostname tenant == user tenant — keeps the first
          // binding and skips a redundant proxy wrap.
          if ((multiTenant || testMode) && locals.tenantId && locals.tenantId !== preUserTenant) {
            const bound = bindRequestDbAdapter(
              (locals as any).dbAdapterUnscoped || dbAdapter,
              locals.tenantId as DatabaseId,
              true,
            );
            locals.dbAdapter = bound.dbAdapter as any;
            const tenantP = applyAdapterTenantContext(
              bound.dbAdapterUnscoped,
              locals.tenantId ?? null,
            );
            if (tenantP) await tenantP;
          }
          await handleSessionRotation(event, user, sessionId);
        } else if (resolution.status === "invalid") {
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
          // Delete ALL session cookie variants — the incoming cookie may be
          // __Secure-/__Host-prefixed while cookieName resolved to a different
          // variant; leaving it behind creates an infinite invalid-cookie loop.
          clearAllSessionCookies(event);
        } else {
          // Transient (DB blip / in-flight coalesce): keep the cookie so the user
          // is NOT logged out by a momentary failure. Stay unauthenticated for
          // this request; the next request re-validates.
          logger.debug(
            `[Auth] Session validation transient (cookie kept): ${sessionId.slice(0, 12)}...`,
          );
        }
      } catch (err: unknown) {
        // Intentional security failures (tenant isolation, etc.) must surface as
        // 403/AppError — never soft-convert them into anonymous 200s.
        if (isAppError(err)) throw err;

        // 🛡️ Hardened: unexpected validation crashes (malformed cookie, DB blip,
        // service unavailable) are non-fatal. Log, clear the bad cookie, and
        // continue as unauthenticated rather than crashing the request.
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[Auth] Session validation failed for ${sessionId?.slice(0, 12) || "unknown"}: ${message}`,
          {
            cookieName,
            error: message,
            tenantId: locals.tenantId,
          },
        );
        metricsService.incrementAuthFailures();
        (locals as any).returningUser = true;
        clearAllSessionCookies(event);
      }
    } else {
      if (logger.isEnabled("debug")) {
        logger.debug(`[Auth] NO cookie found. path=${event.url.pathname} cookieName=${cookieName}`);
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

            // Batched usage statistics — aggregated in memory, flushed periodically.
            // getClientIp uses platform address only — never trust raw X-Forwarded-For
            const clientIp = getClientIp(event);
            recordApiKeyUsage(
              (cachedKeyData.user._id as string).replace("apikey:", ""),
              clientIp,
              locals.tenantId,
            );
          } else {
            metricsService.incrementAuthValidations();
            const res = await dbAdapter.auth.getApiKey(hash, {
              tenantId: locals.tenantId,
            });
            if (res.success && res.data) {
              const apiKey = res.data;

              // 1. Expiry Check
              if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()) {
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

                // Batched usage statistics — aggregated in memory, flushed periodically.
                // getClientIp uses platform address only — never trust raw X-Forwarded-For
                const clientIp = getClientIp(event);
                recordApiKeyUsage(apiKey._id, clientIp, locals.tenantId);

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
            const res = await dbAdapter.system.websiteTokens.getByTokenHash(tokenHash, {
              tenantId: locals.tenantId as DatabaseId,
              // Auth bootstrap: allow lookup when tenant not yet resolved (single-tenant)
              ...(locals.tenantId ? {} : { bypassTenantCheck: true }),
            });

            if (res.success && res.data) {
              const token = res.data;

              // 1. Expiry Check
              if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()) {
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
    const hasAuthAttempt = !!authHeader || !!readSessionCookie(cookies, isSecure);

    // Skip ephemeral guest creation for test-mode requests — they should hit the real 401 path
    const testSecret = event.request.headers.get("x-test-secret");
    if (!locals.user && !hasAuthAttempt && !testSecret) {
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
      async () => {
        // Full async tree can use getRequestDbAdapter() when tenant-bound.
        const bound = locals.dbAdapter as any;
        if (bound && typeof bound === "object" && "boundTenantId" in bound) {
          return runWithTenantAdapter(bound, () => resolve(event));
        }
        return resolve(event);
      },
    );
  } catch (err) {
    if (url.pathname.startsWith("/api/")) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};

// --- UTILITY EXPORTS ---

/**
 * Delete every session-cookie variant. The cookie that supplied the sessionId
 * may be __Secure-/__Host-prefixed while the configured name resolved to a
 * different variant — deleting only one leaves the invalid cookie behind and
 * the browser re-sends it on every request (infinite invalid-cookie loop).
 */
function clearAllSessionCookies(event: RequestEvent) {
  clearCookiesHelper(event.cookies, getCookiePath());
}

export function invalidateSessionCache(sessionId: string, tenantId?: DatabaseId | null): void {
  sessionCache.delete(sessionId);
  lastRefreshAttempt.delete(sessionId);
  lastRotationAttempt.delete(sessionId);
  lastAnomalyLog.delete(sessionId);
  negativeSessionCache.delete(sessionId);

  // 🚀 Turbo GET: Also invalidate the auth context cache so a revoked
  // session can't access cached API responses within the TTL window.
  invalidateTurboAuthContext(sessionId);

  // Invalidate global SessionStore
  getSessionManagerLazy()
    .then((mod) => {
      const store = mod.getDefaultSessionStore();
      if (store && typeof store.delete === "function") {
        store.delete(sessionId as DatabaseId).catch(() => {});
      }
    })
    .catch(() => {});

  const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
  cacheService.delete(cacheKey, tenantId ?? undefined).catch(() => {});
}

/**
 * Clear every in-memory session layer (LRU, refresh/rotation timers, anomaly
 * cooldowns, negative cache, cached tenancy flags). Used by tests and the
 * testing-API reset to restore a clean auth state.
 */
export function clearAllSessionCaches(): void {
  sessionCache.clear();
  turboAuthCache.clear();
  lastRefreshAttempt.clear();
  lastRotationAttempt.clear();
  lastAnomalyLog.clear();
  negativeSessionCache.clear();
  multiTenantCached = null;
  demoModeCached = null;
}

/**
 * Drop every cached session + turbo-auth context belonging to a user.
 * Profile edits (username/email/avatar) must be visible on the next reload;
 * cached user snapshots in the session LRU would otherwise serve the old
 * values for up to the session cache TTL.
 */
export function invalidateUserSessionCaches(userId: string): void {
  const id = String(userId);
  for (const [sessionId, entry] of sessionCache.entries()) {
    if (String(entry.user?._id ?? entry.user?.id ?? "") === id) {
      sessionCache.delete(sessionId);
      lastRefreshAttempt.delete(sessionId);
      lastRotationAttempt.delete(sessionId);
      lastAnomalyLog.delete(sessionId);
      negativeSessionCache.delete(sessionId);
      // Turbo GET serves cached responses via the per-session auth context —
      // drop it too or a warm context keeps serving the stale user.
      invalidateTurboAuthContext(sessionId);
    }
  }
}

/**
 * Prime the in-memory session cache AND turbo-auth in one shot.
 * Login/OIDC/setup used to only warm the session LRU — the first collection
 * create then missed the warm write lane and paid the full API_WRITE sequence.
 * Turbo is filled with the credential-free user snapshot; roles stay empty
 * here (handleAuthorization hydrates on miss). Write lane only needs isAdmin.
 */
export function primeSessionMemoryCache(
  sessionId: string,
  user: User,
  tenantId?: DatabaseId | null,
): void {
  // Targeted negative-entry removal (the session is now known-valid) — never
  // clear the whole negative cache for one session.
  negativeSessionCache.delete(sessionId);
  // Credential-free snapshot — the in-memory cache must never hold password
  // hashes, TOTP secrets, backup codes, or reset/refresh tokens.
  const safeUser = toSafeSessionUser(user);
  const entry: SessionCacheEntry = { user: safeUser, timestamp: Date.now() };
  setSessionInCache(sessionId, entry);
  const resolvedTenant = tenantId ?? (safeUser as User).tenantId ?? null;
  setTurboAuthContext(sessionId, safeUser, [], new Uint32Array(1), resolvedTenant);
}
