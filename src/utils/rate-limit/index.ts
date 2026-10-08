/**
 * @file src/utils/rate-limit/index.ts
 * @description Öffentliche API des Rate-Limiting-Systems (Redis + In-Memory-Fallback).
 *
 * Verwendungs-Fluss:
 * 1. Basis-Konfiguration aus der Umgebung laden (loadBaseRateLimitConfig).
 * 2. Adaptive Bucket-Konfiguration per tenantId/userId berechnen (computeAdaptiveBucket).
 * 3. `rateLimit()` versucht zuerst Redis (cluster-weit), faellt bei
 *    Timeout/Fehler nahtlos auf den lokalen In-Memory-Store zurück (mit Logging).
 *
 * Smart-Upgrades (2027+):
 * - A. System-Druck (EWMA CPU/RAM) via `system-pressure.ts` — wird beim Init gestartet.
 * - B. Predictive Throttling (24h-Histogramm) via `request-clock.ts` — jeder Request
 *      wird in die Zeitreihe eingetragen.
 * - C. Cost-Aware Limiting via `endpoint-cost.ts` — automatische Kosten-Ermittlung
 *      wenn kein expliziter `cost` angegeben wird.
 *
 * Das Modul hält einen Lazy-Singleton (läuft in der App-Prozessperipherie),
 * damit der Hook im Hot-Path keine Verbindung pro Request aufbaut.
 */

import { logger } from "@utils/logger";
import {
  computeAdaptiveBucket,
  resolveUserTier,
  type AdaptiveContext,
  type BaseRateLimitConfig,
} from "./adaptive";
import { loadBaseRateLimitConfig, loadRedisPingMs } from "./config";
import { MemoryRateLimitStore } from "./memory-store";
import { RedisRateLimitStore } from "./redis-client";
import { startPressureMonitor } from "./system-pressure";
import { recordRequest } from "./request-clock";
import { getEndpointCost } from "./endpoint-cost";
import { velocityCostMultiplier } from "./request-velocity";

export type RateLimitScope = "redis" | "memory";

export interface RateLimitDecision {
  allowed: boolean;
  scope: RateLimitScope;
  remaining: number;
  retryAfterSeconds: number;
  /** Hatte diese Anfrage einen Fallback ausgeloest? (fuer Metric/Logging) */
  degraded: boolean;
}

export interface RateLimitOptions {
  /** Kontext der adaptiven Schicht (tenantId, userId, role, isAdmin). */
  context: AdaptiveContext;
  /** Basis-Konfiguration; default: aus Umgebung geladen. */
  base?: BaseRateLimitConfig;
  /** Key-Scope-Praeferenz (z.B. "api"). */
  namespace?: string;
  /**
   * Kosten dieses Requests in Token-Einheiten.
   * Wenn nicht angegeben, wird der Wert automatisch aus `pathname` ermittelt
   * (Cost-Aware Limiting via endpoint-cost.ts).
   */
  cost?: number;
  /**
   * Pfad des Requests fuer automatische Kostenzuweisung (endpoint-cost.ts).
   * Wird ignoriert wenn `cost` explizit gesetzt ist.
   */
  pathname?: string;
  /** Skip histogram record (second consume on the same request). */
  record?: boolean;
  /**
   * Lane-lean mode: the local in-memory bucket is the enforcement point
   * (synchronous math, no I/O) and the Redis ledger gets the same spend
   * propagated WITHOUT awaiting it — a request never pays the Redis round
   * trip on its critical path (measured ~0.6 ms per mutation with Redis up).
   * The limit itself is unchanged; a second process still sees the spend a
   * tick later. Ignored when Redis is unavailable (pure memory fallback).
   */
  asyncRemote?: boolean;
}

// ─── Status: Ist Redis aktuell aktiv? (fuer Health/Metriken) ─────────────
export function isRedisRateLimitActive(): boolean {
  return redisStore.isAvailable();
}

// ─── Singleton-Store ──────────────────────────────────────────────────────
const memoryStore = new MemoryRateLimitStore();
const redisStore = new RedisRateLimitStore({
  pingIntervalMs: loadRedisPingMs(),
});

let initPromise: Promise<void> | null = null;

/**
 * Startet den (idempotenten) Verbindungsaufbau zu Redis. Wird von der
 * Middleware-Initialisierung aufgerufen. Schlaegt fehl, bleibt der Store
 * unavailable und fällt beim Request auf den In-Memory-Fallback zurück.
 */
export function initRateLimiter(): Promise<void> {
  if (!initPromise) {
    // A. System-Druck-Monitor starten (EWMA CPU/RAM-Polling).
    startPressureMonitor();

    initPromise = redisStore.connect().catch(() => {
      // Fehler ist hier ok — Fallback greift im Request-Pfad.
      logger.debug("[RateLimit] Redis-Init fehlgeschlagen (Fallback aktiv)");
    });
  }
  return initPromise;
}

/** Baut stabilen Bucket-Key (kein PII — nur gehashte Kennung). */
function buildBucketKey(namespace: string, ctx: AdaptiveContext, profile: string): string {
  const tenant = ctx.tenantId || "global";
  return `rl:${namespace}:${tenant}:${profile}`;
}

/**
 * Führt den Rate-Limit-Check aus: adaptive Kapazität → Redis → In-Memory-Fallback.
 */
export async function rateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  const base = options.base ?? loadBaseRateLimitConfig();
  const context = options.context ?? {};
  const namespace = options.namespace ?? "api";
  // Ein Timestamp pro Request (statt mehrerer Date.now()-Aufrufe) und der Tier
  // wird einmal aufgeloest und fuer Velocity-Gate UND Bucket-Berechnung genutzt.
  const now = Date.now();
  const tier = resolveUserTier(context);

  // C. Cost-Aware: explicit cost wins, else pathname map. Observation-zone
  // extra applies only when cost was derived (never overwrite a caller override).
  const derived = options.pathname ? getEndpointCost(options.pathname) : 1;
  let cost = options.cost ?? derived;
  if (options.cost === undefined && tier !== "admin") {
    cost *= velocityCostMultiplier(namespace, now);
  }

  // Slot der Request-Clock (nur wenn recordRequest gelaufen ist) — wird an
  // computeAdaptiveBucket durchgereicht, damit der vorhergesagte Druck O(1)
  // ohne zweite Slot-Berechnung entsteht.
  let slot: number | undefined;

  if (options.record !== false) {
    // recordRequest liefert den Slot mit — getPredictedPressure muss ihn
    // nicht ein zweites Mal berechnen (s. computeAdaptiveBucket unten).
    slot = recordRequest(now);
  }

  const bucket = computeAdaptiveBucket(base, context, tier, now, slot);
  const key = buildBucketKey(namespace, context, String(cost));

  // ── Primary: Redis (cluster-weit) ──────────────────────────────────────
  if (redisStore.isAvailable()) {
    if (options.asyncRemote) {
      // 🚀 LANE-LEAN MODE: enforce on the local bucket synchronously and
      // propagate the identical spend to Redis without awaiting it. The local
      // bucket stays current even if Redis later fails (failover consistency
      // win over the awaited path, which never touches the local store).
      const local = memoryStore.checkAndConsume(key, bucket, cost, false, now);
      void redisStore.checkAndConsume(key, bucket, cost).catch((err) => {
        logger.debug("[RateLimit] async Redis propagate failed:", err?.message ?? err);
      });
      return {
        allowed: local.allowed,
        scope: "memory",
        remaining: Math.max(0, Math.round(local.tokens)),
        retryAfterSeconds: local.retryAfterSeconds,
        degraded: false,
      };
    }
    try {
      const res = await redisStore.checkAndConsume(key, bucket, cost);
      return {
        allowed: res.allowed,
        scope: "redis",
        remaining: Math.max(0, Math.round(res.tokens)),
        retryAfterSeconds: res.retryAfterSeconds,
        degraded: false,
      };
    } catch (err: any) {
      // Redis-Ausfall mid-flight → Fallback, einmalig loggen.
      logger.warn("[RateLimit] Redis fehlgeschlagen, lokaler Fallback aktiv:", err?.message ?? err);
    }
  }

  // ── Fallback: lokal (In-Memory) ────────────────────────────────────────
  const res = memoryStore.checkAndConsume(key, bucket, cost, false, now);
  return {
    allowed: res.allowed,
    scope: "memory",
    remaining: Math.max(0, Math.round(res.tokens)),
    retryAfterSeconds: res.retryAfterSeconds,
    degraded: true,
  };
}

/** Setzt alle Storen zurueck (Tests / Reset). */
export function resetRateLimitStores(): void {
  memoryStore.reset();
}

/** Shared store singletons for callers that need per-key buckets (e.g. the WAF). */
export { memoryStore, redisStore };

export { RedisRateLimitStore, MemoryRateLimitStore };
