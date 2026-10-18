/**
 * @file src/utils/point-read-payload.ts
 * @description Shared HTTP payload trims for collection reads (`GET /api/collections/:collection[/:entryId]`).
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
 * - Single-row only: arrays (list payloads) and non-envelopes pass through
 *   `trimPointReadEnvelope` unchanged, so the list contract stays byte-identical
 * - List fast path: `trimListEnvelope` returns the input envelope by identity when
 *   no row carries `_collection` (no envelope/array/row clone), and copies only the
 *   rows that actually need the key removed — untouched rows keep their reference
 * - List copies use a key-copy loop instead of object spread: it skips the
 *   `_collection` key while copying, so no clone-then-`delete` pass is needed
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

/**
 * Copy an object without its `_collection` key. The input row is never mutated
 * (it may be referenced by the SDK request cache or an L2 write).
 */
function copyWithoutCollection(item: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  const keys = Object.keys(item);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== "_collection") copy[key] = item[key];
  }
  return copy;
}

/**
 * Trim a `{ success, data, meta? }` SDK envelope for HTTP list serialization.
 * Strips per-row `_collection` duplications across all items and hoists
 * `meta._collection` once onto the top-level envelope.
 *
 * Fast path: when no row carries `_collection`, the input envelope is returned
 * by identity — no envelope spread, no array clone, no row clones. This is the
 * common list shape (the SDK only injects the meta on cross-collection reads),
 * so large list payloads stop paying a clone per row.
 */
export function trimListEnvelope(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return envelope;
  const env = envelope as Record<string, unknown>;
  const data = env.data;
  if (!data || !Array.isArray(data) || data.length === 0) return envelope;

  // Hoist from the first row exactly as before; the scan below detects whether
  // any row (first included) actually needs trimming.
  let collectionMeta: unknown = undefined;
  let hasCollectionMeta = false;
  const first = data[0];
  if (first && typeof first === "object" && "_collection" in first) {
    collectionMeta = (first as Record<string, unknown>)._collection;
    hasCollectionMeta = true;
  }

  if (!hasCollectionMeta) {
    for (let i = 1; i < data.length; i++) {
      const item = data[i];
      if (item && typeof item === "object" && "_collection" in item) {
        hasCollectionMeta = true;
        break;
      }
    }
  }

  // Nothing to trim: return the caller's envelope untouched (identity contract).
  if (!hasCollectionMeta) return envelope;

  const trimmedArray: unknown[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item && typeof item === "object" && "_collection" in item) {
      trimmedArray.push(copyWithoutCollection(item as Record<string, unknown>));
    } else {
      trimmedArray.push(item);
    }
  }

  const updatedMeta = collectionMeta
    ? { ...(env.meta as Record<string, unknown>), _collection: collectionMeta }
    : env.meta;

  return {
    ...env,
    data: trimmedArray,
    ...(updatedMeta !== undefined ? { meta: updatedMeta } : {}),
  };
}
