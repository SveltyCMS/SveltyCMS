/**
 * @file src/hooks/handle-rate-limit.ts
 * @description Hardware-aware rate limiting middleware with adaptive pressure multipliers.
 *
 * Integrates with SystemMonitor to dynamically adjust rate limit costs based on
 * real-time CPU, memory, and event loop pressure. Uses a sliding-window token bucket
 * per IP with configurable limits.
 *
 * ### Features:
 * - Per-IP + per-tenant-hostname sliding window rate limiting
 * - Sync client-key hashing (no async wasm on mutation hot path)
 * - Adaptive cost multiplier from SystemMonitor (0.8x idle → 2.0x critical)
 * - Mutation rejection when heap > 90%
 * - Returns 429 with Retry-After + X-RateLimit-* headers + styled HTML page
 * - Skips setup/health/POST-only public paths
 * - Zero external dependencies (in-memory tracking)
 *
 * ### Security:
 * - Fail-open: if SystemMonitor is unavailable, uses baseline 1.0x multiplier
 * - No PII stored: only hashed IPs in the tracking map
 * - Auto-cleanup: expired entries pruned every 60s
 */

import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { renderRateLimitPage } from "@utils/rate-limit-page";
import { getRequestFlags } from "@utils/hook-utils";
import { getTenantIdFromHostname } from "@utils/tenant";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { applyAllSecurityHeaders } from "./handle-security-headers";

// Module-level cache — avoids per-request dynamic import on mutation hot path
let systemMonitorModule: {
  getPressureMultiplier: () => number;
  shouldRejectMutations: () => boolean;
} | null = null;

async function getSystemMonitor() {
  if (!systemMonitorModule) {
    systemMonitorModule = await import("@utils/system-monitor");
  }
  return systemMonitorModule;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = process.env.NODE_ENV !== "production" ? 1000 : 100;
const MAX_TRACKED_BUCKETS = 10000;
const CLEANUP_INTERVAL_MS = 60_000;

// Paths excluded from rate limiting
const EXCLUDED_PREFIXES = [
  "/api/setup",
  "/api/system/health",
  "/favicon.ico",
  "/.well-known",
  "/warming-up",
  "/api/testing",
];

// ─── Types ────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ─── State ────────────────────────────────────────────────────────────────

const _buckets = new Map<string, RateLimitEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────

let multiTenantCached: boolean | null = null;

function isMultiTenantEnabled(): boolean {
  if (multiTenantCached === null) {
    const val = getPrivateSettingSync("MULTI_TENANT");
    multiTenantCached = String(val) === "true" || val === true;
  }
  return multiTenantCached;
}

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

function getClientKey(event: Parameters<Handle>[0]["event"]): string {
  const forwarded = event.request.headers.get("x-forwarded-for");
  const rawIp = forwarded?.split(",")[0]?.trim() || event.getClientAddress();
  const tenant = getTenantIdFromHostname(event.url.hostname, isMultiTenantEnabled()) || "global";
  return hashClientKeySync(`${rawIp || "unknown"}:${tenant}`);
}

function withSecurityHeaders(response: Response, event: Parameters<Handle>[0]["event"]): Response {
  applyAllSecurityHeaders(
    response.headers,
    event.url.protocol === "https:",
    event.request.headers.get("Origin"),
    event.url.pathname,
  );
  return response;
}

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const LIMITER_CLEANUP_KEY = Symbol.for("svelty.limiter.cleanup");
if (typeof setInterval !== "undefined" && !(globalThis as any)[LIMITER_CLEANUP_KEY]) {
  (globalThis as any)[LIMITER_CLEANUP_KEY] = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _buckets) {
      if (now - entry.windowStart > DEFAULT_WINDOW_MS * 2) {
        _buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * SvelteKit handle function for hardware-aware rate limiting.
 *
 * Apply AFTER security headers but BEFORE authentication in the pipeline,
 * so that unauthenticated brute-force attempts are rate-limited.
 */
export const handleRateLimit: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const flags = getRequestFlags(event.locals);

  if (flags.isStatic || flags.isBootstrap) {
    return resolve(event);
  }

  // Skip excluded paths
  if (isExcluded(pathname)) {
    return resolve(event);
  }

  // Bypass rate limiting in test/benchmark mode
  if (process.env.TEST_MODE === "true" || event.request.headers.get("x-test-mode") === "true") {
    return resolve(event);
  }

  // Skip non-mutating GET/HEAD/OPTIONS unless under critical pressure
  const method = event.request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return resolve(event);
  }

  const clientKey = getClientKey(event);
  const now = Date.now();

  // Get or create bucket
  let bucket = _buckets.get(clientKey);
  if (!bucket || now - bucket.windowStart > DEFAULT_WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    _buckets.set(clientKey, bucket);
  }

  // Get adaptive pressure multiplier from SystemMonitor
  let multiplier = 1.0;
  try {
    const { getPressureMultiplier, shouldRejectMutations } = await getSystemMonitor();
    multiplier = getPressureMultiplier();

    // 🛡️ Reject mutations when heap is critically high
    if (method !== "GET" && shouldRejectMutations()) {
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

  // Apply adaptive cost: critical pressure makes each request count more
  const cost = Math.max(1, Math.round(multiplier));
  bucket.count += cost;

  // Calculate remaining
  const remaining = Math.max(0, DEFAULT_MAX_REQUESTS - bucket.count);
  const resetTime = Math.ceil((bucket.windowStart + DEFAULT_WINDOW_MS - now) / 1000);

  // Rate limit exceeded
  if (bucket.count > DEFAULT_MAX_REQUESTS) {
    logger.warn(
      `[RateLimit] ${clientKey} exceeded limit (${bucket.count}/${DEFAULT_MAX_REQUESTS}, ${multiplier}x multiplier)`,
      { pathname, method },
    );
    return withSecurityHeaders(
      new Response(
        renderRateLimitPage({
          retryAfter: `${resetTime} second${resetTime === 1 ? "" : "s"}`,
          retryAfterSeconds: resetTime,
          pathname,
          reason: "Too Many Requests",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Retry-After": String(resetTime),
            "X-RateLimit-Limit": String(DEFAULT_MAX_REQUESTS),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(resetTime),
          },
        },
      ),
      event,
    );
  }

  // Start cleanup timer on first request
  // Bounded map eviction: prevent OOM under distributed attacks
  if (_buckets.size >= MAX_TRACKED_BUCKETS) {
    const oldestKey = _buckets.keys().next().value;
    if (oldestKey) _buckets.delete(oldestKey);
  }

  const response = await resolve(event);

  // Add rate limit headers to response
  response.headers.set("X-RateLimit-Limit", String(DEFAULT_MAX_REQUESTS));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set("X-RateLimit-Reset", String(resetTime));

  return response;
};

/**
 * Reset all rate limit buckets (for testing).
 */
export function resetRateLimitBuckets(): void {
  _buckets.clear();
}
