/**
 * @file src/hooks/handle-rate-limit.ts
 * @description Enterprise-grade hardware-aware rate limiting middleware with Token-Bucket burst management, Redis fallback, and adaptive throttling.
 *
 * Single mutation limiter: Redis L2 token buckets with in-memory fallback,
 * system-pressure EWMA (capacity shrink, not cost inflate), endpoint credits,
 * and RBAC/tenant-plan caches (no DB on this path).
 *
 * ### Features:
 * - **Token-Bucket Algorithm**: Continuous token replenishment for precise burst control (no window-boundary spikes)
 * - **Redis-Primary with Local Fallback**: Distributed token buckets in Redis L2, with automatic switch to local memory on Redis disconnect or timeout (>15ms)
 * - **Adaptive Throttling**: RBAC-seeded role tiers (Admin 10x, staff/guest 2x, anonymous 1x) × cached tenant plan × system-pressure scale
 * - **Two-tier token buckets**: per-IP (fine-grained) + per-tenant (aggregate)
 * - **Dedicated `/api/commerce` lane**: isolated buckets + tighter cap so guest
 *   cart/coupon/checkout floods cannot exhaust admin API quota (and vice versa)
 * - Per-tenant limit defaults to 10x the per-IP limit, preventing noisy-tenant starvation
 * - Sync client-key hashing (no async wasm on mutation hot path)
 * - Zero-tax hot path: instantaneous sync fallback when Redis is unconfigured or unavailable
 * - Mutation rejection when heap > 90%
 * - Content-negotiated 429: JSON for `/api/*` + Accept: json, HTML for browsers
 * - Skips setup/health/POST-only public paths
 *
 * ### Security:
 * - Client IP via `getClientIp()` / `event.getClientAddress()` only — never trust
 *   raw `X-Forwarded-For` from the client (proxy must set address adapter)
 * - Fail-open: if pressure monitor is off, scale stays 1.0
 * - No PII stored: only hashed IPs in the tracking map
 * - Auto-cleanup: expired entries pruned every 60s
 * - Mutable header injection via `withMutableHeaders` (immutable Response safety)
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { renderRateLimitPage } from "@utils/rate-limit-page";
import {
  getClientIp,
  getRequestFlags,
  prefersJsonResponse,
  withMutableHeaders,
  IS_TEST_MODE,
} from "@utils/hook-utils";
import { getTenantIdFromHostname } from "@utils/tenant";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { getEndpointCost } from "@utils/rate-limit/endpoint-cost";
import { velocityCostMultiplier } from "@utils/rate-limit/request-velocity";
import {
  shouldRejectMutations,
  startPressureMonitor,
  getPressureScale,
} from "@utils/rate-limit/system-pressure";
import { resolveUserTier } from "@utils/rate-limit/adaptive";
import { getTenantPlanScale } from "@utils/rate-limit/tenant-plan";
import { initRateLimiter, rateLimit, resetRateLimitStores } from "@utils/rate-limit";
import {
  getSessionCookieName,
  isAdmin,
  isSecureCookieContext,
  SESSION_COOKIE_NAME,
} from "@src/databases/auth/constants";

// Eager start — EWMA loop + Redis connect (fail-open to memory)
startPressureMonitor();
void initRateLimiter();

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000;
const MAX_TRACKED_BUCKETS = 10000;

type RateLimitLane = "commerce" | "default";

const COMMERCE_PREFIX = "/api/commerce";

/** Coupon brute-force / checkout spam costs more than a cart line update. */
const COMMERCE_SENSITIVE_PREFIXES = [
  "/api/commerce/coupon",
  "/api/commerce/pay",
  "/api/commerce/checkout",
  "/api/commerce/confirm",
] as const;
const COMMERCE_SENSITIVE_COST = 4;

function getRateLimitLane(pathname: string): RateLimitLane {
  return pathname.startsWith(COMMERCE_PREFIX) ? "commerce" : "default";
}

function isCommerceSensitive(pathname: string): boolean {
  for (let i = 0; i < COMMERCE_SENSITIVE_PREFIXES.length; i++) {
    if (pathname.startsWith(COMMERCE_SENSITIVE_PREFIXES[i])) return true;
  }
  return false;
}

/**
 * Dynamically resolves the per-IP mutation ceiling on every check — module-load
 * evaluation froze process.env.RATE_LIMIT_MAX_REQUESTS (test harnesses and
 * benchmark runners set it at runtime after this module is loaded).
 *
 * Commerce is a public guest lane: default is 40% of the general ceiling
 * (`RATE_LIMIT_COMMERCE_MAX_REQUESTS` overrides). Benchmarks that raise
 * `RATE_LIMIT_MAX_REQUESTS` therefore raise commerce too unless they set the
 * commerce env explicitly.
 */
function getMaxRequests(lane: RateLimitLane = "default"): number {
  const general =
    Number(process.env.RATE_LIMIT_MAX_REQUESTS) ||
    (process.env.NODE_ENV !== "production" ? 1000 : 100);
  if (lane !== "commerce") return general;
  const explicit = Number(process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS);
  if (explicit > 0) return explicit;
  return Math.max(1, Math.floor(general * 0.4));
}

/** Aggregate tenant ceiling (10x the per-IP ceiling for that lane). */
function getTenantMaxRequests(lane: RateLimitLane = "default"): number {
  return getMaxRequests(lane) * 10;
}

/**
 * Dynamically resolves the rate-limit window on every check — mirror of
 * `getMaxRequests`. Benchmarks set `RATE_LIMIT_WINDOW_MS` at runtime to make
 * cooldown/recovery tests deterministic instead of waiting the 60s default.
 */
function getWindowMs(): number {
  const configured = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_MS;
}

function getLaneCost(pathname: string, pressureCost: number): number {
  return isCommerceSensitive(pathname) ? pressureCost * COMMERCE_SENSITIVE_COST : pressureCost;
}

// Paths excluded from rate limiting
const EXCLUDED_PREFIXES = [
  "/api/setup",
  "/api/system/health",
  "/favicon.ico",
  "/.well-known",
  "/api/testing",
];

// ─── Types ────────────────────────────────────────────────────────────────

export interface TokenBucketEntry {
  tokens: number;
  lastRefill: number;
  capacity: number;
}

export type RateLimitEntry = TokenBucketEntry;

export interface AdaptiveUserTier {
  role: string;
  multiplier: number;
}

function checkMemoryTokenBucket(
  map: Map<string, TokenBucketEntry>,
  key: string,
  capacity: number,
  windowMs: number,
  cost: number,
  now: number,
): { allowed: boolean; remaining: number; resetTime: number; retryAfterSeconds: number } {
  let bucket = map.get(key);
  const refillRatePerMs = capacity / windowMs;

  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now, capacity };
    setBoundedBucket(map, key, bucket);
  } else {
    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.capacity = capacity;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRatePerMs);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    const remaining = Math.max(0, Math.floor(bucket.tokens));
    const used = capacity - bucket.tokens;
    const resetTime = Math.max(1, Math.ceil(used / (capacity / (windowMs / 1000))));
    return { allowed: true, remaining, resetTime, retryAfterSeconds: 0 };
  } else {
    const missing = cost - bucket.tokens;
    const retryAfterSeconds = Math.max(1, Math.ceil(missing / (capacity / (windowMs / 1000))));
    return { allowed: false, remaining: 0, resetTime: retryAfterSeconds, retryAfterSeconds };
  }
}

// ─── Adaptive User Profile Resolution ──────────────────────────────────────

export function peekSessionUserSync(sessionId: string): any | null {
  const peeker = (globalThis as any)[Symbol.for("svelty.session.peeker")];
  if (typeof peeker === "function") {
    try {
      return peeker(sessionId);
    } catch {
      return null;
    }
  }
  return null;
}

const TIER_CAP_MULTIPLIER: Record<string, number> = {
  admin: 10,
  staff: 2,
  guest: 2,
  anonymous: 1,
};

export function resolveAdaptiveUserTier(event: RequestEvent): AdaptiveUserTier {
  const localUser = (event.locals as { user?: { role?: string; isAdmin?: boolean } } | undefined)
    ?.user;
  const peeked = (): { role?: string; isAdmin?: boolean } | null => {
    try {
      const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
      const cookieName = getSessionCookieName(isSecure);
      const sessionId = event.cookies.get(cookieName) || event.cookies.get(SESSION_COOKIE_NAME);
      return sessionId ? peekSessionUserSync(sessionId) : null;
    } catch {
      return null;
    }
  };
  const user = localUser ?? peeked();
  const tier = resolveUserTier({
    role: user?.role,
    isAdmin: user ? isAdmin(user) : false,
    userId: user ? "session" : null,
  });
  return { role: tier, multiplier: TIER_CAP_MULTIPLIER[tier] ?? 1 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Fast sync hash for rate-limit bucket keys (not cryptographic). */
function hashClientKeySync(input: string): string {
  if (typeof Bun !== "undefined" && typeof Bun.hash === "function") {
    return Bun.hash(input).toString(16);
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Bucket key from platform-resolved client IP + tenant host.
 * Uses getClientIp (getClientAddress) — never raw X-Forwarded-For.
 */
function getClientKey(event: RequestEvent, lane: RateLimitLane): string {
  const rawIp = getClientIp(event);
  const tenant = getTenantIdFromHostname(event.url.hostname, isMultiTenantEnabled()) || "global";
  return hashClientKeySync(`${rawIp || "unknown"}:${tenant}:${lane}`);
}

/**
 * Derive the tenant key for per-tenant rate limit bucketing.
 * Returns null when multi-tenancy is disabled or the request isn't bound to a
 * tenant — a single shared "global" aggregate bucket would let concurrent
 * users exhaust ONE bucket and 429 the entire site (site-wide lockout DoS).
 */
function getTenantKey(event: RequestEvent, lane: RateLimitLane): string | null {
  if (!isMultiTenantEnabled()) return null;
  const tenant = getTenantIdFromHostname(event.url.hostname, true);
  return tenant && tenant !== "global" ? `${tenant}:${lane}` : null;
}

function withSecurityHeaders(response: Response, event: RequestEvent): Response {
  return withMutableHeaders(response, (headers) => {
    applyAllSecurityHeaders(
      headers,
      event.url.protocol === "https:",
      event.request.headers.get("Origin"),
      event.url.pathname,
    );
  });
}

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Build a 429 body that matches the client (JSON API vs browser HTML). */
function buildRateLimitResponse(
  event: RequestEvent,
  opts: {
    retryAfterSeconds: number;
    limit: number;
    reason: string;
    scope?: "ip" | "tenant";
    lane: RateLimitLane;
  },
): Response {
  const { retryAfterSeconds, limit, reason, scope, lane } = opts;
  const headers: Record<string, string> = {
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(retryAfterSeconds),
    "X-RateLimit-Lane": lane,
  };
  if (scope === "tenant") headers["X-RateLimit-Scope"] = "tenant";

  if (prefersJsonResponse(event)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: reason,
        code: "RATE_LIMITED",
        retryAfter: retryAfterSeconds,
        lane,
        ...(scope ? { scope } : {}),
      }),
      {
        status: 429,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      },
    );
  }

  return new Response(
    renderRateLimitPage({
      retryAfter: `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`,
      retryAfterSeconds,
      pathname: event.url.pathname,
      reason,
    }),
    {
      status: 429,
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

/**
 * LRU-correct bounded bucket update: delete-then-set so an active key's window
 * reset REFRESHES its iteration position. Without the refresh, busy keys
 * inserted early stay at the FRONT of the Map and get evicted first under
 * churn — resetting their counts mid-window (rate-limit bypass).
 */
function setBoundedBucket(
  map: Map<string, TokenBucketEntry>,
  key: string,
  bucket: TokenBucketEntry,
): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= MAX_TRACKED_BUCKETS) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, bucket);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * SvelteKit handle function for hardware-aware rate limiting.
 *
 * Apply AFTER security headers but BEFORE authentication in the pipeline,
 * so that unauthenticated brute-force attempts are rate-limited.
 */
export const handleRateLimit: Handle = async ({ event, resolve }) => {
  // Skip non-mutating GET/HEAD/OPTIONS immediately (mutations only)
  const method = event.request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return resolve(event);
  }

  const pathname = event.url.pathname;
  const flags = getRequestFlags(event.locals);

  if (flags.isStatic || flags.isBootstrap) {
    return resolve(event);
  }

  // Skip excluded paths
  if (isExcluded(pathname)) {
    return resolve(event);
  }

  // Bypass rate limiting only in explicit test environments (E2E/integration).
  // A validated x-test-secret alone NO LONGER bypasses rate limiting — benchmark
  // runs measure production semantics and must pay the same cost as real traffic.
  const clientIp = getClientIp(event);
  const isLocal =
    clientIp === "127.0.0.1" || clientIp === "::1" || event.url.hostname === "localhost";
  if (isLocal && IS_TEST_MODE) {
    return resolve(event);
  }

  const lane = getRateLimitLane(pathname);
  const clientKey = getClientKey(event, lane);
  const now = Date.now();

  // 🚀 ADAPTIVE THROTTLING: dynamic bucket capacity scaled by user profile/role
  const userTier = resolveAdaptiveUserTier(event);
  const tenantId = isMultiTenantEnabled()
    ? getTenantIdFromHostname(event.url.hostname, true)
    : null;
  const pressureScale = getPressureScale(
    userTier.role === "admin"
      ? "admin"
      : userTier.role === "staff"
        ? "staff"
        : userTier.role === "guest"
          ? "guest"
          : "anonymous",
  );
  const planScale = getTenantPlanScale(tenantId);
  const baseMaxRequests = getMaxRequests(lane);
  const maxRequests = Math.max(
    1,
    Math.round(baseMaxRequests * userTier.multiplier * pressureScale * planScale),
  );

  if (shouldRejectMutations()) {
    logger.warn(`[RateLimit] Mutation rejected — heap pressure critical (${clientKey})`, {
      pathname,
      method,
    });
    return withSecurityHeaders(
      new Response(
        JSON.stringify({
          error: "Service temporarily unavailable due to high system load",
          code: "HEAP_PRESSURE",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      ),
      event,
    );
  }

  const endpointCost = getEndpointCost(pathname);
  const velocity = userTier.role === "admin" ? 1 : velocityCostMultiplier(clientKey, now);
  const cost = getLaneCost(pathname, Math.max(1, Math.round(endpointCost * velocity)));

  const windowMs = getWindowMs();
  const refillPerSecond = maxRequests / (windowMs / 1000);
  const ipDecision = await rateLimit({
    context: {},
    namespace: `ip:${clientKey}`,
    cost,
    record: true,
    base: {
      capacity: maxRequests,
      refillPerSecond,
      maxRequests,
      windowMs,
    },
  });
  const ipResult = {
    allowed: ipDecision.allowed,
    remaining: ipDecision.remaining,
    retryAfterSeconds: ipDecision.retryAfterSeconds,
    resetTime: ipDecision.retryAfterSeconds,
  };

  // Per-IP rate limit exceeded
  if (!ipResult.allowed) {
    logger.warn(
      `[RateLimit] ${clientKey} exceeded limit (${ipResult.remaining}/${maxRequests}, pressure ${pressureScale}, role: ${userTier.role})`,
      { pathname, method },
    );
    return withSecurityHeaders(
      buildRateLimitResponse(event, {
        retryAfterSeconds: ipResult.retryAfterSeconds,
        limit: maxRequests,
        reason: "Too Many Requests",
        scope: "ip",
        lane,
      }),
      event,
    );
  }

  // ─── Per-Tenant Bucket Check (multi-tenant only) ──────────────────────
  // Aggregate tenant limit independent of individual IP limits — prevents one
  // noisy tenant from starving others when each IP stays under the IP cap.
  // Skipped entirely when multi-tenancy is off: a single shared aggregate
  // bucket is a site-wide 429 DoS vector, not a protection.

  const tenantKey = getTenantKey(event, lane);
  let tenantRemaining = maxRequests;

  if (tenantKey) {
    const baseTenantMax = getTenantMaxRequests(lane);
    const tenantMaxRequests = Math.max(1, Math.round(baseTenantMax * pressureScale * planScale));
    const tenantWindowMs = getWindowMs();
    const tenantDecision = await rateLimit({
      context: {},
      namespace: `tenant:${tenantKey}`,
      cost,
      record: false,
      base: {
        capacity: tenantMaxRequests,
        refillPerSecond: tenantMaxRequests / (tenantWindowMs / 1000),
        maxRequests: tenantMaxRequests,
        windowMs: tenantWindowMs,
      },
    });
    const tenantResult = {
      allowed: tenantDecision.allowed,
      remaining: tenantDecision.remaining,
      retryAfterSeconds: tenantDecision.retryAfterSeconds,
    };

    tenantRemaining = tenantResult.remaining;

    if (!tenantResult.allowed) {
      logger.warn(
        `[RateLimit] Tenant ${tenantKey} exceeded limit (${tenantResult.remaining}/${tenantMaxRequests}, pressure ${pressureScale})`,
        { pathname, method, tenant: tenantKey },
      );
      return withSecurityHeaders(
        buildRateLimitResponse(event, {
          retryAfterSeconds: tenantResult.retryAfterSeconds,
          limit: tenantMaxRequests,
          reason: "Too Many Requests — tenant limit reached",
          scope: "tenant",
          lane,
        }),
        event,
      );
    }
  }

  const response = await resolve(event);

  // Clone headers — resolve() Responses are often immutable
  return withMutableHeaders(response, (headers) => {
    headers.set("X-RateLimit-Limit", String(maxRequests));
    headers.set("X-RateLimit-Remaining", String(ipResult.remaining));
    headers.set("X-RateLimit-Reset", String(ipResult.resetTime));
    headers.set("X-RateLimit-Lane", lane);
    // Tenant telemetry only meaningful when a tenant bucket actually exists.
    if (tenantKey) {
      headers.set("X-RateLimit-Tenant-Remaining", String(tenantRemaining));
    }
  });
};

/**
 * Reset all rate limit buckets (for testing).
 */
export function resetRateLimitBuckets(): void {
  resetRateLimitStores();
}

// ─── Targeted Endpoint & Action Rate Limiter ───────────────────────────────

export type RateUnit = "ms" | "s" | "m" | "h" | "d";
export type RateTuple = [number, RateUnit] | [number, string] | [number, number];

export interface CookieRateLimitOptions {
  name: string;
  secret?: string;
  rate?: RateTuple;
  preflight?: boolean;
}

export interface RateLimiterOptions {
  IP?: RateTuple;
  IPUA?: RateTuple;
  cookie?: CookieRateLimitOptions;
  rates?: {
    IP?: RateTuple;
    IPUA?: RateTuple;
    cookie?: CookieRateLimitOptions;
  };
  maxRequests?: number;
  windowMs?: number;
}

function parseRateTuple(rate?: RateTuple): { max: number; windowMs: number } | null {
  if (!rate || !Array.isArray(rate) || rate.length < 2) return null;
  const count = Number(rate[0]) || 1;
  const unit = rate[1];
  let windowMs = DEFAULT_WINDOW_MS;
  if (typeof unit === "number") {
    windowMs = unit;
  } else if (typeof unit === "string") {
    switch (unit.toLowerCase()) {
      case "ms":
        windowMs = 1;
        break;
      case "s":
        windowMs = 1000;
        break;
      case "m":
        windowMs = 60_000;
        break;
      case "h":
        windowMs = 3600_000;
        break;
      case "d":
        windowMs = 86400_000;
        break;
      default:
        windowMs = 60_000;
        break;
    }
  }
  return { max: count, windowMs };
}

/**
 * Lightweight, zero-dependency endpoint & action rate limiter.
 * Replaces external `sveltekit-rate-limiter` with unified IP resolution and fast sync hashing.
 */
export class RateLimiter {
  private _buckets = new Map<string, RateLimitEntry>();
  private _ipRule: { max: number; windowMs: number } | null;
  private _ipUaRule: { max: number; windowMs: number } | null;
  private _cookieRule: { name: string; max: number; windowMs: number } | null = null;

  constructor(options: RateLimiterOptions = {}) {
    const ipRate = options.IP ?? options.rates?.IP;
    this._ipRule = parseRateTuple(ipRate);

    const ipUaRate = options.IPUA ?? options.rates?.IPUA;
    this._ipUaRule = parseRateTuple(ipUaRate);

    const cookieOpts = options.cookie ?? options.rates?.cookie;
    if (cookieOpts?.name) {
      const parsed = parseRateTuple(cookieOpts.rate) ?? { max: 100, windowMs: DEFAULT_WINDOW_MS };
      this._cookieRule = {
        name: cookieOpts.name,
        max: parsed.max,
        windowMs: parsed.windowMs,
      };
    }

    if (!this._ipRule && !this._ipUaRule && !this._cookieRule) {
      this._ipRule = {
        max: options.maxRequests ?? 100,
        windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
      };
    }
  }

  public async isLimited(event: RequestEvent, _extraData?: unknown): Promise<boolean> {
    const res = await this.check(event);
    return res.limited;
  }

  public async check(
    event: RequestEvent,
    _extraData?: unknown,
  ): Promise<{ limited: boolean; reason?: "IP" | "IPUA" | "cookie" | string }> {
    const now = Date.now();
    const rawIp = getClientIp(event) || "unknown";

    // 1. IP rule check (Token-Bucket)
    if (this._ipRule) {
      const key = hashClientKeySync(`ip:${rawIp}`);
      const res = checkMemoryTokenBucket(
        this._buckets,
        key,
        this._ipRule.max,
        this._ipRule.windowMs,
        1,
        now,
      );
      if (!res.allowed) {
        return { limited: true, reason: "IP" };
      }
    }

    // 2. IP + User-Agent rule check (Token-Bucket)
    if (this._ipUaRule) {
      const ua = event.request.headers.get("user-agent") || "";
      const key = hashClientKeySync(`ipua:${rawIp}:${ua}`);
      const res = checkMemoryTokenBucket(
        this._buckets,
        key,
        this._ipUaRule.max,
        this._ipUaRule.windowMs,
        1,
        now,
      );
      if (!res.allowed) {
        return { limited: true, reason: "IPUA" };
      }
    }

    // 3. Cookie rule check (Token-Bucket)
    if (this._cookieRule) {
      let cookieVal = event.cookies.get(this._cookieRule.name);
      if (!cookieVal) {
        cookieVal = hashClientKeySync(`${rawIp}:${now}`);
        try {
          event.cookies.set(this._cookieRule.name, cookieVal, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: event.url.protocol === "https:",
          });
        } catch {}
      }
      const key = hashClientKeySync(`cookie:${this._cookieRule.name}:${cookieVal}`);
      const res = checkMemoryTokenBucket(
        this._buckets,
        key,
        this._cookieRule.max,
        this._cookieRule.windowMs,
        1,
        now,
      );
      if (!res.allowed) {
        return { limited: true, reason: "cookie" };
      }
    }

    return { limited: false };
  }

  public async clear(): Promise<void> {
    this._buckets.clear();
  }
}
