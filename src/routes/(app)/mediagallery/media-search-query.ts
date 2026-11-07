/**
 * @file src/routes/(app)/mediagallery/media-search-query.ts
 * @description URL contract for the gallery's server-side search.
 *
 * Features:
 * - writes the canonical `?q=` parameter (never the legacy `?search=` alias)
 * - always drops `?page=` so a new query starts at the first result page
 * - trims and caps the query the same way `+page.server.ts` does
 */

/** Matches the loader's `slice(0, 100)` cap so the URL and the query agree. */
export const MEDIA_SEARCH_MAX_LENGTH = 100;

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
