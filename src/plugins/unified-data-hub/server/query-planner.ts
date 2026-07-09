/**
 * @file src/plugins/unified-data-hub/server/query-planner.ts
 * @description v1.5 query normalization — AST, capability pre-check, connector translation.
 *
 * Phase A of the virtual query planner (single-source passthrough). Normalizes incoming
 * read options against the virtual schema, validates connector capabilities, and
 * produces connector-native query fragments (SQL filters via request, REST params).
 *
 * Features:
 * - FederatedQueryAST normalization
 * - Schema field validation
 * - WordPress REST filter param pushdown (slug, status, search)
 * - Effective capability resolution per platform
 */

import type {
  ConnectorCapabilities,
  ConnectorRecord,
  VirtualCollectionReadOptions,
  VirtualCollectionRecord,
  VirtualReadRequest,
} from "../types";
import { FederationError } from "../types";

export type FilterOperator = "eq";

export interface NormalizedFilter {
  field: string;
  sourceField: string;
  operator: FilterOperator;
  value: unknown;
}

export interface NormalizedSort {
  field: string;
  sourceField: string;
  direction: "asc" | "desc";
}

/** Internal AST — v1.5 single-source; no decomposition tree */
export interface FederatedQueryAST {
  collectionId: string;
  tenantId: string;
  filters: NormalizedFilter[];
  sort: NormalizedSort | null;
  limit: number;
  offset: number;
  select: string[];
  clamped: boolean;
}

export interface PlannedVirtualQuery {
  ast: FederatedQueryAST;
  request: VirtualReadRequest;
  effectiveCapabilities: ConnectorCapabilities;
  restQueryParams: Record<string, string>;
  clientFilters: NormalizedFilter[];
}

function fieldMap(collection: VirtualCollectionRecord): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of collection.fields) {
    map.set(f.name, f.sourceField);
  }
  return map;
}

function resolveFieldName(name: string, fields: Map<string, string>): string {
  if (!fields.has(name)) {
    throw new FederationError(
      "CONNECTOR_CAPABILITY_EXCEEDED",
      `Unknown virtual field: ${name}`,
      400,
    );
  }
  return name;
}

export function rejectHybridQuery(filter?: Record<string, unknown>): void {
  if (!filter) return;
  for (const key of Object.keys(filter)) {
    if (key.startsWith("_native.") || key.includes(".")) {
      throw new FederationError(
        "FEDERATION_HYBRID_QUERY_NOT_SUPPORTED",
        "Hybrid native+virtual queries are not supported in v1.0",
        400,
      );
    }
  }
}

export function rejectMultiCollection(collectionIds: string[]): void {
  if (collectionIds.length > 1) {
    throw new FederationError(
      "FEDERATION_JOIN_NOT_SUPPORTED",
      "Cross-source joins are not supported in v1.0",
      400,
    );
  }
}

/** Resolves effective capabilities (WordPress REST enables partial filter pushdown). */
export function resolveEffectiveCapabilities(
  connector: ConnectorRecord,
  collection: VirtualCollectionRecord,
): ConnectorCapabilities {
  const base = { ...connector.capabilities };
  if (connector.type === "rest" && collection.source.platform === "wordpress") {
    return { ...base, filterPushdown: true, sortPushdown: true };
  }
  return base;
}

export function normalizeVirtualQuery(
  options: VirtualCollectionReadOptions,
  collection: VirtualCollectionRecord,
  connector: ConnectorRecord,
): FederatedQueryAST {
  rejectHybridQuery(options.filter);

  const fields = fieldMap(collection);
  const maxPage = connector.capabilities.maxPageSize ?? 100;
  const requestedLimit = options.limit ?? 25;
  const clamped = requestedLimit > maxPage;
  const limit = Math.min(Math.max(1, requestedLimit), maxPage);
  const offset = Math.max(0, options.offset ?? 0);

  const filters: NormalizedFilter[] = [];
  if (options.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      const field = resolveFieldName(key, fields);
      filters.push({
        field,
        sourceField: fields.get(field)!,
        operator: "eq",
        value,
      });
    }
  }

  let sort: NormalizedSort | null = null;
  if (options.sort?.field) {
    const field = resolveFieldName(options.sort.field, fields);
    sort = {
      field,
      sourceField: fields.get(field)!,
      direction: options.sort.direction === "desc" ? "desc" : "asc",
    };
  }

  const select: string[] = [];
  if (options.select?.length) {
    for (const name of options.select) {
      resolveFieldName(name, fields);
      select.push(name);
    }
  }

  return {
    collectionId: String(collection._id),
    tenantId: String(options.tenantId ?? "default"),
    filters,
    sort,
    limit,
    offset,
    select,
    clamped,
  };
}

export function validateQueryCapabilities(
  ast: FederatedQueryAST,
  capabilities: ConnectorCapabilities,
  connector: ConnectorRecord,
  collection: VirtualCollectionRecord,
): void {
  if (ast.sort && !capabilities.sortPushdown) {
    throw new FederationError(
      "CONNECTOR_CAPABILITY_EXCEEDED",
      "Sort pushdown not supported by this connector",
      400,
    );
  }

  if (ast.filters.length === 0) return;

  if (!capabilities.filterPushdown) {
    throw new FederationError(
      "CONNECTOR_CAPABILITY_EXCEEDED",
      "Filter pushdown not supported by this connector",
      400,
    );
  }

  if (connector.type === "rest" && collection.source.platform === "wordpress") {
    // Partial pushdown — remainder handled client-side after fetch
    return;
  }

  if (connector.type === "rest") {
    throw new FederationError(
      "CONNECTOR_CAPABILITY_EXCEEDED",
      "Filter pushdown not supported by this REST connector",
      400,
    );
  }
}

/** Maps normalized filters to WordPress REST query params; returns client-side remainder. */
export function translateWordPressRestParams(filters: NormalizedFilter[]): {
  params: Record<string, string>;
  clientFilters: NormalizedFilter[];
} {
  const params: Record<string, string> = {};
  const clientFilters: NormalizedFilter[] = [];

  for (const filter of filters) {
    if (filter.operator !== "eq") {
      clientFilters.push(filter);
      continue;
    }
    const value = String(filter.value ?? "");
    switch (filter.field) {
      case "slug":
        params.slug = value;
        break;
      case "status":
        params.status = value;
        break;
      case "title":
        params.search = value;
        break;
      default:
        clientFilters.push(filter);
    }
  }

  return { params, clientFilters };
}

const WORDPRESS_SORT_FIELDS = new Set(["title", "slug", "date", "modified", "id"]);

/** Maps normalized sort to WordPress REST orderby/order params. */
export function translateWordPressRestSort(sort: NormalizedSort | null): Record<string, string> {
  if (!sort || !WORDPRESS_SORT_FIELDS.has(sort.field)) return {};
  return {
    orderby: sort.field,
    order: sort.direction,
  };
}

export function translateToConnectorQuery(
  ast: FederatedQueryAST,
  collection: VirtualCollectionRecord,
  connector: ConnectorRecord,
  user?: VirtualReadRequest["user"],
): Pick<PlannedVirtualQuery, "request" | "restQueryParams" | "clientFilters"> {
  const filterRecord: Record<string, unknown> = {};
  let restQueryParams: Record<string, string> = {};
  let clientFilters: NormalizedFilter[] = [];

  if (connector.type === "postgres") {
    for (const f of ast.filters) {
      filterRecord[f.sourceField] = f.value;
    }
  } else if (connector.type === "rest" && collection.source.platform === "wordpress") {
    const translated = translateWordPressRestParams(ast.filters);
    restQueryParams = { ...translated.params, ...translateWordPressRestSort(ast.sort) };
    clientFilters = translated.clientFilters;
  } else if (ast.filters.length > 0) {
    for (const f of ast.filters) {
      filterRecord[f.field] = f.value;
    }
  }

  const request: VirtualReadRequest = {
    collectionId: ast.collectionId,
    tenantId: ast.tenantId,
    filter: Object.keys(filterRecord).length > 0 ? filterRecord : undefined,
    sort: ast.sort ? { field: ast.sort.sourceField, direction: ast.sort.direction } : undefined,
    limit: ast.limit,
    offset: ast.offset,
    select: ast.select.length > 0 ? ast.select : undefined,
    user,
  };

  return { request, restQueryParams, clientFilters };
}

export function planVirtualQuery(
  options: VirtualCollectionReadOptions,
  collection: VirtualCollectionRecord,
  connector: ConnectorRecord,
): PlannedVirtualQuery {
  const ast = normalizeVirtualQuery(options, collection, connector);
  const effectiveCapabilities = resolveEffectiveCapabilities(connector, collection);
  validateQueryCapabilities(ast, effectiveCapabilities, connector, collection);

  const { request, restQueryParams, clientFilters } = translateToConnectorQuery(
    ast,
    collection,
    connector,
    options.user,
  );

  return {
    ast,
    request,
    effectiveCapabilities,
    restQueryParams,
    clientFilters,
  };
}
