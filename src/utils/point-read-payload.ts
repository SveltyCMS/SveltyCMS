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
const POINT_READ_DROP_ALWAYS = new Set<string>([
  "_collection",
  "tenantId",
  "createdAt",
  "updatedAt",
  "isDeleted",
]);

/**
 * Physical columns that mirror document fields. `prepareValues` writes them
 * only when the document itself carries the key, so a null value is the
 * column default (pure wire noise) while a non-null value is document content.
 */
const POINT_READ_DROP_WHEN_NULL = new Set<string>(["collection", "locale", "publishedAt"]);
const POPULATED_PREFIX = "_populated_";

function trimPopulatedValue(value: unknown, memo: Map<object, Record<string, unknown>>): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const el = value[i];
      if (el && typeof el === "object" && !Array.isArray(el)) {
        const trimmed = trimPointReadRow(el, memo);
        out.push(trimmed);
        if (trimmed !== el) changed = true;
      } else {
        out.push(el);
      }
    }
    return changed ? out : value;
  }
  return trimPointReadRow(value, memo);
}

/**
 * Copy-trim one single-entry row. Returns a new object with the system keys
 * removed via key-skipping copy; the input row is never mutated (it may be referenced by the SDK
 * request cache or an L2 write). Populated relation payloads (`_populated_*`)
 * are trimmed with the same point-read filter and memoized by reference.
 */
function trimPointReadRow(
  row: unknown,
  memo?: Map<object, Record<string, unknown>>,
): Record<string, unknown> {
  const obj = row as object;
  if (memo) {
    const cached = memo.get(obj);
    if (cached) return cached;
  }
  const src = row as Record<string, unknown>;
  const trimmed: Record<string, unknown> = {};
  let activeMemo = memo;
  if (activeMemo) activeMemo.set(obj, trimmed);
  for (const key in src) {
    if (POINT_READ_DROP_ALWAYS.has(key)) continue;
    const val = src[key];
    if (val === null && POINT_READ_DROP_WHEN_NULL.has(key)) continue;
    if (
      key.charCodeAt(0) === 95 &&
      key.startsWith(POPULATED_PREFIX) &&
      val &&
      typeof val === "object"
    ) {
      if (!activeMemo) {
        activeMemo = new Map<object, Record<string, unknown>>();
        activeMemo.set(obj, trimmed);
      }
      trimmed[key] = trimPopulatedValue(val, activeMemo);
      continue;
    }
    trimmed[key] = val;
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
 * Copy an object without its `_collection` key, trimming any nested
 * `_populated_*` relation payloads once per shared target instance.
 */
function trimListRow(
  item: Record<string, unknown>,
  memo: Map<object, Record<string, unknown>> | null,
): Record<string, unknown> | null {
  let needsCopy = false;
  for (const key in item) {
    if (key.charCodeAt(0) !== 95) continue;
    if (
      key === "_collection" ||
      (key.startsWith(POPULATED_PREFIX) && item[key] && typeof item[key] === "object")
    ) {
      needsCopy = true;
      break;
    }
  }
  if (!needsCopy) return null;

  const copy: Record<string, unknown> = {};
  const activeMemo = memo ?? new Map<object, Record<string, unknown>>();
  for (const key in item) {
    if (key === "_collection") continue;
    const val = item[key];
    if (
      key.charCodeAt(0) === 95 &&
      key.startsWith(POPULATED_PREFIX) &&
      val &&
      typeof val === "object"
    ) {
      copy[key] = trimPopulatedValue(val, activeMemo);
      continue;
    }
    copy[key] = val;
  }
  return copy;
}

/**
 * Trim a `{ success, data, meta? }` SDK envelope for HTTP list serialization.
 * Strips per-row `_collection` duplications across all items, hoists
 * `meta._collection` once onto the top-level envelope, and applies the
 * point-read trim to embedded `_populated_*` relation rows.
 *
 * Fast path: when no row carries `_collection` or `_populated_*`, the input
 * envelope is returned by identity — no envelope spread, no array clone, no row clones.
 */
export function trimListEnvelope(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return envelope;
  const env = envelope as Record<string, unknown>;
  const data = env.data;
  if (!data || !Array.isArray(data) || data.length === 0) return envelope;

  let collectionMeta: unknown = undefined;
  let hasCollectionMeta = false;
  let hasPopulated = false;
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (i === 0 && "_collection" in rec) {
      collectionMeta = rec._collection;
      hasCollectionMeta = true;
    }
    for (const key in rec) {
      if (key.charCodeAt(0) !== 95) continue;
      if (key === "_collection") hasCollectionMeta = true;
      else if (key.startsWith(POPULATED_PREFIX) && rec[key] && typeof rec[key] === "object") {
        hasPopulated = true;
      }
    }
    if (hasCollectionMeta && hasPopulated) break;
  }

  // Nothing to trim: return the caller's envelope untouched (identity contract).
  if (!hasCollectionMeta && !hasPopulated) return envelope;

  const memo = hasPopulated ? new Map<object, Record<string, unknown>>() : null;
  const trimmedArray: unknown[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item && typeof item === "object") {
      const trimmedRow = trimListRow(item as Record<string, unknown>, memo);
      trimmedArray.push(trimmedRow ?? item);
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
