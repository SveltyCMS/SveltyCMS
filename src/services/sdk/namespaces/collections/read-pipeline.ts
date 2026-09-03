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
 * - pre-compiled projection tokens (bounded LRU) for cache-key interpolation
 * - request-cache → sync L2 → async L2 read-through with payload wrapping
 * - decryptReadResult: AES-256-GCM field decryption after DB/cache fetch
 * - assertEncryptedFieldsNotQueried: reject filter/sort on encrypted fields
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
import { serializeQueryShape } from "@utils/fast-json";
import { AppError } from "@utils/error-handling";
import {
  decryptDocumentFields,
  type FieldEncryptionContext,
} from "@utils/security/field-encryption";
import type { SchemaHotFlags } from "./schema-store";

/**
 * Normalize relationship-style filters into Mongo-ish operators.
 * `{ rel: ["a","b"] }` → `{ rel: { $in: ["a","b"] } }`,
 * `{ rel: { $eq: [...] } }` → `$in`, `{ rel: { $ne: [...] } }` → `$nin`.
 *
 * Uses zero-allocation object traversal with lazy cloning only when an operator is rewritten.
 */
export function normalizeRelationshipFilter(filter: any): any {
  if (Array.isArray(filter) || isEmptyQueryFilter(filter)) return filter;
  let normalized: Record<string, any> | null = null;

  for (const key in filter) {
    if (!Object.hasOwn(filter, key)) continue;
    const value = filter[key];
    if (value && typeof value === "object") {
      if ("$eq" in value && Array.isArray((value as any).$eq)) {
        if (!normalized) normalized = { ...filter };
        normalized![key] = { $in: (value as any).$eq };
      } else if ("$ne" in value && Array.isArray((value as any).$ne)) {
        if (!normalized) normalized = { ...filter };
        normalized![key] = { $nin: (value as any).$ne };
      }
    } else if (Array.isArray(value)) {
      if (!normalized) normalized = { ...filter };
      normalized![key] = { $in: value };
    }
  }
  return normalized ?? filter;
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

function hasExtraQueryKeys(query: Record<string, unknown>): boolean {
  for (const k in query) {
    if (Object.hasOwn(query, k) && k !== "tenantId" && k !== "status") {
      return true;
    }
  }
  return false;
}

function isSingleKeyObject(obj: Record<string, unknown>, targetKey: string): boolean {
  let count = 0;
  for (const k in obj) {
    if (Object.hasOwn(obj, k)) {
      count++;
      if (count > 1 || k !== targetKey) return false;
    }
  }
  return count === 1;
}

/** Max entries in the projection-token LRU cache (bounded — never unbounded). */
const PROJECTION_TOKEN_CACHE_MAX = 500;

/**
 * Bounded LRU cache: canonical field encoding → pre-serialized projection
 * token. Repeated find() calls with identical fields/populate arrays skip the
 * per-call JSON.stringify re-walk that serializeQueryShape would otherwise do
 * on every hash.
 */
const projectionTokenCache = new Map<string, string>();

function getCachedProjectionToken(key: string): string | undefined {
  const token = projectionTokenCache.get(key);
  if (token !== undefined) {
    // LRU refresh: delete + re-set so the entry counts as most-recently-used.
    projectionTokenCache.delete(key);
    projectionTokenCache.set(key, token);
  }
  return token;
}

function setCachedProjectionToken(key: string, token: string): string {
  if (projectionTokenCache.size >= PROJECTION_TOKEN_CACHE_MAX) {
    const oldest: string | undefined = projectionTokenCache.keys().next().value;
    if (oldest !== undefined) projectionTokenCache.delete(oldest);
  }
  projectionTokenCache.set(key, token);
  return token;
}

/**
 * Collision-free single-pass key for a string array.
 *
 * A bare comma join would make `["a","b"]` and `["a,b"]` share the key
 * `"a,b"` — two distinct projections would then serve each other's cached
 * responses. Length-prefixing every element makes the encoding injective:
 * `["a","b"]` → `"1:a,1:b"`, `["a,b"]` → `"3:a,b"`.
 */
function encodeFieldKey(fields: readonly string[]): string {
  if (fields.length === 0) return "";
  let out = `${fields[0].length}:${fields[0]}`;
  for (let i = 1; i < fields.length; i++) {
    out += `,${fields[i].length}:${fields[i]}`;
  }
  return out;
}

/**
 * Pre-serialized serializeQueryShape-compatible projection component.
 *
 * Mirrors the exact serialization serializeQueryShape produces for its
 * fields/populate arguments (`JSON.stringify` for arrays/objects, `String()`
 * for other truthy values, `""` for falsy), so the FNV branch can feed the
 * cached token straight back into serializeQueryShape without changing the
 * hash input. String[] inputs are keyed by their length-prefixed encoding — a
 * single cheap pass instead of a JSON.stringify re-walk on every call.
 */
function serializeShapeComponent(fields: unknown): string {
  if (!fields) return "";
  if (Array.isArray(fields)) {
    if (fields.length === 0) return "[]"; // constant — matches JSON.stringify([])
    const key = encodeFieldKey(fields);
    const cached = getCachedProjectionToken(key);
    if (cached !== undefined) return cached;
    return setCachedProjectionToken(key, JSON.stringify(fields));
  }
  if (typeof fields === "object") {
    // Nested/object shapes: serializeQueryShape-compatible short form.
    const serialized = JSON.stringify(fields);
    return setCachedProjectionToken(`o:${serialized}`, serialized);
  }
  return String(fields);
}

/**
 * Canonical projection token for cache-key interpolation (status-only branch).
 *
 * undefined/null/empty → `""`, string[] → the collision-free length-prefixed
 * encoding (the same key the shape cache is keyed by), nested/object shapes →
 * the serializeQueryShape-compatible short form cached on the canonical key.
 */
export function canonicalFieldToken(fields: unknown): string {
  if (fields === undefined || fields === null || fields === "") return "";
  if (Array.isArray(fields)) {
    return fields.length === 0 ? "" : encodeFieldKey(fields);
  }
  if (typeof fields === "object") return serializeShapeComponent(fields);
  return String(fields);
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
  const isDefaultList =
    !options.fields &&
    !options.populate &&
    limit === 50 &&
    offset === 0 &&
    !sort &&
    !decodedCursor &&
    !hasExtraQueryKeys(query);

  if (isDefaultList) {
    return `${tenantPrefix}collection:${schemaId}:find:default_50${publicationCacheSuffix(effectiveFilter)}`;
  }
  if (query._id && isSingleKeyObject(query, "_id") && limit === 50 && offset === 0 && !sort) {
    return `${tenantPrefix}collection:${schemaId}:find:id:${query._id}`;
  }
  if (!decodedCursor && isEmptyQueryFilter(filter)) {
    // Status-only list (no extra filter) — skip JSON.stringify. Fields/populate
    // interpolate via the canonical token (comma join for arrays) so repeated
    // finds with identical projections reuse the same string.
    return `${tenantPrefix}collection:${schemaId}:find:${effectiveFilter}:${limit}:${offset}:${options.sortField ?? ""}:${options.sortDirection ?? "desc"}:${canonicalFieldToken(options.fields)}:${canonicalFieldToken(options.populate)}`;
  }
  // Sync FNV with flat delimited query shape — avoids JSON.stringify
  // reflection tax on list queries. fields/populate shape the RESPONSE,
  // so they must be part of the key (pre-serialized via the token cache).
  const queryHash = syncQueryHash(
    serializeQueryShape(
      query,
      limit,
      offset,
      sort,
      serializeShapeComponent(options.fields),
      serializeShapeComponent(options.populate),
    ),
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

function shallowCloneDoc(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;
  return { ...(doc as Record<string, unknown>) };
}

async function decryptOneDoc(
  doc: unknown,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Promise<unknown> {
  if (!doc || typeof doc !== "object") return doc;
  await decryptDocumentFields(doc as Record<string, unknown>, fieldNames, context);
  return doc;
}

/**
 * Decrypt `encrypt: true` fields on an SDK `{ success, data }` envelope (or a
 * bare document / array). When `clone` is true (default), the source is not
 * mutated — required so L1/L2 caches keep ciphertext.
 */
export async function decryptReadResult(
  result: any,
  hot: SchemaHotFlags,
  context: FieldEncryptionContext,
  opts?: { clone?: boolean },
): Promise<any> {
  if (!hot._hasEncryptedFields || !hot._encryptedFieldNames?.length) return result;
  if (!result) return result;

  const fieldNames = hot._encryptedFieldNames;
  const clone = opts?.clone !== false;

  const decryptData = async (data: unknown): Promise<unknown> => {
    if (Array.isArray(data)) {
      const out = clone ? data.map(shallowCloneDoc) : data;
      for (let i = 0; i < out.length; i++) {
        out[i] = await decryptOneDoc(out[i], fieldNames, context);
      }
      return out;
    }
    const doc = clone ? shallowCloneDoc(data) : data;
    return decryptOneDoc(doc, fieldNames, context);
  };

  if (typeof result === "object" && "success" in result && "data" in result) {
    if (result.data == null) return result;
    const data = await decryptData(result.data);
    return clone ? { ...result, data } : result;
  }

  return decryptData(result);
}

/**
 * Encrypted fields cannot be filtered or sorted: AES-256-GCM IVs are random,
 * so equality on plaintext never matches stored ciphertext.
 */
export function assertEncryptedFieldsNotQueried(
  filter: any,
  hot: SchemaHotFlags,
  sortField?: string,
): void {
  if (!hot._hasEncryptedFields || !hot._encryptedFieldNames?.length) return;
  const names = new Set(hot._encryptedFieldNames);

  if (sortField && names.has(sortField)) {
    throw new AppError(
      `Cannot sort by encrypted field "${sortField}".`,
      400,
      "ENCRYPTED_FIELD_NOT_QUERYABLE",
    );
  }

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    const rec = node as Record<string, unknown>;
    for (const key in rec) {
      if (!Object.hasOwn(rec, key)) continue;
      if (key.startsWith("$")) {
        walk(rec[key]);
        continue;
      }
      if (names.has(key)) {
        throw new AppError(
          `Cannot filter on encrypted field "${key}".`,
          400,
          "ENCRYPTED_FIELD_NOT_QUERYABLE",
        );
      }
    }
  };

  walk(filter);
}

/**
 * Decrypt each document yielded by a collection stream (findStreaming).
 */
export async function* decryptReadStream(
  source: AsyncIterable<any>,
  hot: SchemaHotFlags,
  context: FieldEncryptionContext,
): AsyncIterable<any> {
  if (!hot._hasEncryptedFields || !hot._encryptedFieldNames?.length) {
    yield* source;
    return;
  }
  const fieldNames = hot._encryptedFieldNames;
  for await (const doc of source) {
    const clone = shallowCloneDoc(doc);
    yield await decryptOneDoc(clone, fieldNames, context);
  }
}
