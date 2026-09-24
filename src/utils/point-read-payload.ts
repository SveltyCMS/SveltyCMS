/**
 * @file src/utils/point-read-payload.ts
 * @description Shared HTTP point-read payload trim for `GET /api/collections/:collection/:entryId`.
 *
 * The SDK row (LocalCMS contract) is never changed: server-side consumers
 * (admin SSR, dashboard search, sitemap) keep reading `_collection` and every
 * system column off the SDK result. This helper only shapes the HTTP
 * point-read representation, and every writer of that payload MUST go through
 * it — the warm read lane's MISS rebuild, the dispatcher fallback
 * `handleCollectionEntry`, and the predictive turbo stash — so the
 * `BENCH_VERIFY_RAW=1` byte-identity gate (lane vs bridged fallback) stays green.
 *
 * ### Features:
 * - Copy-trim: the caller's envelope/row references stay untouched, so the SDK
 *   request cache and L2 entries never observe the trimmed row
 * - Drops the SDK-injected `_collection` meta: no HTTP consumer exists (the
 *   admin UI, dashboard search and sitemap all read it through LocalCMS)
 * - Drops platform-managed system columns (`tenantId`, `createdAt`, `updatedAt`,
 *   `isDeleted`): the write path owns them (tenant scope overwrites `tenantId`,
 *   `updatedAt` is always server-now) and no HTTP point-read consumer reads them
 * - Drops the physical mirror columns (`collection`, `locale`, `publishedAt`)
 *   ONLY when null: `prepareValues` fills those columns exclusively from the
 *   document itself, so a null is the column default (system noise) while any
 *   value is document content and must survive
 * - Keeps `_id`, `status`, `slug` and every content field: `_id` is the
 *   identity, `status` the documented publication control, `slug` documented
 *   content — headless clients read all three from point-read payloads
 * - Single-row only: list payloads (arrays) and non-envelopes pass through
 *   unchanged, so the list contract stays byte-identical
 */

/**
 * Keys dropped unconditionally from a single-entry row. Platform-managed
 * system columns plus the SDK-injected cross-collection meta — none of them
 * has an HTTP point-read consumer (see file header for the evidence).
 */
const POINT_READ_DROP_ALWAYS = [
  "_collection",
  "tenantId",
  "createdAt",
  "updatedAt",
  "isDeleted",
] as const;

/**
 * Physical columns that mirror document fields. `prepareValues` writes them
 * only when the document itself carries the key, so a null value is the
 * column default (pure wire noise) while a non-null value is document content.
 */
const POINT_READ_DROP_WHEN_NULL = ["collection", "locale", "publishedAt"] as const;

/**
 * Copy-trim one single-entry row. Returns a new object with the system keys
 * removed; the input row is never mutated (it may be referenced by the SDK
 * request cache or an L2 write).
 */
function trimPointReadRow(row: unknown): Record<string, unknown> {
  const trimmed = { ...(row as Record<string, unknown>) };
  for (const key of POINT_READ_DROP_ALWAYS) {
    delete trimmed[key];
  }
  for (const key of POINT_READ_DROP_WHEN_NULL) {
    if (trimmed[key] === null) delete trimmed[key];
  }
  return trimmed;
}

/**
 * Trim a `{ success, data, meta? }` SDK envelope for HTTP point-read
 * serialization. Only a single-row `data` is trimmed — arrays (list payloads),
 * null rows, primitives and non-envelope values return unchanged so every
 * other payload contract stays byte-identical.
 */
export function trimPointReadEnvelope(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return envelope;
  const env = envelope as Record<string, unknown>;
  const data = env.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return envelope;
  return { ...env, data: trimPointReadRow(data) };
}
