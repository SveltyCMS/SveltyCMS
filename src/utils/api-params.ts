/**
 * @file src/utils/api-params.ts
 * @description High-performance single-pass query parameter parsers for CMS API endpoints.
 *
 * ### Features:
 * - Single-pass iteration over URLSearchParams (replaces 10+ individual get() calls)
 * - Safe numeric parsing with fallback defaults (limit: 50, offset: 0)
 * - JSON and bracket filter syntax normalization (`filter[key]=val` + `filter={...}`)
 * - Comma-separated list splitting for populate and field projections
 */

export interface CollectionQueryParams {
  limit: number;
  offset: number;
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
 * Single-pass parser for standard collection query parameters.
 * Replaces multiple redundant searchParams.get calls with one unified parse loop.
 */
export function parseCollectionQueryParams(searchParams: URLSearchParams): CollectionQueryParams {
  let limit = 50;
  let offset = 0;
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
      const n = Number(value);
      if (!isNaN(n) && n > 0) limit = n;
    } else if (key === "offset") {
      const n = Number(value);
      if (!isNaN(n) && n >= 0) offset = n;
    } else if (key === "sortField" || key === "sort") {
      if (!sortField) sortField = value;
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
    } else if (key.startsWith("filter[")) {
      filter[key.slice(7, -1)] = value;
    } else if (key === "filter") {
      try {
        Object.assign(filter, JSON.parse(value));
      } catch {
        /* ignore malformed json */
      }
    }
  }

  return {
    limit,
    offset,
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
      const n = Number(value);
      if (!isNaN(n) && n > 0) limit = n;
    } else if (key === "offset") {
      const n = Number(value);
      if (!isNaN(n) && n >= 0) offset = n;
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
      if (!isNaN(n) && n > 0) limit = n;
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
