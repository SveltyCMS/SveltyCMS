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
 * - superset cache tag derivation (as-passed + physical + bare spellings)
 * - single source of truth shared by SDK write paths, API handlers, and all
 *   four DB adapters (SQL identifier safety remains in the adapter layer)
 */

/** Physical-name namespace prefix; the bare (unprefixed) spelling is this stripped. */
const COLLECTION_TABLE_PREFIX = "collection_";

const _nameCache = new Map<string, string>();

/**
 * Derives the physical table/model name for a collection id.
 * Example: "blog-posts" → "collection_blogposts".
 */
export function collectionTableName(collectionId: string): string {
  return normalizeCollectionTableName(collectionId);
}

/**
 * Bare (unprefixed, dash-free) spelling of a collection reference: drops the
 * `collection_` prefix when present, then hyphens. Shared by
 * `normalizeCollectionTableName` and `buildCollectionCacheTags` so the two can
 * never drift into different normalisation rules.
 *
 * Examples: "collection_posts" → "posts", "blog-posts" → "blogposts",
 *           "posts" → "posts".
 */
function collectionBareName(collection: string): string {
  const id = collection.startsWith(COLLECTION_TABLE_PREFIX)
    ? collection.slice(COLLECTION_TABLE_PREFIX.length)
    : collection;
  return id.replace(/-/g, "");
}

/**
 * Cache tags under which a collection's list (`collection:<name>`) and count
 * (`count:<name>`) entries are registered. A deliberate SUPERSET of every
 * spelling a caller might hold:
 * 1. the name as passed,
 * 2. the normalised physical table name,
 * 3. the bare (unprefixed) spelling derived from it.
 *
 * Extra tags can only make an invalidation slightly wider, never miss: the
 * normaliser is one-way (the dash in "blog-posts" is lost in
 * "collection_blogposts"), so a caller holding only the physical name cannot
 * reconstruct the logical spelling — over-clearing is the safe degradation.
 *
 * Degenerate inputs: an already-bare input adds no extra tags (its bare
 * spelling equals the input, deduped); an empty string — or any input that
 * strips to "" — never emits the meaningless `collection:` tag; the literal id
 * "collection" keeps its own spelling plus the physical "collection_collection".
 * Spellings are deduped by comparing them before emission (no Set allocation on
 * the write path); producers and invalidators share this definition.
 */
export function buildCollectionCacheTags(collection: string): string[] {
  const physical = collectionTableName(collection);
  const bare = collectionBareName(collection);
  const tags: string[] = [];
  if (collection.length > 0) {
    tags.push(`collection:${collection}`, `count:${collection}`);
  }
  if (physical.length > 0 && physical !== collection) {
    tags.push(`collection:${physical}`, `count:${physical}`);
  }
  if (bare.length > 0 && bare !== collection && bare !== physical) {
    tags.push(`collection:${bare}`, `count:${bare}`);
  }
  return tags;
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
  const normalized = `${COLLECTION_TABLE_PREFIX}${collectionBareName(input)}`;
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
