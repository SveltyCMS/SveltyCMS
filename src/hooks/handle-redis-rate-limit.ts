/**
 * @file src/hooks/handle-redis-rate-limit.ts
 * @description Redis-Token-Bucket-Middleware mit In-Memory-Fallback für /api-Routen.
 *
 * Ergänzt den bestehenden In-Memory-Pressure-Hook um eine echte
 * Cluster-weite Token-Bucket-Engine (Primary Redis, Fallback lokal).
 *
 * Ablauf:
 * 1. Nur /api-Pfade (konfigurierbar), überspringt Setup/Health/Testing.
 * 2. Extrahiert tenantId + userId + Rolle aus event.locals (frühere Auth-Hooks).
 * 3. Berechnet adaptive Kapazität und ruft `rateLimit()` (Redis → Memory-Fallback).
 * 4. Bei allowed=false: 429 (JSON für /api, HTML für Browser) mit RateLimit-Headern.
 * 5. Bei allowed=true: RateLimit-Header an die Antwort anhängen.
 *
 * WICHTIG: Fail-open — wenn weder Redis noch lokal verfügbar sind, wird der
 * Request DURCHGELASSEN (Verfügbarkeit vor Block durch Fehler, nicht durch Limit).
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { renderRateLimitPage } from "@utils/rate-limit-page";
import {
  initRateLimiter,
  isRedisRateLimitActive,
  rateLimit,
  type RateLimitDecision,
} from "@utils/rate-limit";
import { getClientIp, prefersJsonResponse, withMutableHeaders } from "@utils/hook-utils";

// ─── Konfiguration ────────────────────────────────────────────────────────
const API_PREFIX = "/api";
const WINDOW_MS = 60_000;

/** Pfade, die vom Limit ausgenommen werden (Setup/Warmup/Health/Testing). */
const EXCLUDED_PREFIXES = [
  "/api/setup",
  "/api/system/health",
  "/api/testing",
  "/favicon.ico",
  "/.well-known",
];

/** Request-Methoden, die KEINE Mutations kosten (GET darf unlimitiert lesen). */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Redis beim Prozessstart verbinden (fire-and-forget) — der Request-Pfad blockiert
// NICHT auf dem Connect (sonst ~1s Stall beim ersten Request, wenn Redis fehlt).
initRateLimiter().catch(() => {
  // Fail-open: Init-Fehler ist ok, Request-Pfad faellt auf In-Memory zurueck.
});

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Extrahiert den adaptiven Kontext aus event.locals (früher gesetzte Auth-Daten). */
function extractContext(event: RequestEvent) {
  const locals = event.locals as any;
  const user = locals?.user ?? null;
  return {
    tenantId: locals?.tenantId ?? user?.tenantId ?? null,
    userId: user?._id ?? user?.id ?? null,
    role: user?.role ?? null,
    isAdmin: locals?.isAdmin ?? user?.isAdmin ?? false,
  };
}

/** Baut eine 429-Response mit den passenden Headern. */
function build429(event: RequestEvent, decision: RateLimitDecision, limit: number): Response {
  const headers: Record<string, string> = {
    "Retry-After": String(decision.retryAfterSeconds),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(decision.retryAfterSeconds),
    "X-RateLimit-Scope": decision.scope,
  };

  if (prefersJsonResponse(event)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too Many Requests",
        code: "RATE_LIMITED",
        retryAfter: decision.retryAfterSeconds,
        scope: decision.scope,
      }),
      {
        status: 429,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    renderRateLimitPage({
      retryAfter: `${decision.retryAfterSeconds} second${decision.retryAfterSeconds === 1 ? "" : "s"}`,
      retryAfterSeconds: decision.retryAfterSeconds,
      pathname: event.url.pathname,
      reason: "Too Many Requests",
    }),
    {
      status: 429,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

/**
 * SvelteKit-Handle-Funktion für das Redis-basierte Rate-Limiting.
 * Wird NACH der Authentifizierung angewendet, damit tenantId/role verfügbar sind.
 */
export const handleRedisRateLimit: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  // Nur /api schützen; Ausnahmen überspringen.
  if (!pathname.startsWith(API_PREFIX) || isExcluded(pathname)) {
    return resolve(event);
  }

  // Read-Methoden kostenlos (Brute-Force-Szenario sind Mutations).
  if (READ_METHODS.has(event.request.method)) {
    return resolve(event);
  }

  // Opt-in: der verteilte Limiter ist nur aktiv, wenn er ausdruecklich
  // eingeschaltet ist (RATE_LIMIT_DISTRIBUTED_ENABLED=true). Grund: der Bucket
  // haengt an der Quell-IP — in Integrations-/E2E-/Benchmark-Laeufen kommen
  // alle Requests von 127.0.0.1, wodurch ein gemeinsamer Bucket die Suite nach
  // ~100 Mutationen kollektiv mit 429 abwuergt. Ohne Redis und ohne dieses
  // Flag bleibt der bestehende lokale Limiter (handle-rate-limit.ts) zustaendig.
  if (process.env.RATE_LIMIT_DISTRIBUTED_ENABLED !== "true") {
    return resolve(event);
  }

  const context = extractContext(event);
  const clientIp = getClientIp(event);
  const namespace = `ip:${clientIp}`;

  try {
    const decision = await rateLimit({
      context,
      namespace,
      cost: 1,
    });

    const limit = 100; // Basis-Limit für Header (adaptiv bereits in Kapazität eingerechnet).

    if (!decision.allowed) {
      logger.warn(`[RedisRateLimit] ${namespace} überschritten (${decision.scope})`, {
        pathname,
        method: event.request.method,
        tier: context.role ?? "guest",
      });
      return build429(event, decision, limit);
    }

    const response = await resolve(event);
    return withMutableHeaders(response, (headers) => {
      headers.set("X-RateLimit-Limit", String(limit));
      headers.set("X-RateLimit-Remaining", String(Math.max(0, decision.remaining)));
      headers.set("X-RateLimit-Reset", String(Math.ceil(WINDOW_MS / 1000)));
      headers.set("X-RateLimit-Scope", decision.scope);
      headers.set("X-RateLimit-Redis", decision.scope === "redis" ? "1" : "0");
    });
  } catch (err) {
    // Fail-open: Fehler in der Engine dürfen keine API blockieren.
    logger.warn("[RedisRateLimit] Middleware-Fehler (fail-open):", (err as Error)?.message ?? err);
    return resolve(event);
  }
};

/** Für Health/Diagnose: ist Redis der aktive Store? */
export function getActiveRateLimitScope(): "redis" | "memory" {
  return isRedisRateLimitActive() ? "redis" : "memory";
}
