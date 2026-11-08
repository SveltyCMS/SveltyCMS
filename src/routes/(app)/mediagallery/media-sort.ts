/**
 * @file src/routes/(app)/mediagallery/media-sort.ts
 * @description Allocation-free comparators for the gallery's client-side ordering
 * and for its page-scoped `createdAt` bounds.
 *
 * Features:
 * - canonical `toISOString()` values compare lexicographically (no `Date` allocation
 *   per comparison; chronological equals lexicographic for that fixed shape)
 * - offset-bearing / non-canonical ISO values fall back to `Date.parse`, so their
 *   exact numeric order is preserved
 * - missing and unparseable timestamps sort as the Unix epoch (the old
 *   `new Date(value || 0)` fallback), deterministically and without `NaN`
 * - date-filter bounds are parsed once per filter pass, not once per row
 */

/** Values of the gallery's client sort control (`?sort=` / `?dir=` mapping lives in `+page.svelte`). */
export type MediaSortKey =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc";

/** The gallery row fields the comparators read. Works for `MediaBase` / `GalleryListItem`. */
export interface MediaSortRecord {
  createdAt?: string | null;
  filename?: string | null;
  size?: number | null;
}

/**
 * `Date#toISOString()` output exactly: `YYYY-MM-DDTHH:mm:ss.sssZ`. Only this
 * shape is lexicographically sortable — shorter precisions (`…:00Z`) or offsets
 * (`+02:00`) would compare wrong as strings, so they take the parse path.
 */
const CANONICAL_UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isCanonicalUtcIso(value: string): boolean {
  return CANONICAL_UTC_ISO.test(value);
}

/** Epoch milliseconds for a timestamp, or `0` for missing/unparseable values. */
function timestampMillis(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Ascending timestamp comparison. Missing and invalid values are pinned to the
 * epoch, so they sort as oldest (never produce `NaN`, which made `Array#sort`
 * keep arbitrary input order).
 */
export function compareCreatedAt(a?: string | null, b?: string | null): number {
  if (a === b) return 0;

  // Fast path: both values are already in the shape every adapter stores
  // (`nowISODateString()`), where string order is chronological.
  if (a && b && isCanonicalUtcIso(a) && isCanonicalUtcIso(b)) {
    return a < b ? -1 : 1;
  }

  const diff = timestampMillis(a) - timestampMillis(b);
  if (diff === 0) return 0;
  return diff < 0 ? -1 : 1;
}

/**
 * Gallery comparator for every sort key. Mirrors the previous inline switch.
 * Unknown values fall back to `newest`, exactly like the old `default` branch.
 */
export function compareMedia(a: MediaSortRecord, b: MediaSortRecord, sort: string): number {
  switch (sort) {
    case "oldest":
      return compareCreatedAt(a.createdAt, b.createdAt);
    case "name-asc":
      return (a.filename ?? "").localeCompare(b.filename ?? "");
    case "name-desc":
      return (b.filename ?? "").localeCompare(a.filename ?? "");
    case "size-desc":
      // `NaN` for a missing size reproduces the previous `undefined - number`
      // result, which `Array#sort` treats as "equal" (stable input order).
      return (b.size ?? Number.NaN) - (a.size ?? Number.NaN);
    case "size-asc":
      return (a.size ?? Number.NaN) - (b.size ?? Number.NaN);
    case "newest":
    default:
      return compareCreatedAt(b.createdAt, a.createdAt);
  }
}

/**
 * Convert an advanced-search date bound once per filter pass. An invalid `Date`
 * previously produced `NaN` comparisons (effectively a no-op filter), so it is
 * mapped to `undefined` — `undefined` means "no bound".
 */
export function dateBoundToIso(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  const time = value.getTime();
  return Number.isNaN(time) ? undefined : value.toISOString();
}

/**
 * Inclusive `createdAt` range test using the ISO bounds hoisted by
 * `dateBoundToIso` — one conversion per filter pass instead of two `Date`s per
 * row. `undefined` bounds are open ends.
 */
export function matchesDateBounds(
  createdAt: string | null | undefined,
  afterIso: string | undefined,
  beforeIso: string | undefined,
): boolean {
  if (afterIso && compareCreatedAt(createdAt, afterIso) < 0) return false;
  if (beforeIso && compareCreatedAt(createdAt, beforeIso) > 0) return false;
  return true;
}
