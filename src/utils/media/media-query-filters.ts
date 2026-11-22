/**
 * @file src/utils/media/media-query-filters.ts
 * @description Structured media filters shared by the gallery URL contract and
 * every database adapter — byte size, pixel dimensions and MIME type.
 *
 * Before this module the advanced-search modal narrowed the 100-item page it had
 * already loaded, so a matching asset on a later server page was invisible. The
 * filters below are pushed into the adapters instead; this file is the single
 * validator both sides use, so a URL value the loader accepts is a value the
 * query builders can bind.
 *
 * Features:
 * - fail-closed validation: invalid values are dropped, never forwarded
 * - caps that stay inside the adapters' 32-bit `size` columns
 * - inverted ranges are discarded so a hand-edited URL cannot pin an empty view
 * - `criteriaToQueryFilter`: the advanced-search criteria that every engine
 *   evaluates identically, compiled into one portable query filter
 * - `MEDIA_SEARCH_IN_MEMORY_CRITERIA`: the explicit post-filter list, so a
 *   criterion is never silently dropped from a query
 */

import type { SearchCriteria } from "./advanced-search";

/** Filter fields the adapters understand (`MediaQueryOptions` mirrors them). */
export interface MediaStructuredFilters {
  /** Exact MIME types, lowercase (`image/png`). */
  mimeTypes?: string[];
  maxHeight?: number;
  maxSize?: number;
  maxWidth?: number;
  minHeight?: number;
  minSize?: number;
  minWidth?: number;
}

/**
 * Raw shape accepted by {@link normalizeMediaStructuredFilters}: URL params are
 * strings, adapter options are already numbers, a caller may pass either.
 */
export interface RawMediaStructuredFilters {
  mimeTypes?: unknown;
  maxHeight?: unknown;
  maxSize?: unknown;
  maxWidth?: unknown;
  minHeight?: unknown;
  minSize?: unknown;
  minWidth?: unknown;
}

/** `size` is a 32-bit signed integer column in every SQL schema (2 GiB - 1). */
const MEDIA_MAX_FILTER_BYTES = 2_147_483_647;
/** Far beyond any real asset and keeps a hand-written URL bounded. */
const MEDIA_MAX_FILTER_DIMENSION = 100_000;
/** `?mime=` entries — enough for every format a folder realistically mixes. */
export const MEDIA_MAX_MIME_FILTERS = 20;
/** `type/subtype` tokens are short; anything longer is not a MIME type. */
const MEDIA_MAX_MIME_LENGTH = 100;

/** URL names for the filter params — loader, modal and tests share this map. */
export const MEDIA_FILTER_PARAMS = {
  maxHeight: "maxHeight",
  maxSize: "maxSize",
  maxWidth: "maxWidth",
  mime: "mime",
  minHeight: "minHeight",
  minSize: "minSize",
  minWidth: "minWidth",
} as const;

/** `type/subtype` MIME token — no wildcards, no parameters, no separators. */
const MIME_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/**
 * Normalize a MIME filter value (`string`, comma-separated string, or array).
 * Case is folded and duplicates collapse; unparsable entries are dropped.
 */
function normalizeMediaMimeTypes(value: unknown): string[] | undefined {
  const entries = Array.isArray(value) ? value : [value];
  const accepted = new Set<string>();

  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    for (const part of entry.split(",")) {
      const token = part.trim().toLowerCase();
      if (!token || token.length > MEDIA_MAX_MIME_LENGTH) continue;
      if (!MIME_TOKEN.test(token)) continue;
      accepted.add(token);
      if (accepted.size >= MEDIA_MAX_MIME_FILTERS) break;
    }
    if (accepted.size >= MEDIA_MAX_MIME_FILTERS) break;
  }

  return accepted.size > 0 ? [...accepted] : undefined;
}

/** Positive integer below `max`; everything else (0, negatives, decimals, NaN) is invalid. */
function normalizeMediaBound(value: unknown, max: number): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) return undefined;
  return parsed;
}

function normalizeMediaRange(
  minRaw: unknown,
  maxRaw: unknown,
  cap: number,
): { max?: number; min?: number } {
  const min = normalizeMediaBound(minRaw, cap);
  const max = normalizeMediaBound(maxRaw, cap);
  // An inverted range is a typo, not a legitimate empty result set: dropping both
  // bounds keeps `?minSize=9&maxSize=1` from silently painting an empty gallery.
  if (min !== undefined && max !== undefined && min > max) return {};
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  };
}

/**
 * Validate a raw filter bag. Used by `+page.server.ts` before the adapter call and
 * again inside the adapters, so an options object that skipped the URL still
 * cannot reach a query builder with a negative or non-finite value.
 */
export function normalizeMediaStructuredFilters(
  raw?: RawMediaStructuredFilters | null,
): MediaStructuredFilters {
  const filters: MediaStructuredFilters = {};

  const mimeTypes = normalizeMediaMimeTypes(raw?.mimeTypes);
  if (mimeTypes) filters.mimeTypes = mimeTypes;

  const size = normalizeMediaRange(raw?.minSize, raw?.maxSize, MEDIA_MAX_FILTER_BYTES);
  if (size.min !== undefined) filters.minSize = size.min;
  if (size.max !== undefined) filters.maxSize = size.max;

  const width = normalizeMediaRange(raw?.minWidth, raw?.maxWidth, MEDIA_MAX_FILTER_DIMENSION);
  if (width.min !== undefined) filters.minWidth = width.min;
  if (width.max !== undefined) filters.maxWidth = width.max;

  const height = normalizeMediaRange(raw?.minHeight, raw?.maxHeight, MEDIA_MAX_FILTER_DIMENSION);
  if (height.min !== undefined) filters.minHeight = height.min;
  if (height.max !== undefined) filters.maxHeight = height.max;

  return filters;
}

/* -------------------------------------------------------------------------- */
/* Advanced-search pushdown                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One predicate on a physical media column.
 *
 * `$contains` is the case-insensitive substring form both engines implement
 * (SQL LIKE / Mongo escaped regex with the `i` flag); the range keys bind
 * numbers or `Date`s and `$in` is exact membership.
 */
export interface MediaSearchFieldFilter {
  $contains?: string;
  $gte?: Date | number;
  $lte?: Date | number;
  $in?: string[];
}

/** Portable filter bag handed to `dbAdapter.crud.findMany("media", …)`. */
export type MediaSearchQueryFilter = Record<
  string,
  Date | MediaSearchFieldFilter | number | string
>;

/**
 * Criteria that must stay in `advancedSearch()` after the query returns.
 *
 * `minWidth`/`maxWidth`/`minHeight`/`maxHeight`/`aspectRatio` address pixel
 * bounds stored in the `metadata` JSON blob. The generic query mapper only
 * reaches JSON paths on tables with a `data` column (`media_items` has a real
 * `metadata` column instead), so a SQL push would drop the condition and a
 * Mongo-only push would drop the non-image rows the in-memory pass keeps.
 *
 * `tags` needs AND semantics across an array (`$all` on Mongo, no portable SQL
 * form). `camera`/`location`/`hasEXIF` are derived from EXIF keys inside the
 * criterion, not from a stored field. `dominantColor` is a nested-metadata
 * substring match. `showDuplicatesOnly` needs a hash census over the whole
 * library, not over the already-narrowed candidate set.
 */
export const MEDIA_SEARCH_IN_MEMORY_CRITERIA = [
  "aspectRatio",
  "camera",
  "dominantColor",
  "hasEXIF",
  "location",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "showDuplicatesOnly",
  "tags",
] as const satisfies readonly (keyof SearchCriteria)[];

/**
 * JS `toLowerCase()` folds Unicode, SQLite's LIKE folds ASCII only. A non-ASCII
 * term is a superset risk (the database could drop a row the in-memory check
 * keeps), so it stays out of the pushed filter.
 */
const ASCII_SEARCH_TERM = /^[\x20-\x7e]*$/;

/**
 * Compile the directly mappable {@link SearchCriteria} into one query filter.
 *
 * The result is always a **superset** filter: any criterion without an exact
 * portable predicate is omitted (and listed in
 * {@link MEDIA_SEARCH_IN_MEMORY_CRITERIA}) so `advancedSearch()` remains the
 * authority for the visible rows.
 */
export function criteriaToQueryFilter(criteria: SearchCriteria): MediaSearchQueryFilter {
  const filter: MediaSearchQueryFilter = {};

  // Range/membership values reuse the adapter's own validation, so a hand-edited
  // `?minSize=abc` or an inverted range never reaches a query builder.
  const structured = normalizeMediaStructuredFilters({
    maxHeight: criteria.maxHeight,
    maxSize: criteria.maxSize,
    maxWidth: criteria.maxWidth,
    mimeTypes: criteria.fileTypes,
    minHeight: criteria.minHeight,
    minSize: criteria.minSize,
    minWidth: criteria.minWidth,
  });

  // Physical columns: filename, mimeType, size, createdAt, hash.
  if (criteria.filename && ASCII_SEARCH_TERM.test(criteria.filename)) {
    filter.filename = { $contains: criteria.filename };
  }

  // A criterion list longer than the adapter cap is normalized to a SHORTER
  // `$in` — a row matching one of the truncated values would still pass the
  // in-memory check, so the predicate is omitted entirely (superset, never
  // narrower). Invalid tokens are safe to drop: they cannot equal a real MIME.
  // Uppercase criteria stay in memory because `advancedSearch()` compares MIME
  // types case-sensitively while normalization folds them: a stored
  // `IMAGE/PNG` row matches the in-memory check but never the lowercase `$in`.
  const fileTypes = criteria.fileTypes ?? [];
  const lowercaseFileTypes = fileTypes.every((type) => type === type.toLowerCase());
  if (
    structured.mimeTypes?.length &&
    fileTypes.length <= MEDIA_MAX_MIME_FILTERS &&
    lowercaseFileTypes
  ) {
    filter.mimeType = { $in: structured.mimeTypes };
  }

  const size: MediaSearchFieldFilter = {};
  if (structured.minSize !== undefined) size.$gte = structured.minSize;
  if (structured.maxSize !== undefined) size.$lte = structured.maxSize;
  if (size.$gte !== undefined || size.$lte !== undefined) filter.size = size;

  const createdAt: MediaSearchFieldFilter = {};
  const after = criteria.uploadedAfter;
  if (after instanceof Date && Number.isFinite(after.getTime())) createdAt.$gte = after;
  const before = criteria.uploadedBefore;
  if (before instanceof Date && Number.isFinite(before.getTime())) createdAt.$lte = before;
  if (createdAt.$gte !== undefined || createdAt.$lte !== undefined) filter.createdAt = createdAt;

  // A hash is an exact content identity (lowercase hex on every writer).
  if (criteria.hashMatch) filter.hash = criteria.hashMatch;

  return filter;
}

/** True when at least one structured filter is set (drives "filters active"). */
export function hasMediaStructuredFilters(filters?: MediaStructuredFilters | null): boolean {
  if (!filters) return false;
  return (
    (filters.mimeTypes?.length ?? 0) > 0 ||
    filters.minSize !== undefined ||
    filters.maxSize !== undefined ||
    filters.minWidth !== undefined ||
    filters.maxWidth !== undefined ||
    filters.minHeight !== undefined ||
    filters.maxHeight !== undefined
  );
}

/**
 * Read the structured filters from the gallery URL (`?mime=`, `?minSize=`, …).
 * Repeated `?mime=` params and a single comma-separated value are both accepted;
 * `?minSize=abc` / `?maxWidth=-1` are ignored instead of reaching the adapter.
 *
 * The parameter is the read-only slice (`get`/`getAll`), so both the loader's
 * `URLSearchParams` and SvelteKit's `ReadonlyURLSearchParams` are accepted.
 */
export function readMediaStructuredFilters(
  params: Pick<URLSearchParams, "get" | "getAll">,
): MediaStructuredFilters {
  const mimeValues = params.getAll(MEDIA_FILTER_PARAMS.mime);
  return normalizeMediaStructuredFilters({
    mimeTypes: mimeValues.length > 0 ? mimeValues : undefined,
    minSize: params.get(MEDIA_FILTER_PARAMS.minSize),
    maxSize: params.get(MEDIA_FILTER_PARAMS.maxSize),
    minWidth: params.get(MEDIA_FILTER_PARAMS.minWidth),
    maxWidth: params.get(MEDIA_FILTER_PARAMS.maxWidth),
    minHeight: params.get(MEDIA_FILTER_PARAMS.minHeight),
    maxHeight: params.get(MEDIA_FILTER_PARAMS.maxHeight),
  });
}
