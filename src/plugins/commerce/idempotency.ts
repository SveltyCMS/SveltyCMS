/**
 * @file src/plugins/commerce/idempotency.ts
 * @description `Idempotency-Key` replay for the state-changing commerce routes.
 *
 * A retried `POST /api/commerce/checkout` or `/pay` (lost response, double
 * submit, network timeout) must not create a second order or a second charge.
 * `withIdempotency` serializes same-key work with `withKeyLock` and replays the
 * first result when `lookup` finds the prior side effect — so `run` must
 * persist whatever `lookup` reads back.
 *
 * Same-process only until the durable store lands (roadmap): the lock dedups
 * concurrent duplicates, and `lookup` (e.g. an order row carrying the key)
 * covers sequential retries while the record exists.
 *
 * ### Features:
 * - header parse tolerant of casing / whitespace / length
 * - keyed serialization: concurrent duplicates run exactly once
 */

import { withKeyLock } from "./locks";

/** RFC-shaped idempotency keys are opaque tokens; cap the length we will echo. */
const MAX_KEY_LENGTH = 255;

/** Normalise an `Idempotency-Key` header value; empty/undefined ⇒ no key. */
export function normalizeIdempotencyKey(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return undefined;
  return trimmed;
}

/**
 * Run `run` at most once per idempotency key.
 *
 * @param key   normalised `Idempotency-Key`, or undefined to run unconditionally
 * @param lookup returns the previously persisted result for this key, else null
 * @param run    performs the side effect and persists it so `lookup` finds it
 */
export async function withIdempotency<T>(
  key: string | undefined,
  lookup: () => Promise<T | null>,
  run: () => Promise<T>,
): Promise<T> {
  if (!key) return run();
  return withKeyLock(`idem:${key}`, async () => {
    const existing = await lookup();
    if (existing) return existing;
    return run();
  });
}
