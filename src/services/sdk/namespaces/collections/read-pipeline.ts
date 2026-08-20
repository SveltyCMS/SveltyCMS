/**
 * @file src/services/sdk/namespaces/collections/read-pipeline.ts
 * @description
 * Read-path helpers for the collections namespace: filter normalization,
 * tenant/publication query building, find cache keys, and L1→L2 cache
 * read-through.
 *
 * ### Features:
 * - tenantId injection + publication clamping in one query build
 * - publication-aware cache keys (clamped callers never see cached "all" docs)
 * - sync FNV-1a query hashing (no WASM/async tax on list queries)
 * - request-cache → sync L2 → async L2 read-through with payload wrapping
 */

import { isEmptyQueryFilter, type PageCursorPayload } from "@src/databases/core/page-utils";
import {
  applyPublicationToQuery,
  publicationCacheSuffix,
  resolvePublicationFilter,
  type ActorContext,
  type PublicationFilter,
} from "@utils/security/publication-policy";
import { cacheService } from "@src/databases/cache/cache-service";
import type { DatabaseId } from "@src/databases/db-interface";
import { getRequestCache, hasRequestCache, setRequestCache } from "./request-cache";

/**
 * Normalize relationship-style filters into Mongo-ish operators.
 * `{ rel: ["a","b"] }` → `{ rel: { $in: ["a","b"] } }`,
 * `{ rel: { $eq: [...] } }` → `$in`, `{ rel: { $ne: [...] } }` → `$nin`.
 */
export function normalizeRelationshipFilter(filter: any): any {
  if (Array.isArray(filter) || isEmptyQueryFilter(filter)) return filter;
  const normalized = { ...filter };

  for (const [key, value] of Object.entries(normalized)) {
    if (value && typeof value === "object") {
      if ("$eq" in (value as any) && Array.isArray((value as any).$eq)) {
        (normalized as any)[key] = { $in: (value as any).$eq };
      } else if ("$ne" in (value as any) && Array.isArray((value as any).$ne)) {
        (normalized as any)[key] = { $nin: (value as any).$ne };
      }
    } else if (Array.isArray(value)) {
      (normalized as any)[key] = { $in: value };
    }
  }
  return normalized;
}

/**
 * Build a tenant-scoped query with publication clamping applied.
 * Every DB query must keep tenantId injection exactly as today, and cached
 * "all" documents must never reach clamped callers — the returned
 * `effectiveFilter` feeds the publication-aware cache-key suffix.
 */
export function buildTenantQuery(
  filter: any,
  tenantId: DatabaseId | null | undefined,
  actor: ActorContext,
  requestedPublicationFilter: PublicationFilter | string | null | undefined,
): { query: any; effectiveFilter: PublicationFilter } {
  const query: any = {
    ...filter,
    ...(tenantId && { tenantId: tenantId as DatabaseId }),
  };
  const effectiveFilter = resolvePublicationFilter(actor, requestedPublicationFilter ?? null);
  applyPublicationToQuery(query, effectiveFilter);
  return { query, effectiveFilter };
}

/**
 * Sync FNV-1a hash for query cache keys — avoids async hash-wasm on every list find.
 */
export function syncQueryHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface BuildFindCacheKeyParams {
  schemaId: string;
  tenantId: DatabaseId | null | undefined;
  /** Raw caller filter — used by the status-only branch (not the merged query). */
  filter: any;
  /** Merged query (cursor + tenant + publication already applied). */
  query: any;
  limit: number;
  offset: number;
  sort: any;
  decodedCursor: PageCursorPayload | null;
  effectiveFilter: PublicationFilter;
  skipRequestCache: boolean;
  bypassCache: boolean;
  options: {
    fields?: any;
    populate?: any;
    sortField?: string;
    sortDirection?: string;
  };
}

/**
 * Reproduce find()'s four-branch cache key logic exactly:
 * default_50 → :find:id: → status-only → FNV hash of the full query shape.
 * Returns null when both request cache and L2 are bypassed.
 */
export function buildFindCacheKey(params: BuildFindCacheKeyParams): string | null {
  const {
    schemaId,
    tenantId,
    filter,
    query,
    limit,
    offset,
    sort,
    decodedCursor,
    effectiveFilter,
    skipRequestCache,
    bypassCache,
    options,
  } = params;

  if (skipRequestCache && bypassCache) return null;

  const tenantPrefix = tenantId ? `${tenantId}:` : "global:";
  const extraQueryKeys = Object.keys(query).filter((k) => k !== "tenantId" && k !== "status");
  const isDefaultList =
    !options.fields &&
    !options.populate &&
    limit === 50 &&
    offset === 0 &&
    !sort &&
    !decodedCursor &&
    extraQueryKeys.length === 0;

  if (isDefaultList) {
    return `${tenantPrefix}collection:${schemaId}:find:default_50${publicationCacheSuffix(effectiveFilter)}`;
  }
  if (query._id && Object.keys(query).length === 1 && limit === 50 && offset === 0 && !sort) {
    return `${tenantPrefix}collection:${schemaId}:find:id:${query._id}`;
  }
  if (!decodedCursor && (!filter || Object.keys(filter).length === 0)) {
    // Status-only list (no extra filter) — skip JSON.stringify.
    return `${tenantPrefix}collection:${schemaId}:find:${effectiveFilter}:${limit}:${offset}:${options.sortField ?? ""}:${options.sortDirection ?? "desc"}:${options.fields ?? ""}:${options.populate ?? ""}`;
  }
  // Sync FNV — no WASM/async tax on list queries. fields/populate shape
  // the RESPONSE, so they must be part of the key — a projected list
  // would otherwise poison a later full list (missing media/relation data).
  const queryHash = syncQueryHash(
    JSON.stringify({
      query,
      limit,
      offset,
      sort,
      fields: options.fields ?? null,
      populate: options.populate ?? null,
    }),
  );
  return `${tenantPrefix}collection:${schemaId}:find:${queryHash}`;
}

/** Wrap a raw cache payload into the canonical `{ success, data }` envelope. */
export function normalizeCachePayload(raw: any): any {
  return raw && typeof raw === "object" && "success" in raw ? raw : { success: true, data: raw };
}

/**
 * Read-through with the same null checks and payload wrapping as the legacy
 * inline logic: request cache first, then cacheService.getSync, then
 * cacheService.get. Callers re-register the key with their collectionId
 * after a hit so list keys keep joining the keyspace index.
 */
export async function readThroughCache(
  cacheKey: string,
  tenantId: DatabaseId | null | undefined,
  opts: { skipRequestCache: boolean; bypassCache: boolean },
): Promise<{ hit: boolean; payload?: any }> {
  if (!opts.skipRequestCache && hasRequestCache(cacheKey)) {
    return { hit: true, payload: getRequestCache(cacheKey) };
  }

  if (!opts.bypassCache) {
    const syncCached = cacheService.getSync?.<any>(cacheKey, (tenantId || undefined) as string);
    if (syncCached !== undefined && syncCached !== null) {
      const payload = normalizeCachePayload(syncCached);
      setRequestCache(cacheKey, payload);
      return { hit: true, payload };
    }
    try {
      const cached = await cacheService.get<any>(cacheKey, (tenantId || undefined) as string);
      if (cached !== undefined && cached !== null) {
        const payload = normalizeCachePayload(cached);
        setRequestCache(cacheKey, payload);
        return { hit: true, payload };
      }
    } catch {}
  }

  return { hit: false };
}
