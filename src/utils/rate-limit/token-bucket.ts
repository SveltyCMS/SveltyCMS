/**
 * @file src/utils/rate-limit/token-bucket.ts
 * @description Pure Token-Bucket-Algorithmus (keine Abhaengigkeiten).
 *
 * Kernel der Rate-Limiting-Engine. Rein funktional und deterministisch,
 * damit Unit-Tests ohne Redis/Netz/Zeit-Mocks laufen.
 *
 * Modell:
 * - `capacity`  = maximaler Burst (Anzahl sofort verfuegbarer Tokens).
 * - `refillPerSecond` = wie viele Tokens pro Sekunde nachgetankt werden.
 * - `tokens`    = aktuell verfuegbare Tokens.
 * - `lastRefillMs` = Zeitpunkt des letzten Refills (fuer die Refill-Mathematik).
 *
 * Ein Request ist erlaubt, wenn nach dem Refill >= 1 Token verfuegbar ist.
 * Bei Ablehnung (429) wird der Zustand bewusst NICHT veraendert, damit ein
 * Client nach dem Refill wieder zugelassen wird (fair, kein Double-Penalty).
 */

export interface TokenBucketConfig {
  /** Maximaler Burst = maximale Anzahl sofort verfuegbarer Tokens. */
  capacity: number;
  /** Refill-Rate in Tokens pro Sekunde. */
  refillPerSecond: number;
  /**
   * Fixed-Window-Modus (WAF-Paritaet): statt kontinuierlichem Refill wird der
   * Bucket erst nach Ablauf des Fensters KOMPLETT auf `capacity` zurueckgesetzt
   * (rate-limiter-flexible-Semantik: `duration` ohne `execEvenly`). Der Lockout
   * ist damit hart auf die Fensterlaenge begrenzt.
   */
  windowMs?: number;
}

export interface TokenBucketState {
  /** Aktuell verfuegbare Tokens (>= 0). */
  tokens: number;
  /** Zeitstempel (ms) des letzten Refills. */
  lastRefillMs: number;
}

export interface BucketResult {
  /** Ergebnis-Zustand (immer der korrekte Folgezustand). */
  state: TokenBucketState;
  /** Verfuegbare Tokens NACH diesem Schritt. */
  tokens: number;
  /** true, wenn der Request durch darf. */
  allowed: boolean;
  /** Sekunden bis wieder ein Token verfuegbar ist (nur bei allowed=false). */
  retryAfterSeconds: number;
}

/**
 * Refillt den Bucket basierend auf der verstrichenen Zeit und gibt den neuen
 * Zustand zurueck. Refill ist auf die Kapazitaet gedeckelt (kein Ueberlauf).
 */
export function refillBucket(
  state: TokenBucketState,
  nowMs: number,
  config: TokenBucketConfig,
): TokenBucketState {
  const elapsedMs = Math.max(0, nowMs - state.lastRefillMs);
  if (elapsedMs <= 0) return state;

  if (config.windowMs) {
    // Fixed-Window: kein Refill waehrend des Fensters; am Fensterende voller Reset.
    if (elapsedMs >= config.windowMs) {
      return { tokens: config.capacity, lastRefillMs: nowMs };
    }
    return state;
  }

  const refillAmount = (elapsedMs / 1000) * config.refillPerSecond;
  return {
    tokens: Math.min(config.capacity, state.tokens + refillAmount),
    lastRefillMs: nowMs,
  };
}

/**
 * Fuehrt einen Token-Bucket-Check aus: refill, dann entscheiden, ob ein Token
 * konsumiert werden kann. Bei `allowed === false` bleibt der Zustand UNVERAENDERT
 * (nur der Refill wird angewendet), damit kein bereits entleerter Bucket weiter
 * belastet wird und der Client nach dem Refill sauber wieder reinkommt.
 *
 * `overdraft` (WAF-Paritaet): Ablehnungen buchen trotzdem ab — der Saldo darf
 * negativ werden, damit ein uebergrosser Consume den Lockout verlaengert statt
 * ein kostenloser Retry zu sein (rate-limiter-flexible-Semantik).
 */
export function consumeToken(
  state: TokenBucketState,
  nowMs: number,
  config: TokenBucketConfig,
  cost = 1,
  overdraft = false,
): BucketResult {
  const refilled = refillBucket(state, nowMs, config);
  const c = Math.max(1, cost);

  if (refilled.tokens >= c) {
    const next: TokenBucketState = {
      tokens: refilled.tokens - c,
      lastRefillMs: refilled.lastRefillMs,
    };
    return {
      state: next,
      tokens: next.tokens,
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (overdraft) {
    // Ablehnung bucht trotzdem ab: Saldo darf negativ werden.
    const next: TokenBucketState = {
      tokens: refilled.tokens - c,
      lastRefillMs: refilled.lastRefillMs,
    };
    // Retry-Zeit: kontinuierlich = Defizit/Refill-Rate; Fenster = Rest des Fensters.
    const retryAfterSeconds = config.windowMs
      ? Math.max(1, Math.ceil((refilled.lastRefillMs + config.windowMs - nowMs) / 1000))
      : config.refillPerSecond > 0
        ? Math.max(1, Math.ceil((c - next.tokens) / config.refillPerSecond))
        : 60;
    return {
      state: next,
      tokens: next.tokens,
      allowed: false,
      retryAfterSeconds,
    };
  }

  // Ablehnung: Zeit bis genuegend Tokens (>= cost) vorhanden sind.
  const deficit = c - refilled.tokens;
  const retryAfterSeconds =
    config.refillPerSecond > 0 ? Math.max(1, Math.ceil(deficit / config.refillPerSecond)) : 60;

  return {
    state: refilled,
    tokens: refilled.tokens,
    allowed: false,
    retryAfterSeconds,
  };
}

/**
 * Erzeugt einen frischen, vollen Bucket (Burst = Kapazitaet).
 */
export function createBucket(config: TokenBucketConfig, nowMs: number): TokenBucketState {
  return {
    tokens: config.capacity,
    lastRefillMs: nowMs,
  };
}
