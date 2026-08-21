/**
 * @file src/databases/core/collection-name.ts
 * @description
 * Physical table/model name derivation for collection schemas.
 * Collection IDs may contain hyphens (e.g. "blog-posts"), which are not valid
 * in physical table identifiers on some engines — the physical name strips
 * them and keeps the standard `collection_` namespace prefix.
 *
 * ### Features:
 * - deterministic, engine-agnostic table name derivation
 * - prefix-aware normalization (idempotent on already-prefixed names)
 * - single source of truth shared by SDK write paths, API handlers, and all
 *   four DB adapters (SQL identifier safety remains in the adapter layer)
 */

const _nameCache = new Map<string, string>();

/**
 * Derives the physical table/model name for a collection id.
 * Example: "blog-posts" → "collection_blogposts".
 */
export function collectionTableName(collectionId: string): string {
  return normalizeCollectionTableName(collectionId);
}

/**
 * Normalizes any collection reference (raw id OR already-prefixed name) to the
 * canonical physical name: strips hyphens and guarantees exactly one
 * `collection_` prefix. Idempotent by design.
 *
 * Example: "blog-posts" → "collection_blogposts",
 *          "collection_blog-posts" → "collection_blogposts",
 *          "collection_blogposts" → "collection_blogposts".
 */
export function normalizeCollectionTableName(input: string): string {
  const cached = _nameCache.get(input);
  if (cached !== undefined) return cached;
  const id = input.startsWith("collection_") ? input.slice(11) : input;
  const normalized = `collection_${id.replace(/-/g, "")}`;
  if (_nameCache.size < 512) {
    _nameCache.set(input, normalized);
  }
  return normalized;
}

/**
 * Validates that the physical SQL table name does not exceed the PostgreSQL 63-character limit.
 */
export function validatePhysicalTableName(collectionId: string): string | null {
  const physical = normalizeCollectionTableName(collectionId);
  if (physical.length > 63) {
    return `Collection identifier too long: derived table name '${physical}' exceeds 63 characters (PostgreSQL identifier limit).`;
  }
  return null;
}
