/**
 * @file src/utils/rate-limit/config.ts
 * @description Laedt und normalisiert die Bucket-Parameter aus der Umgebung.
 *
 * Konfigurationsvariablen (RATE_LIMIT_*):
 * - RATE_LIMIT_CAPACITY      Kapazitaet / Max-Burst (Default: 100)
 * - RATE_LIMIT_REFILL_PER_SEC Refill-Rate in Tokens/s (Default: die 1/60s-Fenster)
 * - RATE_LIMIT_WINDOW_MS     Fenster in ms (Kompatibilitaet, Default: 60000)
 * - RATE_LIMIT_MAX_REQUESTS  Kompatibiuitaet mit dem bestehenden In-Memory-Hook;
 *                            ueberschreibt CAPACITY, wenn gesetzt.
 * - RATE_LIMIT_REDIS_PING_MS Ping-Intervall des Redis-Detektors.
 * - REDIS_URL                Redis-Endpunkt (Default: redis://127.0.0.1:6379)
 *
 * Gibt ein normiertes BaseRateLimitConfig zurueck.
 */

import type { BaseRateLimitConfig } from "./adaptive";

const DEFAULT_CAPACITY = 100;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Anzahl Felder vor der Dezimalstelle (fuer Lesbarkeit im Log).
 */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadBaseRateLimitConfig(): BaseRateLimitConfig {
  // RATE_LIMIT_MAX_REQUESTS dominiert CAPACITY, sofern gesetzt (Kompabilität
  // mit dem bestehenden Hook und dessen Tests/E2E, die dieses Env setzen).
  const capacity = num(
    process.env.RATE_LIMIT_CAPACITY,
    num(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_CAPACITY),
  );

  const windowMs = num(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);

  // Refill-Rate: falls nicht gesetzt, nimmt sie an, dass der Bucket sich im
  // Fenster einmal komplett auffuellt. Also capacity / Fenster-Sekunden.
  const derivedRefill = capacity / (windowMs / 1000);
  const refillPerSecond = num(process.env.RATE_LIMIT_REFILL_PER_SEC, derivedRefill);

  return {
    capacity,
    refillPerSecond,
    maxRequests: capacity,
    windowMs,
  };
}

/** Helper fuer den Redis-Ping-Detektor aus der Umgebung. */
export function loadRedisPingMs(): number {
  return num(process.env.RATE_LIMIT_REDIS_PING_MS, 30_000);
}
