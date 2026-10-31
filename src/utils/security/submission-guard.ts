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
 * ### Token channel
 * The token is read from the request URL only (`_id=<v7-uuid>`), never from the
 * form body: `_id` is also the record-id field of every SveltyCMS form, so a
 * body `_id` cannot be told apart from payload without parsing the body — which
 * this guard must not do. Clients that want a malformed or missing token to be
 * rejected (instead of treated as ordinary payload) opt in with
 * `_submission_guard=1` or `X-Submission-Guard: 1`.
 *
 * ### Features:
 * - zero external dependencies (pure Web Crypto + Bitwise checks)
 * - strict version/variant bitmask verification (rejects UUIDv1/v4 or non-standard tokens)
 * - atomic mark-and-test replay detection (O(1) Map operations)
 */

import { generateUUID } from "@utils/native-utils";

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

/** Query parameter that explicitly opts a request into replay protection. */
export const SUBMISSION_GUARD_MARKER = "_submission_guard";

/** Request header that explicitly opts a request into replay protection. */
export const SUBMISSION_GUARD_HEADER = "x-submission-guard";

/**
 * Result of the guard decision.
 *
 * `engaged: false` means "this request carries no submission token" — the
 * request continues as an ordinary form post. `engaged: true` means the request
 * claims the double-submit contract and must then pass format validation
 * (`submissionId` non-null and {@link isValidSubmissionId}) and the replay cache.
 */
export type SubmissionGuardDecision =
  | { engaged: false; reason: "no-candidate" | "ordinary-id" }
  | { engaged: true; submissionId: string | null };

/**
 * Detects the explicit opt-in marker (`_submission_guard=1` query parameter or
 * `X-Submission-Guard: 1` header). Opted-in requests fail closed: a missing or
 * malformed token is a 400 instead of being ignored.
 */
export function isSubmissionGuardOptedIn(
  searchParams: URLSearchParams,
  headerValue?: string | null,
): boolean {
  return searchParams.get(SUBMISSION_GUARD_MARKER) === "1" || (headerValue ?? "").trim() === "1";
}

/**
 * Decides whether the double-submit guard applies to this request.
 *
 * The rule is deliberately value-based, because `_id` is a shared field name:
 *
 * 1. `_id` absent -> not engaged (nothing to protect; ordinary payload).
 * 2. `_id` is a valid v7 submission token -> engaged (replay-checked).
 * 3. `_id` is anything else (`posts`, `AuditNotes`, `audit-notes`, a v4 UUID)
 *    -> not engaged unless the request opted in, in which case it is engaged
 *    and then rejected by format validation. A payload `_id` must never be
 *    mistaken for a token, and a claimed token must never be silently ignored
 *    just because it is malformed.
 * 4. Opted in with no `_id` at all -> engaged with `submissionId: null`
 *    (fail closed).
 *
 * Costs one map lookup plus, for token-shaped values, the 36-char scan; no body
 * access at all.
 */
export function decideSubmissionGuard(
  searchParams: URLSearchParams,
  optedIn = false,
): SubmissionGuardDecision {
  const candidate = searchParams.get("_id");

  if (!candidate) {
    return optedIn
      ? { engaged: true, submissionId: null }
      : { engaged: false, reason: "no-candidate" };
  }

  if (optedIn || isValidSubmissionId(candidate)) {
    return { engaged: true, submissionId: candidate };
  }

  return { engaged: false, reason: "ordinary-id" };
}

/**
 * Records a submission ID in the replay cache.
 *
 * @param id The validated RFC 9562 v7 submission ID
 * @param ttlMs Optional TTL override in milliseconds (defaults to 60,000ms)
 * @returns `true` if the submission was NOT previously seen (accepted),
 *          `false` if the ID was already recorded and has not yet expired (replay detected!).
 */
export function markSubmissionSeen(id: string, ttlMs = SUBMISSION_ID_TTL_MS): boolean {
  const now = Date.now();

  const existingExpires = seenSubmissions.get(id);
  if (existingExpires !== undefined) {
    if (now < existingExpires) {
      // Still active: Replay detected!
      return false;
    }
    // Expired entry: will be overwritten
    seenSubmissions.delete(id);
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

  seenSubmissions.set(id, now + ttlMs);
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
