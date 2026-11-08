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
 */

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
const MEDIA_MAX_MIME_FILTERS = 20;
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
