/**
 * @file src/utils/collection-query-filter-meta.ts
 * @description Browser-safe collection filter contract: URL prefix, filter map
 * types and the stable query hash.
 *
 * Parsing, schema coercion and whitelist validation are server-only and live in
 * `collection-query-filters.server.ts`; this module is the only half a client
 * module may import.
 *
 * ### Features:
 * - `filter_{field}` URL prefix shared by entry-list, saved views and drilldowns
 * - adapter-agnostic filter map types
 * - order-independent stable serialization + short query hash
 *
 * @see docs/reference/architecture/collection-filtering.mdx
 * @see docs/reference/components/entry-list.mdx
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** URL query prefix for per-column filters (entry-list / createSmartFilter). */
export const FILTER_URL_PREFIX = "filter_";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Adapter-agnostic per-field filter operators.
 * URL layer often sends `{ contains: string }`; advanced clients may send eq/in/isNull/gte/lte.
 */
export type CollectionFilterOp =
  | { contains: string }
  | { eq: string | number | boolean }
  | { ne: string | number | boolean }
  | { in: Array<string | number | boolean> }
  | { isNull: boolean }
  | { gte?: string | number; lte?: string | number }
  | { gt: string | number }
  | { lt: string | number }
  | string;

/** Map of field id → operator, ready for QueryBuilder / CollectionService. */
export type CollectionFilterMap = Record<string, CollectionFilterOp>;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Stable JSON serialization with sorted object keys.
 * Prevents cache key drift when filter key insertion order differs.
 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = Object.create(null);
      for (const k of Object.keys(obj).sort()) {
        sorted[k] = obj[k];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Portable short hash (djb2a) for cache key fragments.
 * Not cryptographic — only for key bucketing / uniqueness.
 */
export function hashQueryPayload(payload: unknown): string {
  const str = typeof payload === "string" ? payload : stableSerialize(payload);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}
