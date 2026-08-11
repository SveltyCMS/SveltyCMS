/**
 * @file src/utils/write-profiler.ts
 * @description Gated write-path profiler (PROFILE_WRITE=1). Logs span
 * timings to stderr so benchmark probes can attribute create/update latency.
 *
 * ### Features:
 * - zero overhead when PROFILE_WRITE is unset
 * - preserves synchronous return types for sync callbacks
 * - accurately logs timing even on thrown errors (sync & async)
 * - mark-based spans for sync + async work
 */

export const PROFILE_WRITE_ENABLED =
  typeof process !== "undefined" && process.env.PROFILE_WRITE === "1";

// ── Span collector ───────────────────────────────────────────────────────────
// Spans are ALSO retained in-process so benchmark runners can attach them to
// exportResult entries (trendable ledger fields), not just stderr noise.
let collectedSpans: { label: string; ms: number }[] = [];
const MAX_COLLECTED_SPANS = 500;

function collect(label: string, ms: number): void {
  if (collectedSpans.length >= MAX_COLLECTED_SPANS) collectedSpans.shift();
  collectedSpans.push({ label, ms });
}

/** Drain collected spans (benchmark exportResult attaches them to the entry). */
export function takeProfileSpans(): { label: string; ms: number }[] {
  const spans = collectedSpans;
  collectedSpans = [];
  return spans;
}

function log(label: string, ms: number): void {
  collect(label, ms);
  const message = `[WRITE-PROFILE] ${label}: ${ms.toFixed(3)}ms\n`;
  if (typeof process !== "undefined" && process.stderr?.write) {
    process.stderr.write(message);
  } else {
    console.warn(message.trim());
  }
}

/** Function overloads so sync callbacks keep sync return types. */
export function profileSpan<T>(label: string, fn: () => Promise<T>): Promise<T>;
export function profileSpan<T>(label: string, fn: () => T): T;
export function profileSpan<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
  if (!PROFILE_WRITE_ENABLED) return fn();

  const t0 = performance.now();
  let result: T | Promise<T>;

  try {
    result = fn();
  } catch (err) {
    // Log synchronous failures accurately before re-throwing
    log(label, performance.now() - t0);
    throw err;
  }

  // Thenable path: keep the async flow untouched, log when it settles.
  if (result instanceof Promise || (result && typeof (result as any).then === "function")) {
    return (result as Promise<T>).finally(() => {
      log(label, performance.now() - t0);
    });
  }

  // Synchronous path: log immediately and return the value directly —
  // never wrap a sync result in a Promise (would break sync callers).
  log(label, performance.now() - t0);
  return result;
}

/** Start a span; call the returned end function to close it. */
export function profileMark(label: string): () => void {
  if (!PROFILE_WRITE_ENABLED) return () => {};
  const t0 = performance.now();
  return () => log(label, performance.now() - t0);
}
