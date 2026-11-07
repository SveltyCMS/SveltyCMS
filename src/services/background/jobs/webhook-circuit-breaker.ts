/**
 * @file src/services/background/jobs/webhook-circuit-breaker.ts
 * @description Process-local per-origin circuit breaker for queued webhook delivery.
 *
 * The job queue retries a failed delivery with a 2^n minute backoff, but every
 * queued job for a dead endpoint still performs its own request. This breaker
 * keys on `new URL(url).origin` and short-circuits requests for 60 s after 5
 * consecutive retryable failures, so one outage cannot be multiplied into a
 * stream of doomed outbound calls by the rest of the queue.
 *
 * Process-local by design: each server instance owns its `Map`, so instances
 * trip and recover independently (the queue remains the shared retry source of
 * truth). No timers, no I/O, no dependencies — the clock is injected via the
 * `now` parameter so the state machine is deterministic under test.
 *
 * Features:
 * - 5 consecutive retryable failures open the circuit for 60 s
 * - Half-open state admits exactly one probe request
 * - A lost probe is presumed stale after one window (no permanent wedge)
 * - Permanent failures (other 4xx) never trip the breaker
 * - Test-only `resetWebhookCircuitBreaker()` hook
 */

export const WEBHOOK_BREAKER_THRESHOLD = 5;
export const WEBHOOK_BREAKER_OPEN_MS = 60_000;

export type WebhookFailureKind = "retryable" | "permanent";

export interface WebhookRequestTicket {
  /** Normalized key (`new URL(url).origin`); the raw URL when unparseable. */
  origin: string;
  /** True when this call claimed the single half-open probe. */
  probe: boolean;
}

type BreakerPhase = "closed" | "open" | "half-open";

interface BreakerEntry {
  phase: BreakerPhase;
  /** Consecutive retryable failures; only meaningful while `closed`. */
  consecutiveRetryableFailures: number;
  /** Epoch ms when the circuit entered `open`; `null` while closed. */
  openedAt: number | null;
  /** Epoch ms when the single half-open probe was claimed; `null` when none. */
  probeStartedAt: number | null;
}

const circuits = new Map<string, BreakerEntry>();

/**
 * Derives the breaker key. Unparseable URLs are not tracked: `safeFetch` owns
 * URL validation and already reports them as a retryable transport error, so
 * the breaker fails open instead of masking that contract.
 */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    // catch-allow: the only failure mode is an unparseable URL, handled above.
    return null;
  }
}

function circuitOpenError(origin: string, retryAt: number): Error {
  return new Error(
    `RETRYABLE_ERROR: CIRCUIT_OPEN ${origin} until ${new Date(retryAt).toISOString()}`,
  );
}

/**
 * Gatekeeper called before every outbound webhook request.
 *
 * @returns A ticket when the caller may proceed. `probe: true` marks the single
 *   half-open probe that is allowed through to test the endpoint.
 * @throws `RETRYABLE_ERROR: CIRCUIT_OPEN <origin> until <iso>` while the circuit
 *   is open, or while another half-open probe is still in flight.
 */
export function beforeWebhookRequest(url: string, now: number = Date.now()): WebhookRequestTicket {
  const origin = originOf(url);
  if (!origin) return { origin: url, probe: false };

  const entry = circuits.get(origin);
  if (!entry || entry.phase === "closed") return { origin, probe: false };

  if (entry.phase === "open") {
    const retryAt = (entry.openedAt ?? now) + WEBHOOK_BREAKER_OPEN_MS;
    if (now < retryAt) throw circuitOpenError(origin, retryAt);

    entry.phase = "half-open";
    entry.consecutiveRetryableFailures = 0;
    entry.probeStartedAt = now;
    return { origin, probe: true };
  }

  // Half-open: exactly one probe at a time. One whose outcome was never
  // recorded (worker crash, unexpected throw) is presumed lost after a full
  // window so the origin cannot stay wedged forever.
  const probeStartedAt = entry.probeStartedAt;
  if (probeStartedAt !== null && now - probeStartedAt < WEBHOOK_BREAKER_OPEN_MS) {
    throw circuitOpenError(origin, probeStartedAt + WEBHOOK_BREAKER_OPEN_MS);
  }

  entry.probeStartedAt = now;
  return { origin, probe: true };
}

/** Closes the circuit for the origin (a reachable, healthy endpoint). */
export function recordWebhookSuccess(url: string): void {
  const origin = originOf(url);
  if (origin) circuits.delete(origin);
}

/**
 * Records the outcome of a request that was admitted by `beforeWebhookRequest`.
 *
 * Only `retryable` failures count toward the threshold. A `permanent` failure
 * (an unusable payload the endpoint rejects) says nothing about origin health,
 * so it never trips the breaker; as a completed half-open probe it still proves
 * the endpoint is reachable and closes the circuit.
 */
export function recordWebhookFailure(
  url: string,
  kind: WebhookFailureKind,
  now: number = Date.now(),
): void {
  const origin = originOf(url);
  if (!origin) return;

  const entry = circuits.get(origin);

  if (kind === "permanent") {
    if (entry?.phase === "half-open") circuits.delete(origin);
    return;
  }

  if (entry?.phase === "open") {
    // Straggler admitted before the circuit opened — keep the original
    // deadline instead of extending the outage window.
    return;
  }

  if (entry?.phase === "half-open") {
    // Failed probe → reopen for a fresh window starting now.
    entry.phase = "open";
    entry.openedAt = now;
    entry.probeStartedAt = null;
    return;
  }

  const next = entry ?? {
    phase: "closed" as const,
    consecutiveRetryableFailures: 0,
    openedAt: null,
    probeStartedAt: null,
  };
  next.consecutiveRetryableFailures += 1;
  if (next.consecutiveRetryableFailures >= WEBHOOK_BREAKER_THRESHOLD) {
    next.phase = "open";
    next.openedAt = now;
    next.probeStartedAt = null;
  }
  circuits.set(origin, next);
}

/** Test hook: clears all per-origin state. */
export function resetWebhookCircuitBreaker(): void {
  circuits.clear();
}
