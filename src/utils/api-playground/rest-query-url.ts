/**
 * @file src/utils/api-playground/rest-query-url.ts
 * @description Pure builders for the REST request the admin API playground's
 * visual query builder sends (`/config/api`).
 *
 * Extracted from `visual-query-builder.svelte` so the URL contract is
 * unit-testable and cannot drift from the route that consumes it:
 *
 * - Path: `GET /api/collections/{name}` — the collection list endpoint declared
 *   in the OpenAPI spec (`api-spec-service`). The builder used to send
 *   `/api/collections/{name}/entries`, which the collections dispatcher reads as
 *   a *point* read of an entry literally named `entries` (handlers/collections.ts
 *   `segments[2]`), so the request never became a filtered list query.
 * - Filters: `filter[field][operator]=value`, folded back into the query by
 *   `parseCollectionQueryParams` (utils/api-params.ts). The operator is always
 *   explicit: a bare `filter[field]=value` is decoded as a `contains` match, so
 *   an `eq` row must say `eq`.
 * - Sort: `sort=-field` / `sort=+field` (a bare field inherits the parser's
 *   default `desc`, which silently inverted ascending sorts).
 * - Paging: `limit` / `offset` (the parser knows `offset`, not `skip`).
 */

/** Operators offered by the playground's filter rows. */
export type PlaygroundFilterOperator = "eq" | "ne" | "contains" | "gt" | "lt" | "in";

export interface PlaygroundFilterRow {
  field: string;
  operator: PlaygroundFilterOperator;
  value: string;
}

export interface PlaygroundQueryInput {
  collectionId: string;
  filters?: readonly PlaygroundFilterRow[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** The documented collection list path (`api-spec-service`: `GET /collections/{name}`). */
export function buildCollectionRestPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) throw new Error("A collection id is required to build a REST query");
  return `/api/collections/${encodeURIComponent(id)}`;
}

/**
 * One `filter[field][operator]=value` entry per non-empty row, in row order.
 * Rows without a field or a value are dropped; the first row wins when the same
 * field + operator pair is repeated.
 */
export function buildFilterSearchParams(
  filters: readonly PlaygroundFilterRow[] = [],
): URLSearchParams {
  const params = new URLSearchParams();
  for (const row of filters) {
    const field = row.field.trim();
    const value = row.value.trim();
    if (!field || !value) continue;
    const key = `filter[${field}][${row.operator}]`;
    if (params.has(key)) continue;
    params.set(key, value);
  }
  return params;
}

/**
 * Full same-origin URL for one "Run" click. Built synchronously from component
 * state: the playground sends exactly one request per click and never one per
 * keystroke.
 */
export function buildCollectionRestUrl(input: PlaygroundQueryInput): string {
  const params = buildFilterSearchParams(input.filters);

  const sortField = input.sortField?.trim();
  if (sortField) {
    params.set("sort", `${input.sortOrder === "asc" ? "+" : "-"}${sortField}`);
  }

  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    params.set("limit", String(Math.trunc(input.limit)));
  }
  if (typeof input.offset === "number" && Number.isFinite(input.offset) && input.offset > 0) {
    params.set("offset", String(Math.trunc(input.offset)));
  }

  const query = params.toString();
  return `${buildCollectionRestPath(input.collectionId)}${query ? `?${query}` : ""}`;
}
