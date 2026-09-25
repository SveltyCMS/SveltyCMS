/**
 * @file src/utils/rate-limit/memory-store.ts
 * @description In-Memory-Fallback fuer Token-Bucket (lokal, ohne Redis).
 *
 * Wird genutzt, wenn Redis nicht erreichbar ist. Bounded (MAX_BUCKETS) mit
 * LRU-artigem Evict: aktive Keys werden ans Ende verschoben (delete-then-set),
 * damit viel benutzte Buckets nicht zuerst verdrängt werden (Bypass-Schutz).
 * Abgelaufene Keys (kein Refill-Intervall aktiv) werden periodisch bereinigt.
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

interface BucketEntry {
  state: TokenBucketState;
  lastActiveMs: number;
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

  /** Fuehrt checkAndConsume auf dem lokalen Bucket aus. */
  checkAndConsume(
    key: string,
    bucket: TokenBucketConfig,
    cost = 1,
    overdraft = false,
  ): MemoryConsumeResult {
    const now = Date.now();
    let entry = this.buckets.get(key);

    // Neuer Bucket → voll starten und konsumieren (kein Gratis-Token).
    if (!entry) {
      entry = { state: createBucket(bucket, now), lastActiveMs: now };
      this.evictIfFull();
      this.buckets.set(key, entry);
    }

    const result = consumeToken(entry.state, now, bucket, cost, overdraft);
    entry.state = result.state;
    entry.lastActiveMs = now;

    // Refresh Iterationsposition (LRU): aktive Keys ans Ende.
    this.buckets.delete(key);
    this.buckets.set(key, entry);

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
        this.buckets.set(key, { state, lastActiveMs: now });
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
