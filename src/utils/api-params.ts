/**
 * @file src/utils/api-params.ts
 * @description High-performance single-pass query parameter parsers for CMS API endpoints.
 *
 * ### Features:
 * - Single-pass iteration over URLSearchParams (replaces 10+ individual get() calls)
 * - Safe numeric parsing with fallback defaults (limit: 50, offset: 0)
 * - JSON and bracket filter syntax normalization (`filter[key]=val` + `filter={...}`)
 * - Comma-separated list splitting for populate and field projections
 * - Hard page-size ceiling (MAX_PAGE_SIZE) shared by REST, SDK and GraphQL read paths
 */

/**
 * Hard upper bound for a single page of results on every read path that accepts a
 * client-supplied `limit` (REST query params, GraphQL resolvers/fast path, and the
 * SDK funnel `CollectionsNamespace.find`). Requests above this are clamped, never
 * rejected, so a client cannot ask an adapter for an unbounded result set while
 * existing callers asking for more than they need keep working.
 */
export const MAX_PAGE_SIZE = 200;

/**
 * Clamp a client-supplied page size into `1..MAX_PAGE_SIZE`.
 * Missing / non-finite / non-positive values fall back to `fallback` (default 50) —
 * the same lenient behavior the query parsers have always had, now with a ceiling.
 *
 * The result is always an integer: `LIMIT` must be a bigint on PostgreSQL, so a
 * fractional `limit`/`take` (1.5) reached the driver as a float bind and failed.
 */
export function clampPageSize(value: unknown, fallback = 50): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), MAX_PAGE_SIZE);
}

export interface CollectionQueryParams {
  limit: number;
  offset: number;
  /** Opaque keyset cursor (REST exposure of the SDK's `cursor` — deep pagination without offset scans). */
  cursor?: string;
  sortField?: string;
  sortDirection: "asc" | "desc";
  publicationFilter?: "published" | "draft" | "all";
  filter: Record<string, unknown>;
  bypassCache: boolean;
  populate?: string[];
  fields?: string[];
  stream: boolean;
  includeCount: boolean;
}

/** `filter[` prefix of the bracket filter syntax (`filter[title][contains]`). */
const FILTER_BRACKET_PREFIX = "filter[";

/**
 * URL operator names → the `$`-prefixed operators the query layer implements.
 *
 * `addSingleCondition` (databases/core/drizzle-sql-helpers.ts) and
 * `MONGO_OP_MAP` (databases/mongodb/adapter-core.ts) only treat `$`-prefixed
 * subkeys as operators; a bare one (`{ status: { eq: "published" } }`) is bound
 * whole as the compared value, which is a driver bind error (500) on SQL and a
 * never-matching equality on Mongo. So the parser — the one place that knows the
 * operator NAME the client used — translates it here, and every consumer
 * (list/stream/export) receives the shape the query layer understands.
 *
 * `contains` is the playground's substring match: SQL answers it with a LIKE
 * comparison, Mongo with an escaped case-insensitive regex.
 */
const FILTER_OPERATOR_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  eq: "$eq",
  ne: "$ne",
  gt: "$gt",
  gte: "$gte",
  lt: "$lt",
  lte: "$lte",
  in: "$in",
  nin: "$nin",
  contains: "$contains",
});

/** Operators whose value is a comma-separated list (`$in=a,b`). */
const LIST_FILTER_OPERATORS = new Set(["$in", "$nin"]);

/**
 * Every operator a field filter may carry: the URL names above (in their `$`
 * form), the engine-level spellings they translate to (`$regex` + `$options`,
 * Mongo's `$exists`) and the relation operators `compileRelationFilters`
 * compiles before any query reaches an adapter. Anything else — most commonly a
 * hand-written `{"status":{"eq":"x"}}` JSON filter or a typo — is rejected with
 * `400 FILTER_UNKNOWN_FIELD` instead of being bound as an object.
 */
const SUPPORTED_FILTER_OPERATORS: ReadonlySet<string> = new Set([
  ...Object.values(FILTER_OPERATOR_ALIASES),
  "$regex",
  "$options",
  "$exists",
  "some",
  "none",
  "every",
  "$some",
  "$none",
  "$every",
]);

/** A filter subkey that is not an operator the query layer implements. */
export interface UnsupportedFilterOperator {
  field: string;
  operator: string;
}

/**
 * Operator subkeys in `filter` that no engine implements.
 * Read-only: does not mutate the filter, allocates only for violations.
 */
export function unsupportedFilterOperators(filter: unknown): UnsupportedFilterOperator[] {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return [];
  let rejected: UnsupportedFilterOperator[] | null = null;
  for (const field in filter as Record<string, unknown>) {
    const value = (filter as Record<string, unknown>)[field];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const operator in value as Record<string, unknown>) {
      if (SUPPORTED_FILTER_OPERATORS.has(operator)) continue;
      (rejected ??= []).push({ field, operator });
    }
  }
  return rejected ?? [];
}

/**
 * Rewrite bare operator names (`eq`, `contains`, …) into their `$` form on a
 * freshly parsed filter object, so the `filter={…}` JSON syntax produces the
 * same shape as the bracket syntax. Unknown subkeys are kept verbatim: they are
 * what `unsupportedFilterOperators` reports.
 */
function normalizeFilterOperatorNames(parsed: Record<string, unknown>): Record<string, unknown> {
  for (const field in parsed) {
    const value = parsed[field];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const operators = value as Record<string, unknown>;
    for (const operator in operators) {
      const canonical = FILTER_OPERATOR_ALIASES[operator];
      if (!canonical || canonical === operator) continue;
      operators[canonical] = LIST_FILTER_OPERATORS.has(canonical)
        ? parseCommaSeparatedList(String(operators[operator] ?? ""))
        : operators[operator];
      delete operators[operator];
    }
  }
  return parsed;
}

/**
 * Split `filter[field]` / `filter[field][operator]` into its parts.
 * Returns an empty field for malformed keys (`filter[]`, `filter][x`).
 */
function splitFilterBracketKey(key: string): [string, string | undefined] {
  const inner = key.slice(FILTER_BRACKET_PREFIX.length, -1);
  const separator = inner.indexOf("][");
  if (separator === -1) return [inner.trim(), undefined];
  const operator = inner.slice(separator + 2).trim();
  return [inner.slice(0, separator).trim(), operator || undefined];
}

function parseCommaSeparatedList(value: string): string[] {
  if (!value.includes(",")) {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  const parts = value.split(",");
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (trimmed) result.push(trimmed);
  }
  return result;
}

/**
 * Pre-allocated frozen default parameters for empty query strings (`!url.search`).
 * Avoids constructing a `URLSearchParams` instance and iterating keys on plain list reads.
 */
export const DEFAULT_EMPTY_COLLECTION_QUERY_PARAMS: Readonly<CollectionQueryParams> = Object.freeze(
  {
    limit: 50,
    offset: 0,
    cursor: undefined,
    sortField: undefined,
    sortDirection: "desc",
    publicationFilter: undefined,
    filter: Object.freeze({}) as Record<string, unknown>,
    bypassCache: false,
    populate: undefined,
    fields: undefined,
    stream: false,
    includeCount: false,
  },
);

/**
 * Single-pass parser for standard collection query parameters.
 * Replaces multiple redundant searchParams.get calls with one unified parse loop.
 */
export function parseCollectionQueryParams(searchParams: URLSearchParams): CollectionQueryParams {
  let limit = 50;
  let offset = 0;
  let cursor: string | undefined = undefined;
  let sortField: string | undefined = undefined;
  let sortDirection: "asc" | "desc" = "desc";
  let publicationFilter: "published" | "draft" | "all" | undefined = undefined;
  let bypassCache = false;
  let populate: string[] | undefined = undefined;
  let fields: string[] | undefined = undefined;
  let stream = false;
  let includeCount = false;
  const filter: Record<string, unknown> = {};

  for (const [key, value] of searchParams.entries()) {
    if (key === "limit") {
      // `clampPageSize` owns the 1..MAX_PAGE_SIZE clamp and the integer floor
      // (`limit=2.7` must not reach a `LIMIT` bind).
      limit = clampPageSize(value, 50);
    } else if (key === "offset") {
      // OFFSET must be a non-negative safe integer on every engine. `Number()`
      // alone let `offset=Infinity` and `offset=1.5` through, while the sibling
      // `parsePaginationQueryParams` floors with `parseInt`.
      const n = Math.floor(Number(value));
      if (Number.isSafeInteger(n) && n >= 0) offset = n;
    } else if (key === "cursor") {
      // Opaque keyset cursor — pass-through; the SDK decodes and validates it.
      if (!cursor && value) cursor = value;
    } else if (key === "sortField" || key === "sort") {
      if (!sortField) {
        if (value.startsWith("-")) {
          sortField = value.slice(1);
          sortDirection = "desc";
        } else if (value.startsWith("+")) {
          sortField = value.slice(1);
          sortDirection = "asc";
        } else {
          sortField = value;
        }
      }
    } else if (key === "sortDirection" || key === "order") {
      sortDirection = value === "asc" ? "asc" : "desc";
    } else if (key === "publicationFilter") {
      if (value === "published" || value === "draft" || value === "all") {
        publicationFilter = value;
      }
    } else if (key === "bypassCache" || key === "nocache") {
      if (value === "true") bypassCache = true;
    } else if (key === "populate") {
      populate = parseCommaSeparatedList(value);
    } else if (key === "fields") {
      fields = parseCommaSeparatedList(value);
    } else if (key === "stream") {
      stream = value === "true";
    } else if (key === "includeCount") {
      includeCount = value === "true";
    } else if (key.startsWith(FILTER_BRACKET_PREFIX)) {
      // `filter[field]=v` (plain equality) and `filter[field][operator]=v`
      // (contains / eq / ne / gt / lt / in …). The operator is emitted in the
      // `$`-prefixed form the query layer implements — see FILTER_OPERATOR_ALIASES.
      // An operator the table does not know is passed through unchanged so the
      // SDK rejects it (`400 FILTER_UNKNOWN_FIELD`) instead of binding an object.
      const [field, rawOperator] = splitFilterBracketKey(key);
      if (!field) continue;
      if (!rawOperator) {
        filter[field] = value;
        continue;
      }
      const operator = FILTER_OPERATOR_ALIASES[rawOperator] ?? rawOperator;
      const current = filter[field];
      const operators =
        current && typeof current === "object" && !Array.isArray(current)
          ? { ...(current as Record<string, unknown>) }
          : {};
      operators[operator] = LIST_FILTER_OPERATORS.has(operator)
        ? parseCommaSeparatedList(value)
        : value;
      filter[field] = operators;
    } else if (key === "filter") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.assign(filter, normalizeFilterOperatorNames(parsed as Record<string, unknown>));
        }
      } catch {
        /* ignore malformed json */
      }
    }
  }

  return {
    limit,
    offset,
    cursor,
    sortField,
    sortDirection,
    publicationFilter,
    filter,
    bypassCache,
    populate,
    fields,
    stream,
    includeCount,
  };
}

export interface VirtualCollectionQueryParams {
  limit?: number;
  offset?: number;
  cursor?: string;
  sort?: { field: string; direction: "asc" | "desc" };
  filter?: Record<string, unknown>;
  bypassCache: boolean;
  include?: string[];
}

/**
 * Single-pass parser for virtual collection query parameters.
 */
export function parseVirtualCollectionQueryParams(
  searchParams: URLSearchParams,
): VirtualCollectionQueryParams {
  let limit: number | undefined;
  let offset: number | undefined;
  let cursor: string | undefined;
  let sortField: string | undefined;
  let sortDirection: "asc" | "desc" = "asc";
  let bypassCache = false;
  let include: string[] | undefined;
  let filter: Record<string, unknown> | undefined;

  for (const [key, value] of searchParams.entries()) {
    if (key === "limit") {
      limit = clampPageSize(value, 50);
    } else if (key === "offset") {
      // Same integer/range contract as `parseCollectionQueryParams`.
      const n = Math.floor(Number(value));
      if (Number.isSafeInteger(n) && n >= 0) offset = n;
    } else if (key === "cursor") {
      cursor = value;
    } else if (key === "sortField" || key === "sort") {
      sortField = value;
    } else if (key === "sortDirection" || key === "order") {
      sortDirection = value === "desc" ? "desc" : "asc";
    } else if (key === "bypassCache") {
      bypassCache = value === "true";
    } else if (key === "include") {
      include = parseCommaSeparatedList(value);
    } else if (key === "filter") {
      try {
        filter = JSON.parse(value);
      } catch {
        /* ignore invalid filter json */
      }
    }
  }

  return {
    limit,
    offset,
    cursor,
    sort: sortField ? { field: sortField, direction: sortDirection } : undefined,
    filter,
    bypassCache,
    include,
  };
}

export interface PaginationQueryParams {
  page: number;
  limit: number;
  offset: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  raw: boolean;
}

/**
 * Single-pass parser for paginated list endpoints (tokens, audits, logs).
 */
export function parsePaginationQueryParams(
  searchParams: URLSearchParams,
  defaultLimit = 50,
): PaginationQueryParams {
  let page = 1;
  let limit = defaultLimit;
  let search: string | undefined;
  let sort: string | undefined;
  let order: "asc" | "desc" | undefined;
  let raw = false;

  for (const [key, value] of searchParams.entries()) {
    if (key === "page") {
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) page = n;
    } else if (key === "limit") {
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) limit = Math.min(n, MAX_PAGE_SIZE);
    } else if (key === "search") {
      if (value.trim()) search = value.trim();
    } else if (key === "sort") {
      if (value.trim()) sort = value.trim();
    } else if (key === "order") {
      if (value === "asc" || value === "desc") order = value;
    } else if (key === "raw") {
      raw = value === "true";
    }
  }

  const offset = (page - 1) * limit;
  return { page, limit, offset, search, sort, order, raw };
}
