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

/**
 * Derives the physical table/model name for a collection id.
 * Example: "blog-posts" → "collection_blogposts".
 */
export function collectionTableName(collectionId: string): string {
  return `collection_${collectionId.replace(/-/g, "")}`;
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
  const id = input.startsWith("collection_") ? input.slice("collection_".length) : input;
  return `collection_${id.replace(/-/g, "")}`;
}
