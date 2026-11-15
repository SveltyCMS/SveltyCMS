/**
 * @file src/services/cache/stale-window.ts
 * @description Pure stale-while-revalidate policy for cached list and GraphQL
 * response bodies. A write evicts the cached body, so the next read rebuilds it
 * (~2 ms in the mixed benchmark lane). An opt-in window allows a superseded
 * body to be served immediately while the background rebuild runs.
 *
 * This module performs no I/O and never touches the cache — it only decides how
 * large the window may be and whether a given entry is still servable.
 *
 * Features:
 * - `resolveStaleWindow()` normalizes number / numeric-string / missing input
 *   into a clamped policy (default OFF, 0 ms)
 * - `shouldServeStale()` fails closed on clock skew, non-finite ages and a
 *   disabled window (strict `age < window` bound)
 * - `staleResponseHeader()` discloses the applied window on stale responses
 * - Zero runtime imports, no `any`, deterministic — safe to call per request
 */

export interface StaleWindowPolicy {
  /** Effective window in ms. 0 means disabled (never serve stale). */
  windowMs: number;
  /** True when `windowMs > 0`. */
  enabled: boolean;
  /** Where the configured value came from, echoed for logs/diagnostics. */
  source: "env" | "setting" | "header" | "default";
}

/**
 * Hard ceiling — a misconfiguration must not turn into minutes of unbounded
 * staleness. A list body embeds the rows that were just written, so the window
 * is a visibility bound for readers, not a performance knob; 5 s is the most a
 * client may observe a superseded list before the rebuilt body takes over.
 */
export const MAX_STALE_WINDOW_MS: number = 5000;

function disabledPolicy(): StaleWindowPolicy {
  return { windowMs: 0, enabled: false, source: "default" };
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Normalize a configured value into a policy.
 *
 * Accepts a number, a numeric string, or undefined/null. Strings are attributed
 * to `env` (environment variables arrive as strings), numbers to `setting` (the
 * settings store keeps numbers); anything unusable falls back to `default`.
 * Never throws: unparsable, non-finite and negative values disable the window.
 */
export function resolveStaleWindow(raw: unknown): StaleWindowPolicy {
  const parsed = toFiniteNumber(raw);
  if (parsed === null || parsed <= 0) {
    return disabledPolicy();
  }
  return {
    windowMs: Math.min(parsed, MAX_STALE_WINDOW_MS),
    enabled: true,
    source: typeof raw === "number" ? "setting" : "env",
  };
}

/**
 * True when an entry built `entryAgeMs` ago may be served stale.
 * Clock skew (negative age) and non-finite ages fail closed, as does a
 * disabled policy.
 */
export function shouldServeStale(entryAgeMs: number, policy: StaleWindowPolicy): boolean {
  if (!policy.enabled) return false;
  if (!Number.isFinite(entryAgeMs)) return false;
  if (entryAgeMs < 0) return false;
  return entryAgeMs < policy.windowMs;
}

/**
 * Header value disclosed on a stale response, e.g. `stale; window=250`.
 * Returns null when the response is not stale or the window is disabled.
 */
export function staleResponseHeader(isStale: boolean, policy: StaleWindowPolicy): string | null {
  if (!isStale || !policy.enabled) return null;
  return `stale; window=${policy.windowMs}`;
}

/**
 * Parse an HTTP `Cache-Control` request header for opt-in SWR (`stale-while-revalidate`
 * or `max-stale`, in seconds per RFC 5861 / RFC 9111).
 *
 * Strict Read-After-Write remains the default when the header is absent or omits
 * a stale directive, and any `no-store`, `no-cache`, or `max-age=0` forces
 * strictness (returns a disabled policy). Clamped to `MAX_STALE_WINDOW_MS`.
 */
export function parseCacheControlStalePolicy(
  cacheControlHeader: string | null | undefined,
): StaleWindowPolicy {
  if (!cacheControlHeader) return disabledPolicy();
  const lower = cacheControlHeader.toLowerCase();
  if (lower.includes("no-store") || lower.includes("no-cache")) {
    return disabledPolicy();
  }
  const maxAgeMatch = /(?:^|,)\s*max-age\s*=\s*(\d+)/.exec(lower);
  if (maxAgeMatch && Number(maxAgeMatch[1]) === 0) {
    return disabledPolicy();
  }

  const swrMatch =
    /(?:^|,)\s*(?:stale-while-revalidate|max-stale)(?:\s*=\s*("?)([^",\s]+)\1)?(?:\s*,|$)/.exec(
      lower,
    );
  if (!swrMatch) return disabledPolicy();

  const rawSeconds = swrMatch[2];
  let windowMs = MAX_STALE_WINDOW_MS;
  if (rawSeconds !== undefined) {
    const seconds = Number(rawSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return disabledPolicy();
    }
    windowMs = Math.min(Math.round(seconds * 1000), MAX_STALE_WINDOW_MS);
  }
  return {
    windowMs,
    enabled: true,
    source: "header",
  };
}
