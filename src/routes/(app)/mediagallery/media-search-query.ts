/**
 * @file src/routes/(app)/mediagallery/media-search-query.ts
 * @description URL contract for the gallery's server-side search and advanced filters.
 *
 * Features:
 * - writes the canonical `?q=` parameter (never the legacy `?search=` alias)
 * - writes/clears the structured filters (`?mime=`, `?minSize=`, `?minWidth=`, …)
 *   with the same validation the adapters apply
 * - always drops `?page=` when the result set changes
 * - trims and caps the query the same way `+page.server.ts` does
 */

import type { SearchCriteria } from "@utils/media/advanced-search";
import {
  MEDIA_FILTER_PARAMS,
  type MediaStructuredFilters,
  normalizeMediaStructuredFilters,
} from "@utils/media/media-query-filters";

/** Matches the loader's `slice(0, 100)` cap so the URL and the query agree. */
export const MEDIA_SEARCH_MAX_LENGTH = 100;

/** Matches the loader's `jsonPath` cap. */
export const MEDIA_JSON_PATH_MAX_LENGTH = 500;

/**
 * Build the listing URL for a search query. Any stale pagination offset is
 * deleted — carrying `?page=7` into a new result set skips matches that now
 * live on page 1.
 */
export function buildMediaSearchUrl(base: string | URL, query: string): URL {
  const url = new URL(base);
  const value = query.trim().slice(0, MEDIA_SEARCH_MAX_LENGTH);

  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");

  url.searchParams.delete("search");
  url.searchParams.delete("page");
  return url;
}

/**
 * Build the listing URL for an advanced search: the structured filters replace
 * whatever the URL carried before (so removing a bound in the modal removes it
 * from the query), `jsonPath` is synced when supplied, and `?page=` is dropped
 * because the result set changed.
 */
export function buildMediaAdvancedSearchUrl(
  base: string | URL,
  filters: MediaStructuredFilters,
  options: { jsonPath?: string } = {},
): URL {
  const url = new URL(base);
  const normalized = normalizeMediaStructuredFilters(filters);

  setOrDelete(url, MEDIA_FILTER_PARAMS.mime, normalized.mimeTypes?.join(","));
  setOrDelete(url, MEDIA_FILTER_PARAMS.minSize, normalized.minSize?.toString());
  setOrDelete(url, MEDIA_FILTER_PARAMS.maxSize, normalized.maxSize?.toString());
  setOrDelete(url, MEDIA_FILTER_PARAMS.minWidth, normalized.minWidth?.toString());
  setOrDelete(url, MEDIA_FILTER_PARAMS.maxWidth, normalized.maxWidth?.toString());
  setOrDelete(url, MEDIA_FILTER_PARAMS.minHeight, normalized.minHeight?.toString());
  setOrDelete(url, MEDIA_FILTER_PARAMS.maxHeight, normalized.maxHeight?.toString());

  if (options.jsonPath !== undefined) {
    const jsonPath = options.jsonPath.trim().slice(0, MEDIA_JSON_PATH_MAX_LENGTH);
    setOrDelete(url, "jsonPath", jsonPath || undefined);
  }

  url.searchParams.delete("page");
  return url;
}

/**
 * The subset of an advanced-search criteria object the adapters can evaluate.
 * Everything else (tags, EXIF, duplicates, dates, aspect ratio) stays a
 * page-scoped client filter.
 */
export function structuredFiltersFromCriteria(criteria: SearchCriteria): MediaStructuredFilters {
  return normalizeMediaStructuredFilters({
    mimeTypes: criteria.fileTypes,
    minSize: criteria.minSize,
    maxSize: criteria.maxSize,
    minWidth: criteria.minWidth,
    maxWidth: criteria.maxWidth,
    minHeight: criteria.minHeight,
    maxHeight: criteria.maxHeight,
  });
}

/**
 * Drop the pushed-down fields, so the client fallback cannot re-filter rows the
 * adapter already matched — re-applying a size bound to a slimmed gallery row
 * would hide a valid server match.
 */
export function clientSideCriteria(criteria: SearchCriteria): SearchCriteria {
  const residual: SearchCriteria = { ...criteria };
  delete residual.fileTypes;
  delete residual.minSize;
  delete residual.maxSize;
  delete residual.minWidth;
  delete residual.maxWidth;
  delete residual.minHeight;
  delete residual.maxHeight;
  return residual;
}

function setOrDelete(url: URL, key: string, value: string | undefined): void {
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
}
