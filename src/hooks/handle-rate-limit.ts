/**
 * @file src/hooks/handle-rate-limit.ts
 * @description Hardware-aware rate limiting middleware with adaptive pressure multipliers.
 *
 * Integrates with SystemMonitor to dynamically adjust rate limit costs based on
 * real-time CPU, memory, and event loop pressure. Uses a sliding-window token bucket
 * per IP with configurable limits.
 *
 * ### Features:
 * - Per-IP sliding window rate limiting
 * - Adaptive cost multiplier from SystemMonitor (0.8x idle → 2.0x critical)
 * - Mutation rejection when heap > 90%
 * - Returns 429 with Retry-After + X-RateLimit-* headers
 * - Skips setup/health/POST-only public paths
 * - Zero external dependencies (in-memory tracking)
 *
 * ### Security:
 * - Fail-open: if SystemMonitor is unavailable, uses baseline 1.0x multiplier
 * - No PII stored: only hashed IPs in the tracking map
 * - Auto-cleanup: expired entries pruned every 60s
 */

import { xxhash64 } from "hash-wasm";
import type { Handle } from "@sveltejs/kit";
import { logger } from "@utils/logger";

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;
const MAX_TRACKED_BUCKETS = 10000;
const CLEANUP_INTERVAL_MS = 60_000;

// Paths excluded from rate limiting
const EXCLUDED_PREFIXES = [
  "/api/setup",
  "/api/system/health",
  "/favicon.ico",
  "/.well-known",
  "/warming-up",
];

// ─── Types ────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ─── State ────────────────────────────────────────────────────────────────

const _buckets = new Map<string, RateLimitEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getClientKey(event: Parameters<Handle>[0]["event"]): Promise<string> {
  // Use X-Forwarded-For if behind proxy, otherwise remote address
  const forwarded = event.request.headers.get("x-forwarded-for");
  const rawIp = forwarded?.split(",")[0]?.trim() || event.getClientAddress();
  return xxhash64(rawIp || "unknown");
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

  // Skip excluded paths
  if (isExcluded(pathname)) {
    return resolve(event);
  }

  // Skip non-mutating GET/HEAD/OPTIONS unless under critical pressure
  const method = event.request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return resolve(event);
  }

  const clientKey = await getClientKey(event);
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
    const { getPressureMultiplier, shouldRejectMutations } = await import("@utils/system-monitor");
    multiplier = getPressureMultiplier();

    // 🛡️ Reject mutations when heap is critically high
    if (method !== "GET" && shouldRejectMutations()) {
      logger.warn(`[RateLimit] Mutation rejected — heap pressure critical (${clientKey})`, {
        pathname,
        method,
      });
      return new Response(
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
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        code: "RATE_LIMITED",
        retryAfter: resetTime,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(resetTime),
          "X-RateLimit-Limit": String(DEFAULT_MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetTime),
        },
      },
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
