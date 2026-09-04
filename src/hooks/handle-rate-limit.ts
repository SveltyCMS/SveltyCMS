/**
 * @file src/hooks/handle-rate-limit.ts
 * @description Hardware-aware rate limiting middleware with adaptive pressure multipliers.
 *
 * Integrates with SystemMonitor to dynamically adjust rate limit costs based on
 * real-time CPU, memory, and event loop pressure. Uses a fixed-window token bucket
 * per IP with configurable limits (window resets on expiry — NOT a sliding window).
 *
 * ### Features:
 * - Per-IP + per-tenant-hostname fixed-window rate limiting (adaptive pressure)
 * - **Two-tier token buckets**: per-IP (fine-grained) + per-tenant (aggregate)
 * - **Dedicated `/api/commerce` lane**: isolated buckets + tighter cap so guest
 *   cart/coupon/checkout floods cannot exhaust admin API quota (and vice versa)
 * - Per-tenant limit defaults to 10x the per-IP limit, preventing noisy-tenant starvation
 * - Sync client-key hashing (no async wasm on mutation hot path)
 * - Adaptive cost multiplier from SystemMonitor (0.8x idle → 2.0x critical)
 * - Mutation rejection when heap > 90%
 * - Content-negotiated 429: JSON for `/api/*` + Accept: json, HTML for browsers
 * - Skips setup/health/POST-only public paths
 * - Zero external dependencies (in-memory tracking)
 *
 * ### Security:
 * - Client IP via `getClientIp()` / `event.getClientAddress()` only — never trust
 *   raw `X-Forwarded-For` from the client (proxy must set address adapter)
 * - Fail-open: if SystemMonitor is unavailable, uses baseline 1.0x multiplier
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
import { getTenantIdFromHostname, isMultiTenantEnabled } from "@utils/tenant";
import {
  getPressureMultiplier,
  shouldRejectMutations,
  startSystemMonitor,
} from "@utils/system-monitor";
import { applyAllSecurityHeaders } from "./handle-security-headers";

// Eager start — snapshot loop runs in background; hot path stays fully sync
startSystemMonitor();

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000;
const MAX_TRACKED_BUCKETS = 10000;
const CLEANUP_INTERVAL_MS = 60_000;

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

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ─── State ────────────────────────────────────────────────────────────────

const _buckets = new Map<string, RateLimitEntry>();
const _tenantBuckets = new Map<string, RateLimitEntry>();

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

const LIMITER_CLEANUP_KEY = Symbol.for("svelty.limiter.cleanup");
const globalWithLimiter = globalThis as typeof globalThis & {
  [key: symbol]: ReturnType<typeof setInterval> | undefined;
};
if (typeof setInterval !== "undefined" && !globalWithLimiter[LIMITER_CLEANUP_KEY]) {
  globalWithLimiter[LIMITER_CLEANUP_KEY] = setInterval(() => {
    const now = Date.now();
    const windowMs = getWindowMs();
    for (const [key, entry] of _buckets) {
      if (now - entry.windowStart > windowMs * 2) {
        _buckets.delete(key);
      }
    }
    for (const [key, entry] of _tenantBuckets) {
      if (now - entry.windowStart > windowMs * 2) {
        _tenantBuckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof (globalWithLimiter[LIMITER_CLEANUP_KEY] as any)?.unref === "function") {
    (globalWithLimiter[LIMITER_CLEANUP_KEY] as any).unref();
  }
}

/**
 * LRU-correct bounded bucket update: delete-then-set so an active key's window
 * reset REFRESHES its iteration position. Without the refresh, busy keys
 * inserted early stay at the FRONT of the Map and get evicted first under
 * churn — resetting their counts mid-window (rate-limit bypass).
 */
function setBoundedBucket(
  map: Map<string, RateLimitEntry>,
  key: string,
  bucket: RateLimitEntry,
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
  const maxRequests = getMaxRequests(lane);

  // Get or create per-IP bucket (bounded: evicts oldest BEFORE insert)
  let bucket = _buckets.get(clientKey);
  if (!bucket || now - bucket.windowStart > getWindowMs()) {
    bucket = { count: 0, windowStart: now };
    setBoundedBucket(_buckets, clientKey, bucket);
  }

  // Sync SystemMonitor reads — no dynamic import / microtask on hot path
  let multiplier = 1.0;
  try {
    multiplier = getPressureMultiplier();

    // Reject mutations when heap is critically high
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
  } catch {
    // SystemMonitor not available — use baseline
  }

  // Apply adaptive cost: critical pressure makes each request count more.
  // Commerce coupon/pay/checkout consume extra tokens (guest brute-force).
  const cost = getLaneCost(pathname, Math.max(1, Math.round(multiplier)));
  bucket.count += cost;

  const remaining = Math.max(0, maxRequests - bucket.count);
  const resetTime = Math.ceil((bucket.windowStart + getWindowMs() - now) / 1000);

  // Per-IP rate limit exceeded
  if (bucket.count > maxRequests) {
    logger.warn(
      `[RateLimit] ${clientKey} exceeded limit (${bucket.count}/${maxRequests}, ${multiplier}x multiplier)`,
      { pathname, method },
    );
    return withSecurityHeaders(
      buildRateLimitResponse(event, {
        retryAfterSeconds: resetTime,
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
    const tenantMaxRequests = getTenantMaxRequests(lane);
    let tenantBucket = _tenantBuckets.get(tenantKey);
    if (!tenantBucket || now - tenantBucket.windowStart > getWindowMs()) {
      tenantBucket = { count: 0, windowStart: now };
      setBoundedBucket(_tenantBuckets, tenantKey, tenantBucket);
    }

    tenantBucket.count += cost;

    tenantRemaining = Math.max(0, tenantMaxRequests - tenantBucket.count);
    const tenantResetTime = Math.ceil((tenantBucket.windowStart + getWindowMs() - now) / 1000);

    if (tenantBucket.count > tenantMaxRequests) {
      logger.warn(
        `[RateLimit] Tenant ${tenantKey} exceeded limit (${tenantBucket.count}/${tenantMaxRequests}, ${multiplier}x multiplier)`,
        { pathname, method, tenant: tenantKey },
      );
      return withSecurityHeaders(
        buildRateLimitResponse(event, {
          retryAfterSeconds: tenantResetTime,
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
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(resetTime));
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
  _buckets.clear();
  _tenantBuckets.clear();
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

    // 1. IP rule check
    if (this._ipRule) {
      const key = hashClientKeySync(`ip:${rawIp}`);
      let b = this._buckets.get(key);
      if (!b || now - b.windowStart > this._ipRule.windowMs) {
        b = { count: 0, windowStart: now };
        setBoundedBucket(this._buckets, key, b);
      }
      b.count++;
      if (b.count > this._ipRule.max) {
        return { limited: true, reason: "IP" };
      }
    }

    // 2. IP + User-Agent rule check
    if (this._ipUaRule) {
      const ua = event.request.headers.get("user-agent") || "";
      const key = hashClientKeySync(`ipua:${rawIp}:${ua}`);
      let b = this._buckets.get(key);
      if (!b || now - b.windowStart > this._ipUaRule.windowMs) {
        b = { count: 0, windowStart: now };
        setBoundedBucket(this._buckets, key, b);
      }
      b.count++;
      if (b.count > this._ipUaRule.max) {
        return { limited: true, reason: "IPUA" };
      }
    }

    // 3. Cookie rule check
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
      let b = this._buckets.get(key);
      if (!b || now - b.windowStart > this._cookieRule.windowMs) {
        b = { count: 0, windowStart: now };
        setBoundedBucket(this._buckets, key, b);
      }
      b.count++;
      if (b.count > this._cookieRule.max) {
        return { limited: true, reason: "cookie" };
      }
    }

    return { limited: false };
  }

  public async clear(): Promise<void> {
    this._buckets.clear();
  }
}

export const EndpointRateLimiter = RateLimiter;
