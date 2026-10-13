/**
 * @file src/utils/dashboard-drilldown.ts
 * @description Builds click-through URLs from dashboard analytics widgets into
 * the collection entry list, using the shared `filter_{field}` URL contract.
 *
 * Features:
 * - language-prefixed collection route (`/{lang}/{collection}`)
 * - equality filter per category (`filter_{field}=value`)
 * - safe encoding via URLSearchParams; empty / "Other" buckets add no filter
 */

import { FILTER_URL_PREFIX } from "@utils/collection-query-filters";

export interface DrilldownOptions {
  language: string;
  collection: string;
  /** Field → value equality filters. Nullish or empty values are skipped. */
  filters?: Record<string, string | number | boolean | null | undefined>;
}

/** Bucket labels the analytics service emits for rows without a real value. */
const NON_FILTERABLE_LABELS = new Set(["Other", ""]);

export function isFilterableBucket(label: string | null | undefined): label is string {
  return typeof label === "string" && !NON_FILTERABLE_LABELS.has(label);
}

export function buildCollectionDrilldownHref(options: DrilldownOptions): string {
  const base = `/${encodeURIComponent(options.language)}/${encodeURIComponent(options.collection)}`;
  const params = new URLSearchParams();
  for (const [field, value] of Object.entries(options.filters ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    params.set(`${FILTER_URL_PREFIX}${field}`, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
