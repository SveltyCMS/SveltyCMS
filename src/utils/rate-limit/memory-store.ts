/**
 * @file src/utils/rate-limit/memory-store.ts
 * @description In-Memory-Fallback fuer Token-Bucket (lokal, ohne Redis).
 *
 * Wird genutzt, wenn Redis nicht erreichbar ist. Bounded (MAX_BUCKETS) mit
 * LRU-artigem Evict: aktive Keys werden ans Ende der Insertion-Reihenfolge
 * verschoben, damit viel benutzte Buckets nicht zuerst verdrängt werden
 * (Bypass-Schutz). Der Re-Insert ist gedrosselt (nur jeder LRU_REFRESH_EVERY-te
 * Touch) — spart die 2 Map-Operationen (delete+set) pro Request; der
 * Eviction-Kandidat ist dadurch um hoechstens LRU_REFRESH_EVERY-1 Touches
 * veraltet, was fuer die Heuristik unkritisch ist (prune() raeumt exakt per
 * lastActiveMs auf). Abgelaufene Keys werden periodisch bereinigt.
 */

import { logger } from "@utils/logger";
import {
  consumeToken,
  createBucket,
  type TokenBucketConfig,
  type TokenBucketState,
} from "./token-bucket";

const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

/** Leerer Bucket = verwaist; wird nach dieser Zeit ohne Nutzung entfernt. */
const IDLE_EVICT_MS = 10 * 60_000;

/**
 * LRU-Refresh-Drossel: die Iterationsposition wird nur alle N Touches per
 * delete+set aufgefrischt statt bei jedem Request (2 Map-Operationen → 2/N
 * amortisiert). Der aelteste Insertion-Key ist damit um hoechstens N-1
 * Touches veraltet — fuer die MAX_BUCKETS-Eviction-Heuristik unkritisch.
 */
const LRU_REFRESH_EVERY = 16;

interface BucketEntry {
  state: TokenBucketState;
  lastActiveMs: number;
  /** Touches seit dem letzten LRU-Re-Insert (s. LRU_REFRESH_EVERY). */
  touchesSinceRefresh: number;
}

export interface MemoryConsumeResult {
  allowed: boolean;
  tokens: number;
  retryAfterSeconds: number;
}

const CLEANUP_KEY = Symbol.for("svelty.ratelimit.memory.cleanup");

export class MemoryRateLimitStore {
  private buckets = new Map<string, BucketEntry>();

  constructor() {
    // Lazy-Singleton-Cleanup (unref, damit er Prozess-Nein-Exit nicht blockiert).
    const g = globalThis as typeof globalThis & {
      [key: symbol]: ReturnType<typeof setInterval> | undefined;
    };
    if (typeof setInterval !== "undefined" && !g[CLEANUP_KEY]) {
      g[CLEANUP_KEY] = setInterval(() => this.prune(), CLEANUP_INTERVAL_MS);
      if (typeof (g[CLEANUP_KEY] as any)?.unref === "function") {
        (g[CLEANUP_KEY] as any).unref();
      }
    }
  }

  /**
   * Fuehrt checkAndConsume auf dem lokalen Bucket aus.
   *
   * `nowMs`: optionaler durchgereichter Timestamp (ein `Date.now()` pro
   * Request im Engine-Pfad); weggelassen wird er hier bestimmt — die
   * Bucket-Mathematik bleibt identisch.
   */
  checkAndConsume(
    key: string,
    bucket: TokenBucketConfig,
    cost = 1,
    overdraft = false,
    nowMs = Date.now(),
  ): MemoryConsumeResult {
    const now = nowMs;
    let entry = this.buckets.get(key);

    // Neuer Bucket → voll starten und konsumieren (kein Gratis-Token).
    if (!entry) {
      entry = { state: createBucket(bucket, now), lastActiveMs: now, touchesSinceRefresh: 0 };
      this.evictIfFull();
      this.buckets.set(key, entry);
    }

    const result = consumeToken(entry.state, now, bucket, cost, overdraft);
    entry.state = result.state;
    entry.lastActiveMs = now;

    // LRU-Refresh gedrosselt (s. LRU_REFRESH_EVERY): statt delete+set pro
    // Request nur alle N Touches. Frische Eintraege stehen bereits am Ende.
    entry.touchesSinceRefresh += 1;
    if (entry.touchesSinceRefresh >= LRU_REFRESH_EVERY) {
      entry.touchesSinceRefresh = 0;
      this.buckets.delete(key);
      this.buckets.set(key, entry);
    }

    return {
      allowed: result.allowed,
      tokens: result.tokens,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  /** Setzt alles zurueck (Tests). */
  reset(): void {
    this.buckets.clear();
  }

  /** Anzahl der aktuell getrackten Buckets. */
  size(): number {
    return this.buckets.size;
  }

  /** Serialisiert alle Buckets (Shutdown-Persistenz, WAF-Dump). */
  dump(): Record<string, TokenBucketState> {
    const out: Record<string, TokenBucketState> = {};
    for (const [key, entry] of this.buckets) {
      out[key] = entry.state;
    }
    return out;
  }

  /** Serialisiert nur Buckets mit dem angegebenen Key-Praefix (z.B. WAF-Scope). */
  dumpWithPrefix(prefix: string): Record<string, TokenBucketState> {
    const out: Record<string, TokenBucketState> = {};
    for (const [key, entry] of this.buckets) {
      if (key.startsWith(prefix)) out[key] = entry.state;
    }
    return out;
  }

  /** Stellt Buckets aus einem frueheren dump() wieder her. */
  restore(data: Record<string, TokenBucketState>): void {
    const now = Date.now();
    for (const [key, state] of Object.entries(data)) {
      if (typeof state?.tokens === "number" && typeof state?.lastRefillMs === "number") {
        this.buckets.set(key, { state, lastActiveMs: now, touchesSinceRefresh: 0 });
      }
    }
  }

  private evictIfFull(): void {
    if (this.buckets.size < MAX_BUCKETS) return;
    const oldest = this.buckets.keys().next().value;
    if (oldest !== undefined) this.buckets.delete(oldest);
  }

  /** Entfernt verwaiste (inaktive) Buckets. */
  private prune(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.buckets) {
      if (now - entry.lastActiveMs > IDLE_EVICT_MS) {
        this.buckets.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`[RateLimit] ${removed} inaktive In-Memory-Buckets bereinigt`);
    }
  }
}
