/**
 * @file src/utils/security/submission-guard.ts
 * @description
 * High-performance double-submit and replay protection guard for HTML forms.
 *
 * Implements:
 * - CSPRNG-backed RFC 9562 v7 submission ID generation
 * - Strict RFC 9562 v7 structure and nibble validation (version 7, variant 10xx)
 * - Thread-safe, bounded memory replay cache with 60-second sliding TTL
 * - Automatic lazy pruning to protect heap boundaries under concurrent load
 *
 * ### Token channel — explicit, never inferred
 * A submission token is accepted from exactly two places and nowhere else:
 *
 * 1. the request header `X-Submission-Guard: <v7-uuid>`
 * 2. the query parameter `_sub_token=<v7-uuid>`
 *
 * `_id` is NEVER a token channel: not from the URL, not from a form payload, not
 * from a JSON body. `_id` is SveltyCMS's record id — the collection builder
 * posts its collection id as `_id` and `saveCollection` reads it back with
 * `formData.get("_id")`. The earlier rule ("use the URL `_id` as a token when
 * the value happens to look like a UUIDv7") was still a heuristic: any route
 * that ever puts a record id in `?_id` would be throttled, and whether a request
 * was replay-protected depended on the shape of a client-chosen payload field.
 * With the explicit channels above the question "is this a token?" is answered
 * by which channel the client used, not by what the value looks like.
 *
 * ### Guarded vs. unguarded
 * A request that carries a token is replay-checked (replayed token -> 429).
 * A request that carries no token is simply NOT guarded: no error, no replay
 * bookkeeping, no inspection of the payload. A token that IS declared but is
 * empty, malformed, or contradicts the other channel fails closed with a 400 —
 * a claimed token is never silently ignored.
 *
 * ### Replay key scope
 * Entries are keyed `${tenantId}:${routeId}:${token}`, so two different forms
 * that happen to generate the same client-side token cannot collide.
 *
 * ### Features:
 * - zero external dependencies (pure Web Crypto + Bitwise checks)
 * - strict version/variant bitmask verification (rejects UUIDv1/v4 or non-standard tokens)
 * - atomic mark-and-test replay detection (O(1) Map operations)
 */

import { dev } from "$app/env";
import { generateUUID } from "@utils/native-utils";
import { constantTimeBufferEqual } from "@utils/security/constant-time";
import { logger } from "@utils/logger";

/** Replay cache entry duration in milliseconds (60s default). */
export const SUBMISSION_ID_TTL_MS = 60_000;

/** Hard ceiling on in-memory replay tokens before active lazy-pruning triggers. */
export const MAX_SUBMISSION_CACHE_ENTRIES = 10_000;

/** Timestamp map of seen submission IDs -> expiration timestamp in ms. */
const seenSubmissions = new Map<string, number>();

/**
 * Generates an RFC 9562 compliant version 7 UUID using native CSPRNG.
 * Safe for embedding in form hidden inputs `<input type="hidden" name="_id" value={submissionId} />`.
 */
export function generateSubmissionId(): string {
  return generateUUID();
}

/**
 * Validates whether a given token is a valid, RFC 9562 v7 UUID string.
 *
 * Checks:
 * 1. String of exactly 36 ASCII characters
 * 2. Hyphen positions at 8, 13, 18, and 23
 * 3. Version nibble at index 14 is exactly '7'
 * 4. Variant nibble at index 19 is '8', '9', 'a', 'b', 'A', or 'B' (RFC 4122 Variant 1)
 * 5. All other characters are valid hexadecimal characters [0-9a-fA-F]
 */
export function isValidSubmissionId(id: unknown): id is string {
  if (typeof id !== "string" || id.length !== 36) {
    return false;
  }

  // Check delimiter positions
  if (
    id.charCodeAt(8) !== 45 || // '-'
    id.charCodeAt(13) !== 45 ||
    id.charCodeAt(18) !== 45 ||
    id.charCodeAt(23) !== 45
  ) {
    return false;
  }

  // Check Version 7 nibble (index 14 must be '7')
  if (id.charCodeAt(14) !== 55) {
    return false;
  }

  // Check Variant nibble (index 19 must be 8, 9, a, b, A, B -> binary 10xx)
  const variantCode = id.charCodeAt(19);
  const isVariant =
    variantCode === 56 || // '8'
    variantCode === 57 || // '9'
    variantCode === 97 || // 'a'
    variantCode === 98 || // 'b'
    variantCode === 65 || // 'A'
    variantCode === 66; // 'B'
  if (!isVariant) {
    return false;
  }

  // Fast char-code verification of hex characters
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) continue;
    const c = id.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57; // 0-9
    const isLowerHex = c >= 97 && c <= 102; // a-f
    const isUpperHex = c >= 65 && c <= 70; // A-F
    if (!isDigit && !isLowerHex && !isUpperHex) {
      return false;
    }
  }

  return true;
}

/** Query parameter that carries the submission token: `_sub_token=<v7-uuid>`. */
export const SUBMISSION_TOKEN_PARAM = "_sub_token";

/** Request header that carries the submission token: `X-Submission-Guard: <v7-uuid>`. */
export const SUBMISSION_GUARD_HEADER = "x-submission-guard";

/**
 * Result of the guard decision.
 *
 * `engaged: false` means "this request carries no submission token" — the
 * request continues as an ordinary form post and is not replay-tracked.
 * `engaged: true` means the client declared a token on one of the two explicit
 * channels and the request must then pass format validation
 * (`submissionId` non-null and {@link isValidSubmissionId}) and the replay cache.
 */
export type SubmissionGuardDecision =
  | { engaged: false; reason: "no-token" }
  | { engaged: true; submissionId: string | null; reason: "token" | "conflict" };

/**
 * Decides whether the double-submit guard applies to this request.
 *
 * The decision is channel-based, never value-based:
 *
 * 1. Neither `X-Submission-Guard` nor `_sub_token` present -> not engaged. The
 *    request is not guarded at all (no error, no cache entry). Nothing in the
 *    URL or in the payload is inspected, so a `_id` record id cannot engage it.
 * 2. Exactly one channel present -> engaged with its value, which is then
 *    format-validated (empty or malformed -> 400, never "treated as payload").
 * 3. Both channels present with different values -> engaged with no id, i.e. a
 *    400: a request may not claim two different tokens.
 *
 * Costs one `URLSearchParams` lookup and, for token-carrying requests, the
 * 36-char scan; no body access at all.
 */
export function decideSubmissionGuard(
  searchParams: URLSearchParams,
  headerValue?: string | null,
): SubmissionGuardDecision {
  const hasQueryToken = searchParams.has(SUBMISSION_TOKEN_PARAM);
  const hasHeaderToken = headerValue !== null && headerValue !== undefined;

  if (!hasQueryToken && !hasHeaderToken) {
    return { engaged: false, reason: "no-token" };
  }

  const queryToken = hasQueryToken ? (searchParams.get(SUBMISSION_TOKEN_PARAM) ?? "").trim() : "";
  const headerToken = hasHeaderToken ? String(headerValue).trim() : "";

  // 🛡️ Constant-time: a token mismatch must not leak bytes through an early exit.
  if (
    queryToken &&
    headerToken &&
    !constantTimeBufferEqual(Buffer.from(queryToken), Buffer.from(headerToken))
  ) {
    return { engaged: true, submissionId: null, reason: "conflict" };
  }

  return { engaged: true, submissionId: queryToken || headerToken || null, reason: "token" };
}

/**
 * Builds the replay-cache key: `${tenantId}:${routeId}:${token}`.
 *
 * The token is client-chosen, so keying on it alone would let a token generated
 * for one form collide with the same token on another form/tenant/route. Scoping
 * by tenant and route keeps each form's replay window independent.
 *
 * @param tenantId Active tenant id, or null/undefined in single-tenant mode
 * @param routeId Route key (the request pathname)
 * @param token The validated RFC 9562 v7 submission token
 */
export function submissionReplayKey(
  tenantId: string | null | undefined,
  routeId: string,
  token: string,
): string {
  return `${tenantId || "default"}:${routeId}:${token}`;
}

/** Routes already warned about for a `_id` payload without a token (dev only). */
const warnedRoutes = new Set<string>();

/** Hard ceiling on warned routes so a long-lived dev server cannot grow unbounded. */
const MAX_WARNED_ROUTES = 500;

/**
 * Dev-time, once-per-route warning: a payload carrying `_id` was posted without
 * a submission token.
 *
 * This exists because the guard itself must never read the body to find out
 * (that is the whole point of the explicit-channel contract), so the only place
 * that legitimately knows the payload has an `_id` is the action that already
 * parsed it. Call it there, right after `await request.formData()`. Never
 * throws, never blocks, and does nothing in production.
 */
export function warnRecordIdWithoutToken(routeId: string, tenantId?: string | null): void {
  if (!dev) return;
  if (warnedRoutes.size >= MAX_WARNED_ROUTES) return;

  const routeKey = `${tenantId || "default"}:${routeId}`;
  if (warnedRoutes.has(routeKey)) return;
  warnedRoutes.add(routeKey);

  logger.warn(
    `[SubmissionGuard] ${routeId} received a payload field "_id" without a submission token. ` +
      `"_id" is a record id and is never treated as a token: send X-Submission-Guard: <uuidv7> ` +
      `or _sub_token=<uuidv7> (see generateSubmissionId) if this form needs replay protection.`,
  );
}

/**
 * Clears the once-per-route warning registry. Exposed for unit testing.
 */
export function clearSubmissionGuardWarnings(): void {
  warnedRoutes.clear();
}

/**
 * Records a submission in the replay cache.
 *
 * @param replayKey Key built with {@link submissionReplayKey}
 *                  (`${tenantId}:${routeId}:${token}`) — never a bare token, so
 *                  two forms cannot share an entry.
 * @param ttlMs Optional TTL override in milliseconds (defaults to 60,000ms)
 * @returns `true` if the submission was NOT previously seen (accepted),
 *          `false` if the ID was already recorded and has not yet expired (replay detected!).
 */
export function markSubmissionSeen(replayKey: string, ttlMs = SUBMISSION_ID_TTL_MS): boolean {
  const now = Date.now();

  const existingExpires = seenSubmissions.get(replayKey);
  if (existingExpires !== undefined) {
    if (now < existingExpires) {
      // Still active: Replay detected!
      return false;
    }
    // Expired entry: will be overwritten
    seenSubmissions.delete(replayKey);
  }

  // Lazy-prune expired items if capacity pressure is reached
  if (seenSubmissions.size >= MAX_SUBMISSION_CACHE_ENTRIES) {
    pruneExpiredSubmissions(now);
    // If still at capacity after pruning expired items, evict oldest FIFO item
    if (seenSubmissions.size >= MAX_SUBMISSION_CACHE_ENTRIES) {
      const oldestKey = seenSubmissions.keys().next().value;
      if (oldestKey) seenSubmissions.delete(oldestKey);
    }
  }

  seenSubmissions.set(replayKey, now + ttlMs);
  return true;
}

/**
 * Removes expired submission IDs from the internal replay cache.
 */
export function pruneExpiredSubmissions(now = Date.now()): number {
  let pruned = 0;
  for (const [key, expires] of seenSubmissions) {
    if (now >= expires) {
      seenSubmissions.delete(key);
      pruned++;
    }
  }
  return pruned;
}

/**
 * Clears the replay cache. Exposed for unit testing and test isolation.
 */
export function clearSubmissionReplayCache(): void {
  seenSubmissions.clear();
}

/**
 * Returns current statistics of the submission replay cache.
 */
export function getSubmissionCacheStats(): { size: number; maxCapacity: number } {
  return {
    size: seenSubmissions.size,
    maxCapacity: MAX_SUBMISSION_CACHE_ENTRIES,
  };
}
