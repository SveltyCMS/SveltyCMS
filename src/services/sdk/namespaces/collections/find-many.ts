/**
 * @file src/services/sdk/namespaces/collections/find-many.ts
 * @description
 * Multi-row read pipeline for `CollectionsNamespace`: `find`, `search`,
 * `count` and status-facet counting. The class keeps the public methods and
 * delegates here, passing its adapter/schema dependencies as an explicit
 * context (no `this` inside this module).
 *
 * The bodies are moved verbatim from the namespace; only `this.*` became
 * `ctx.*` so the ordering of side effects (cache probes/writes, metrics,
 * widget pipeline, populate, plugin hooks, revisions, facets) is unchanged.
 *
 * ### Features:
 * - filter normalization, guarded-field stripping, schema-aware coercion
 * - relation-filter compilation, ownership + access-rule scoping, tenant and
 *   publication clamping in the original order
 * - keyset (cursor) and offset pagination with the original cache-key contract
 * - L1/L2 read-through, single-flight coalescing and SWR paths
 * - widget pipeline, populate resolution, per-language mapping, plugin SSR
 *   hooks, revisions, facets and the client-schema memo on the response path
 * - cross-collection search aggregation and SWR status-facet counts
 */

import {
  applyPublicationToQuery,
  resolvePublicationFilter,
} from "@utils/security/publication-policy";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { AppError, raise } from "@utils/error-handling";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import type {
  BaseEntity,
  CountOptions,
  DatabaseId,
  IDBAdapter,
  QueryBuilder,
  QueryFilter,
} from "@src/databases/db-interface";
import type { RevisionData, Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";
import { resolvePopulatedRelations } from "../populate-resolver";
import { hydrateJunctionFields, junctionFieldsOf } from "./junction-fields";
import {
  decodePageCursor,
  defaultListSortOption,
  defaultPageSortOption,
  encodePageCursor,
  mergeKeysetFilter,
  resolvePageSort,
  withIdTiebreaker,
} from "@src/databases/core/page-utils";
import { parseIdLookup } from "@src/databases/core/query-primitives";
import { clampPageSize, unsupportedFilterOperators } from "@utils/api-params";
import { blockedGuardedNames, stripGuardedFilter, stripGuardedSort } from "@utils/guarded-query";
import {
  getReadConstraint,
  mergeAccessConstraint,
} from "@src/services/security/access-rule-service";
import { buildCollectionCacheTags, collectionTableName } from "@src/databases/core/collection-name";
import {
  coerceFilterValues,
  getAllowedFilterFieldIds,
  getNestedFilterPaths,
  getSearchableFieldNames,
  rejectedFilterKeys,
} from "@utils/collection-query-filters.server";
import { mapEntryValues } from "@utils/entry-values";
import {
  countStatusFacets,
  type StatusFacetCounts,
} from "@src/services/core/collection-filter-engine";
import { recordListQuery } from "@utils/list-query-metrics";
import { deepClone } from "@utils/native-utils";
import type { EntryData } from "@utils/modify-request";
import { setRequestCache } from "./request-cache";
import { ensureSchemaHotFlags, type ContentSystem } from "./schema-store";
import {
  assertEncryptedFieldsNotQueried,
  buildFindCacheKey,
  buildTenantQuery,
  hydrateRelationDisplays,
  isHotCollectionId,
  normalizeRelationshipFilter,
  presentRead,
  readEncryptionContext,
  readThroughCache,
  NO_ENCRYPTION_CONTEXT,
  COLLECTION_QUERY_HOT_STALE_MS,
  COLLECTION_QUERY_STALE_MS,
  COLLECTION_QUERY_TTL_MS,
  type BuildFindCacheKeyParams,
} from "./read-pipeline";
import { applyWidgetPipeline } from "./write-pipeline";
import { compileRelationFilters } from "./relation-filter";
import { ownershipFilter } from "./access-filter";
import { getCollectionExecutionPlan, type CollectionExecutionPlan } from "./execution-plan";
import { getPluginRegistryLazy } from "./lazy-services";

/** Searchable field names — hoisted so the per-item filter loop shares one array. */
const SEARCHABLE_FIELDS = ["title", "content", "description", "name"];

type SortSpec = [string, "asc" | "desc"][] | Record<string, "asc" | "desc">;

/** Adapter-side options for the list fetch (projection fields are physical columns). */
type AdapterFindOptions = NonNullable<Parameters<IDBAdapter["crud"]["findMany"]>[2]>;

interface SortDescriptor {
  field: string;
  direction?: "asc" | "desc";
}

/** Distinguishes `{ field, direction }` from a map/tuple sort spec. */
function isSortDescriptor(sort: SortSpec | SortDescriptor): sort is SortDescriptor {
  return typeof sort === "object" && !Array.isArray(sort) && "field" in sort;
}

/** What the read lane needs from the namespace — no class instance required. */
export interface CollectionsReadContext {
  _dbAdapter: IDBAdapter;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
}

/** `search()` additionally resolves the content engine for the collection list. */
export interface CollectionsSearchContext extends CollectionsReadContext {
  getContentSystem(): Promise<ContentSystem>;
}

/**
 * Options accepted by `find()`.
 */
export interface FindOptions extends LocalApiOptions {
  filter?: Record<string, unknown>;
  editEntryId?: string;
  language?: string;
  search?: string;
  sorts?: Array<{ field: string; direction?: "asc" | "desc" }>;
  orGroups?: unknown[];
  swr?: boolean;
  includeFacets?: boolean;
  includeCount?: boolean;
  collection?: Schema;
  pageSize?: number;
  limit?: number;
  offset?: number;
  page?: number;
  ttl?: number | string;
  cursor?: string;
  keyset?: boolean;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  sort?: SortSpec | SortDescriptor;
  fields?: string[];
  staleTtl?: number;
}

/** Options accepted by `search()`. */
export type SearchOptions = LocalApiOptions & {
  collections?: string[];
  page?: number;
  limit?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  filter?: Record<string, unknown>;
  status?: string;
  isAdmin?: boolean;
};

/** Options accepted by `count()`. */
export interface CountOptionsBag {
  tenantId?: DatabaseId | null;
  filter?: unknown;
  user?: LocalApiOptions["user"];
  system?: boolean;
  validateFilter?: boolean;
  publicationFilter?: string;
}

/**
 * Reject filter keys and operators the schema/query layer cannot address.
 *
 * A misspelled key used to reach the query builder: a silently empty list, or an
 * engine-specific error / unindexed scan for a deep path. Naming every invalid
 * key turns that into an actionable 400. The same goes for an operator subkey no
 * engine implements (`{"views":{"between":"1,5"}}`): `addFilterConds` treats a
 * non-`$` subkey as "the value is this whole object" and binds it, which the SQL
 * driver rejects at run time — a 500 instead of a 400.
 */
export function assertFilterableFields(schema: Schema, filter: unknown): void {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return;
  const rejected = rejectedFilterKeys(
    filter as Record<string, unknown>,
    getAllowedFilterFieldIds(schema),
    getNestedFilterPaths(schema),
  );
  if (rejected.length > 0) {
    raise(
      400,
      `Unknown filter field${rejected.length > 1 ? "s" : ""}: ${rejected.join(", ")}`,
      "FILTER_UNKNOWN_FIELD",
      { fields: rejected },
    );
  }
  const unsupported = unsupportedFilterOperators(filter);
  if (unsupported.length > 0) {
    const named = unsupported.map((entry) => `${entry.field}.${entry.operator}`);
    raise(
      400,
      `Unknown filter operator${named.length > 1 ? "s" : ""}: ${named.join(", ")}`,
      "FILTER_UNKNOWN_FIELD",
      {
        operators: named,
        fields: [...new Set(unsupported.map((entry) => entry.field))],
      },
    );
  }
}

function normalizeFilterOperators(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const vObj = v as Record<string, unknown>;
      if ("contains" in vObj && typeof vObj.contains === "string") {
        out[k] = { $contains: vObj.contains };
      } else if ("in" in vObj && Array.isArray(vObj.in)) {
        out[k] = { $in: vObj.in };
      } else if ("eq" in vObj) {
        out[k] = { $eq: vObj.eq };
      } else if ("isNull" in vObj && typeof vObj.isNull === "boolean") {
        out[k] = vObj.isNull ? { $eq: null } : { $ne: null };
      } else if ("gte" in vObj || "lte" in vObj) {
        const range: Record<string, unknown> = {};
        if ("gte" in vObj) range.$gte = vObj.gte;
        if ("lte" in vObj) range.$lte = vObj.lte;
        out[k] = range;
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

const clientSchemaMemo = new WeakMap<object, Schema>();

/**
 * Count rows a list/filter would match, with the same normalization, relation
 * compilation, ownership/access scoping and publication clamp as `find()`.
 */
export async function countEntries(
  ctx: CollectionsReadContext,
  collectionId: string,
  options: CountOptionsBag = {},
) {
  const { tenantId, filter = {} } = options;
  const schema = await ctx.schemaOf(collectionId, tenantId);
  let countInputFilter = filter as Record<string, unknown>;
  if (options.validateFilter === true) {
    assertFilterableFields(schema, filter);
    countInputFilter = coerceFilterValues(schema, countInputFilter);
  }
  const normalizedFilter = stripGuardedFilter(
    normalizeRelationshipFilter(countInputFilter),
    blockedGuardedNames(schema, options.user, options.system),
  );
  assertEncryptedFieldsNotQueried(normalizedFilter, ensureSchemaHotFlags(schema));

  const ownership = ownershipFilter(schema, options.user, options.system);
  if (ownership === null) return { success: true, data: 0 };
  const accessConstraint = getReadConstraint(schema.name || String(schema._id), {
    user: options.user as { _id?: unknown; role?: unknown } | null | undefined,
    role: (options.user as { role?: string } | undefined)?.role,
    tenantId: tenantId ? String(tenantId) : null,
  });
  const plan = getCollectionExecutionPlan(schema);
  const resolvedFilter = plan.hasRelations
    ? await compileRelationFilters(normalizedFilter, schema, {
        dbAdapter: ctx._dbAdapter.crud,
        getCollectionName: (id) => ctx.getCollectionName(id),
        resolveTargetSchema: (id) => ctx.schemaOf(id, tenantId),
        tenantId,
        user: options.user as
          | { _id?: unknown; role?: unknown; isAdmin?: unknown }
          | null
          | undefined,
        system: options.system,
      })
    : normalizedFilter;
  const scopedFilter = mergeAccessConstraint(
    ownership ? { ...resolvedFilter, ...ownership } : resolvedFilter,
    accessConstraint,
  );

  const { query } = buildTenantQuery(
    scopedFilter,
    tenantId,
    { user: options.user, system: options.system },
    options.publicationFilter,
  );

  return ctx._dbAdapter.crud.count(ctx.getCollectionName(schema._id as string), query, {
    tenantId: tenantId as DatabaseId,
  });
}

/**
 * Count rows for an already-computed, fully-scoped query.
 *
 * `executeFind`'s paginated count leg used to call `countEntries`, which re-ran
 * schema resolution, relationship normalization, guarded stripping, ownership +
 * access-rule scoping and relation compilation — all of which the caller had
 * just computed to build `query`. This internal path skips that work: the caller
 * passes the post-constraint query (publication clamping already applied by
 * `buildTenantQuery`) and only the count is executed.
 */
async function countScopedQuery(
  ctx: CollectionsReadContext,
  schema: Schema,
  query: QueryFilter<BaseEntity>,
  tenantId?: string | DatabaseId | null,
) {
  return ctx._dbAdapter.crud.count(ctx.getCollectionName(schema._id as string), query, {
    tenantId: tenantId as DatabaseId,
  });
}

/**
 * Status facet counts for filter chips (P1). Tenant-scoped.
 *
 * SWR-cached under `collection:{id}:facets:{tenant}` with the list's tag
 * contract, so `cacheService.invalidateCollection(id)` also drops the counts.
 */
export async function getStatusFacets(
  ctx: CollectionsReadContext,
  collectionIdOrSchema: string | Schema,
  input: {
    tenantId?: string | DatabaseId | null;
    totalItems?: number;
  } = {},
): Promise<StatusFacetCounts> {
  if (input.totalItems === 0) {
    return { publish: 0, draft: 0, unpublish: 0, schedule: 0, archive: 0 };
  }

  const schema =
    typeof collectionIdOrSchema === "string"
      ? await ctx.schemaOf(collectionIdOrSchema, input.tenantId as DatabaseId | null | undefined)
      : collectionIdOrSchema;
  const collectionId = String(schema._id ?? schema.name ?? "unknown");
  const tenantKey = input.tenantId ? String(input.tenantId) : "global";
  const cacheKey = `collection:${collectionId}:facets:${tenantKey}`;
  const tags = ["collection", `collection:${collectionId}`];

  return cacheService.getOrSetSWR<StatusFacetCounts>(
    cacheKey,
    async () => {
      const baseWhere: Record<string, unknown> = {};
      if (isMultiTenantEnabled() && input.tenantId != null) {
        baseWhere.tenantId = input.tenantId;
      }

      return countStatusFacets({
        queryBuilder: (table) =>
          ctx._dbAdapter.queryBuilder(table) as QueryBuilder<Record<string, unknown>>,
        collectionTableName: collectionTableName(collectionId),
        baseWhere,
        tenantId: input.tenantId,
        crudCount: (table, filter, opts) =>
          ctx._dbAdapter.crud.count(
            table,
            filter as QueryFilter<BaseEntity>,
            opts as CountOptions,
          ) as Promise<{
            success: boolean;
            data?: number;
          }>,
      });
    },
    COLLECTION_QUERY_TTL_MS,
    COLLECTION_QUERY_STALE_MS,
    input.tenantId,
    CacheCategory.COLLECTION,
    tags,
  );
}

/**
 * Cross-collection search over the collections visible to the caller.
 *
 * One `crud.findMany` per collection (limit 100), then the shared read
 * presentation, in-memory query filtering, widget `modifyRequest`, sorting and
 * page slicing — unchanged from the namespace implementation.
 */
export async function executeSearch(
  ctx: CollectionsSearchContext,
  query: string,
  options: SearchOptions,
) {
  const {
    collections,
    tenantId,
    user,
    page = 1,
    limit = 25,
    sortField = "updatedAt",
    sortDirection = "desc",
    filter: additionalFilter = {},
    status,
    isAdmin = false,
  } = options;

  const cs = await ctx.getContentSystem();
  const allCollections = await cs.getCollections(tenantId);
  const collectionMap = new Map<string, Schema>();
  for (const col of allCollections) {
    if (col._id) collectionMap.set(col._id, col);
  }

  let collectionsToSearch: string[];
  if (collections && collections.length > 0) {
    collectionsToSearch = collections;
  } else {
    // Single pass — the previous map().filter() built a throwaway intermediate
    // array of the same length on every search.
    const ids: string[] = [];
    for (const c of allCollections) {
      if (c._id !== undefined) ids.push(c._id);
    }
    collectionsToSearch = ids;
  }

  const baseFilter: Record<string, unknown> = normalizeRelationshipFilter({
    ...additionalFilter,
  });

  const effectivePublicationFilter = resolvePublicationFilter(
    { user: options.user, system: options.system },
    status || (isAdmin ? "all" : "published"),
  );
  applyPublicationToQuery(baseFilter, effectivePublicationFilter);
  if (effectivePublicationFilter === "all" && status) {
    baseFilter.status = status;
  }

  const searchPromises = collectionsToSearch.map(async (collectionId) => {
    const collection =
      collectionMap.get(collectionId) || (await cs.getCollection(collectionId, tenantId));
    if (!collection) return [];

    try {
      // Hot flags resolved once per collection — the result lane below
      // re-used a second `ensureSchemaHotFlags` call on the same schema.
      const hot = ensureSchemaHotFlags(collection);
      assertEncryptedFieldsNotQueried(baseFilter, hot);
      const accessConstraint = getReadConstraint(collection.name || String(collection._id), {
        user: user as { _id?: unknown; role?: unknown } | null | undefined,
        role: user?.role,
        tenantId: tenantId ? String(tenantId) : null,
      });
      const result = await ctx._dbAdapter.crud.findMany(
        ctx.getCollectionName(collection._id as string),
        mergeAccessConstraint(baseFilter, accessConstraint),
        {
          limit: 100,
          tenantId: tenantId as DatabaseId,
        },
      );

      if (result.success && result.data) {
        const decrypted = presentRead(
          { success: true, data: result.data },
          collection,
          hot,
          readEncryptionContext(collection, tenantId, hot),
          user,
          options.system,
        ) as { data?: unknown };
        let items = Array.isArray(decrypted.data) ? decrypted.data : [];
        if (query) {
          const lowerQuery = query.toLowerCase();
          items = items.filter((item: Record<string, unknown>) => {
            return SEARCHABLE_FIELDS.some((field) => {
              const value = (item as Record<string, unknown>)[field];
              return typeof value === "string" && value.toLowerCase().includes(lowerQuery);
            });
          });
        }

        if (items.length > 0) {
          await applyWidgetPipeline(collection as Schema, items, {
            dbAdapter: ctx._dbAdapter,
            user,
            type: "GET",
            tenantId,
            collectionName: collection.name,
            skipValidation: options.skipValidation,
            action: "search",
          });

          // 🚀 Zero-Copy Projection: Mutate directly to avoid spread/allocation overhead
          for (let i = 0; i < items.length; i++) {
            (items[i] as Record<string, unknown>)._collection = {
              id: collection._id,
              name: collection.name,
              label: collection.label,
            };
          }
        }

        return items;
      }
      return [];
    } catch {
      return [];
    }
  });

  const resultsArrays = await Promise.all(searchPromises);
  const searchResults = resultsArrays.flat();

  if (sortField && searchResults.length > 0) {
    searchResults.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }

  const startIndex = (page - 1) * limit;
  return {
    items: searchResults.slice(startIndex, startIndex + limit),
    total: searchResults.length,
    page,
    pageSize: limit,
    totalPages: Math.ceil(searchResults.length / limit),
  };
}

/**
 * List entries for a collection.
 *
 * Pipeline order is fixed (and must stay so): validate/coerce the filter →
 * guarded stripping → ownership/access merge → relation compile → keyset merge
 * → tenant/publication clamp → encrypted-field guard → id fast path → sort and
 * cache key → count/fetch → widget/populate/language/hook/revision/facet
 * response shaping → cache write → metrics → decrypt/redact.
 */
export async function executeFind(
  ctx: CollectionsReadContext,
  collectionId: string,
  options: FindOptions = {},
) {
  const t0 = performance.now();
  const {
    tenantId,
    filter = {},
    bypassCache = false,
    editEntryId,
    language,
    search,
    sorts,
    orGroups,
    swr = false,
    includeFacets = false,
    includeCount = false,
  } = options;

  const requestedLimit = options.pageSize ?? options.limit ?? 50;
  const limit = clampPageSize(requestedLimit, 50);
  const offset =
    options.offset !== undefined ? options.offset : options.page ? (options.page - 1) * limit : 0;
  const effectivePage = options.page ?? Math.floor(offset / limit) + 1;
  const ttl = options.ttl ? Number(options.ttl) : undefined;
  const schema = options.collection ?? (await ctx.schemaOf(collectionId, tenantId));
  const plan: CollectionExecutionPlan = getCollectionExecutionPlan(schema);

  let inputFilter: Record<string, unknown> = { ...filter };
  if (editEntryId) {
    inputFilter._id = editEntryId;
  }
  inputFilter = normalizeFilterOperators(inputFilter);

  if (options.validateFilter === true) {
    assertFilterableFields(schema, inputFilter);
    inputFilter = coerceFilterValues(schema, inputFilter);
  }
  const guarded = blockedGuardedNames(schema, options.user, options.system);
  const normalizedFilter = stripGuardedFilter(
    normalizeRelationshipFilter(inputFilter) as Record<string, unknown> & {
      $or?: unknown[];
      $and?: unknown[];
    },
    guarded,
  );
  const ownership = ownershipFilter(schema, options.user, options.system);
  if (ownership === null) return { success: true, data: [] };
  const accessConstraint = getReadConstraint(schema.name || String(schema._id), {
    user: options.user as { _id?: unknown; role?: unknown } | null | undefined,
    role: (options.user as { role?: string } | undefined)?.role,
    tenantId: tenantId ? String(tenantId) : null,
  });
  const decodedCursor = decodePageCursor(options.cursor);
  if (options.cursor && !decodedCursor) {
    throw new AppError("Invalid keyset cursor", 400);
  }
  if (guarded && decodedCursor?.f && guarded.has(String(decodedCursor.f).split(".")[0])) {
    throw new AppError("Invalid keyset cursor", 400);
  }
  const keysetMode = decodedCursor !== null || options.keyset === true;

  if (typeof search === "string" && search.trim() && !editEntryId) {
    const searchStr = search.trim();
    const searchableFields = getSearchableFieldNames(schema);
    if (searchableFields.length > 0) {
      const searchConditions = searchableFields.map((field) => ({
        [field]: { $contains: searchStr },
      }));
      if (normalizedFilter.$or && Array.isArray(normalizedFilter.$or)) {
        normalizedFilter.$and = [
          ...(normalizedFilter.$and && Array.isArray(normalizedFilter.$and)
            ? normalizedFilter.$and
            : []),
          { $or: normalizedFilter.$or },
          { $or: searchConditions },
        ];
        delete normalizedFilter.$or;
      } else {
        normalizedFilter.$or = searchConditions;
      }
    }
  }

  if (Array.isArray(orGroups) && orGroups.length > 0 && !editEntryId) {
    if (normalizedFilter.$or && Array.isArray(normalizedFilter.$or)) {
      normalizedFilter.$or = [...normalizedFilter.$or, ...orGroups];
    } else {
      normalizedFilter.$or = orGroups;
    }
  }

  const resolvedFilter = plan.hasRelations
    ? await compileRelationFilters(normalizedFilter, schema, {
        dbAdapter: ctx._dbAdapter.crud,
        getCollectionName: (id) => ctx.getCollectionName(id),
        resolveTargetSchema: (id) => ctx.schemaOf(id, tenantId),
        tenantId,
        user: options.user as
          | {
              _id?: unknown;
              role?: unknown;
              isAdmin?: unknown;
            }
          | null
          | undefined,
        system: options.system,
      })
    : normalizedFilter;
  const baseQuery: Record<string, unknown> = decodedCursor
    ? mergeKeysetFilter(resolvedFilter as Record<string, unknown>, decodedCursor)
    : resolvedFilter;
  const scopedQuery = mergeAccessConstraint(
    ownership ? { ...baseQuery, ...ownership } : baseQuery,
    accessConstraint,
  );

  const { query, effectiveFilter: effectivePublicationFilter } = buildTenantQuery(
    scopedQuery,
    tenantId,
    { user: options.user, system: options.system },
    options.publicationFilter,
  );

  const hot = ensureSchemaHotFlags(schema);
  const encCtx = plan.hasEncryption
    ? readEncryptionContext(schema, tenantId, hot)
    : NO_ENCRYPTION_CONTEXT;
  if (plan.hasEncryption) {
    assertEncryptedFieldsNotQueried(
      query,
      hot,
      options.sortField || (Array.isArray(options.sort) ? options.sort?.[0]?.[0] : undefined),
    );
  }

  if (
    !decodedCursor &&
    !offset &&
    !options.fields &&
    !options.populate &&
    !language &&
    !includeFacets &&
    !swr &&
    !search &&
    !includeCount
  ) {
    const lookup = parseIdLookup(query);
    if (lookup) {
      const negativeKey =
        lookup.status === undefined
          ? `${tenantId || "global"}:collection:${schema._id}:${lookup.id}`
          : null;
      const negativeEligible =
        negativeKey !== null && !bypassCache && !options.system && options.disableErrors !== true;
      if (
        negativeKey !== null &&
        negativeEligible &&
        cacheService.isNegativeHit(negativeKey, (tenantId || undefined) as string)
      ) {
        return presentRead(
          { success: true, data: [] },
          schema,
          hot,
          encCtx,
          options.user,
          options.system,
        );
      }
      const one = await ctx._dbAdapter.crud.findOne(
        ctx.getCollectionName(schema._id as string),
        query,
        { tenantId: tenantId as DatabaseId },
      );
      const row =
        one?.success && one.data ? (Array.isArray(one.data) ? one.data[0] : one.data) : null;
      if (!row && negativeEligible && negativeKey !== null && one?.success === true) {
        cacheService.recordMiss(negativeKey, (tenantId || undefined) as string, [
          `doc:${schema._id}:${lookup.id}`,
        ]);
      }
      if (row) {
        if (plan.hasWidgets && hot._hasActiveWidgets) {
          const payload = [row];
          await applyWidgetPipeline(schema, payload, {
            dbAdapter: ctx._dbAdapter,
            user: options.user || { _id: "system", role: "admin" },
            type: "GET",
            tenantId,
            collectionName: schema.name,
            skipValidation: options.skipValidation,
            action: "find",
          });
        }
        const collectionMeta = (schema as { _collectionMeta?: unknown })._collectionMeta || {
          id: schema._id,
          name: schema.name,
          label: schema.label,
        };
        (schema as { _collectionMeta?: unknown })._collectionMeta = collectionMeta;
        (row as Record<string, unknown>)._collection = collectionMeta;
      }
      const envelope = { success: true, data: row ? [row] : [], entries: row ? [row] : [] };
      if (plan.isPlain) {
        return envelope;
      }
      return presentRead(envelope, schema, hot, encCtx, options.user, options.system);
    }
  }

  const requestedSort: SortSpec | undefined =
    sorts && sorts.length > 0
      ? sorts.map((s): [string, "asc" | "desc"] => [s.field, s.direction || "desc"])
      : options.sort
        ? isSortDescriptor(options.sort)
          ? [[options.sort.field, options.sort.direction || "desc"]]
          : options.sort
        : options.sortField
          ? ([[options.sortField, options.sortDirection || "desc"]] as [string, "asc" | "desc"][])
          : undefined;
  const sort = stripGuardedSort(requestedSort, guarded);

  const sortForDb = keysetMode
    ? withIdTiebreaker(
        sort ??
          (decodedCursor
            ? decodedCursor.f
              ? { [decodedCursor.f]: decodedCursor.d === "asc" ? 1 : -1 }
              : { _id: decodedCursor.d === "asc" ? 1 : -1 }
            : defaultPageSortOption()),
      )
    : (sort ?? defaultListSortOption());

  const skipRequestCache = bypassCache || options.bypassRequestCache === true;
  const cacheKey = keysetMode
    ? null
    : buildFindCacheKey({
        schemaId: schema._id as string,
        tenantId,
        filter,
        query,
        limit,
        offset,
        sort,
        decodedCursor,
        effectiveFilter: effectivePublicationFilter,
        skipRequestCache,
        bypassCache,
        options: options as unknown as BuildFindCacheKeyParams["options"],
      });

  const shouldCount =
    !keysetMode &&
    (includeCount ||
      options.page !== undefined ||
      options.pageSize !== undefined ||
      includeFacets ||
      swr);

  const loadFullData = async () => {
    const fetchOpts: AdapterFindOptions = {
      limit: keysetMode || shouldCount ? limit + 1 : limit,
      offset: keysetMode ? 0 : offset,
      sort: sortForDb as AdapterFindOptions["sort"],
      fields: options.fields as AdapterFindOptions["fields"],
      populate: options.populate,
    };

    const fetchFromDb = async () => {
      let r = await ctx._dbAdapter.crud.findMany(
        ctx.getCollectionName(schema._id as string),
        query,
        fetchOpts,
      );
      if (!r.success) {
        try {
          await ctx._dbAdapter.collection?.createModel?.(schema);
        } catch (healError) {
          logger.warn(`[CollectionsNamespace] Physical model heal failed for ${schema._id}`, {
            healError,
          });
        }
        r = await ctx._dbAdapter.crud.findMany(
          ctx.getCollectionName(schema._id as string),
          query,
          fetchOpts,
        );
      }
      return r;
    };

    const countPromise =
      shouldCount && !editEntryId
        ? countScopedQuery(ctx, schema, query, tenantId).catch(() => ({
            success: false,
            data: undefined,
          }))
        : Promise.resolve({ success: false, data: undefined });

    const [res, countRes] = await Promise.all([fetchFromDb(), countPromise]);

    let rawRows: unknown[] = [];
    let hasMore = false;
    if (res.success && Array.isArray(res.data)) {
      rawRows = res.data;
      if (keysetMode || shouldCount) {
        hasMore = rawRows.length > limit;
        if (hasMore) rawRows = rawRows.slice(0, limit);
      }
    }

    let totalItems: number | undefined;
    if (shouldCount) {
      if (editEntryId) {
        totalItems = rawRows.length > 0 ? 1 : 0;
      } else if (countRes.success && typeof countRes.data === "number") {
        totalItems = countRes.data;
      } else if (effectivePage === 1 && !hasMore && res.success) {
        totalItems = rawRows.length;
      } else {
        totalItems = hasMore
          ? (effectivePage - 1) * limit + rawRows.length + 1
          : (effectivePage - 1) * limit + rawRows.length;
      }
    }

    let data: unknown[] = rawRows;

    if (keysetMode && res.success && data.length > 0) {
      const cursorSort = resolvePageSort(sortForDb);
      const last = hasMore ? (data[data.length - 1] as Record<string, unknown>) : null;
      if (hasMore && last && last._id !== undefined && last._id !== null) {
        const payload: Parameters<typeof encodePageCursor>[0] = {
          id: String(last._id),
          d: cursorSort.direction,
        };
        if (cursorSort.field !== "_id") {
          payload.f = cursorSort.field;
          payload.v = (last[cursorSort.field] as string | number | boolean | null) ?? null;
        }
        (res as { meta?: Record<string, unknown> }).meta = {
          hasMore: true,
          nextCursor: encodePageCursor(payload),
        };
      } else {
        (res as { meta?: Record<string, unknown> }).meta = { hasMore: false };
      }
    }

    if (res.success && data.length > 0) {
      // 🔗 Junction (many-to-many) fields: one batched query per field, before
      // the widget pipeline and the list cache write.
      if (junctionFieldsOf(schema).length > 0) {
        await hydrateJunctionFields(
          ctx._dbAdapter,
          schema,
          data as Array<Record<string, unknown>>,
          tenantId,
        );
      }
      if (hot._hasActiveWidgets) {
        await applyWidgetPipeline(schema, data as EntryData[], {
          dbAdapter: ctx._dbAdapter,
          user: options.user || { _id: "system", role: "admin" },
          type: "GET",
          tenantId,
          collectionName: schema.name,
          skipValidation: options.skipValidation,
          action: "find",
        });
      }

      if (!language) {
        const collectionMeta = (schema as { _collectionMeta?: unknown })._collectionMeta || {
          id: schema._id,
          name: schema.name,
          label: schema.label,
        };
        (schema as { _collectionMeta?: unknown })._collectionMeta = collectionMeta;
        data = (data as Array<Record<string, unknown>>).map((item) => {
          if (item) {
            return { ...item, _collection: collectionMeta };
          }
          return item;
        });
      }
    }

    if (options.populate && res.success && data.length > 0) {
      await resolvePopulatedRelations(
        data,
        schema,
        options.populate,
        (tenantId || undefined) as string | undefined,
        ctx._dbAdapter,
        (id) => ctx.getCollectionName(id),
        {
          user: options.user,
          system: options.system,
          requestedPublicationFilter: effectivePublicationFilter,
          resolveTargetSchema: (id: string) => ctx.schemaOf(id, tenantId),
        },
      );
    }

    if (language && !editEntryId && res.success && data.length > 0) {
      data = (data as Array<Record<string, unknown>>).map((entry) =>
        mapEntryValues(entry, schema.fields, {
          language,
          mode: "list",
        }),
      );
      if (plan.hasRelations) {
        await hydrateRelationDisplays(data, schema, ctx._dbAdapter, tenantId);
      }
    }

    if (!editEntryId && res.success && data.length > 0) {
      try {
        const pluginRegistry = await getPluginRegistryLazy();
        if (pluginRegistry.hasAnySSRHook()) {
          const hooks = await pluginRegistry.getSSRHooks(String(schema._id), tenantId, schema);
          if (hooks.length > 0) {
            const pluginContext = {
              user: options.user,
              tenantId: tenantId || "default",
              language: language || "en",
              dbAdapter: ctx._dbAdapter,
              collectionSchema: schema,
            };
            const allPluginData = await Promise.all(
              hooks.map((hook) => hook(pluginContext, data as EntryData[])),
            );
            for (const hookData of allPluginData) {
              for (const entryData of hookData) {
                const found = (
                  data as Array<{ _id?: unknown; pluginData?: Record<string, unknown> }>
                ).find((r) => String(r._id) === String(entryData.entryId));
                if (found) {
                  found.pluginData = { ...found.pluginData, ...entryData.data };
                }
              }
            }
          }
        }
      } catch (err) {
        logger.warn("Failed to run plugin SSR hooks", { error: err });
      }
    }

    let revisions: RevisionData[] | undefined;
    if (editEntryId && schema.revision) {
      try {
        const { HistoryService } = await import("@src/services/content/history-service");
        const revisionsResult = await HistoryService.getRevisions({
          collectionId: String(schema._id),
          entryId: editEntryId,
          tenantId: tenantId || "",
          dbAdapter: ctx._dbAdapter,
          limit: 100,
        });
        if (revisionsResult.success && "data" in revisionsResult) {
          revisions = ((revisionsResult.data as { items?: RevisionData[] }).items ||
            []) as RevisionData[];
        }
      } catch (e) {
        logger.warn("Failed to load revisions", e);
      }
    }

    let facets: StatusFacetCounts | undefined;
    if (includeFacets) {
      try {
        facets = await getStatusFacets(ctx, schema, {
          tenantId,
          totalItems,
        });
      } catch (err) {
        logger.debug("[CollectionsNamespace] Status facets failed", { error: err });
        facets = {};
      }
    }

    let clientSchema = clientSchemaMemo.get(schema);
    if (!clientSchema) {
      clientSchema = deepClone(schema) as Schema;
      clientSchemaMemo.set(schema, clientSchema);
    }

    const envelope: Record<string, unknown> = {
      ...res,
      data,
      entries: data,
    };
    if (shouldCount && totalItems !== undefined) {
      envelope.pagination = {
        totalItems,
        pagesCount: Math.ceil(totalItems / limit) || 1,
        currentPage: effectivePage,
        pageSize: limit,
        hasMore,
      };
    }
    if (facets !== undefined) {
      envelope.facets = facets;
      envelope.statusFacets = facets;
    }
    if (revisions !== undefined) envelope.revisions = revisions;
    if (language !== undefined) envelope.contentLanguage = language;
    envelope.collectionSchema = clientSchema;

    return envelope;
  };

  let result: Record<string, unknown> | null | undefined;
  let cacheHit = false;

  if (swr && cacheKey && !bypassCache) {
    const staleTtlMs =
      options.staleTtl ??
      (isHotCollectionId(schema._id as string, tenantId)
        ? COLLECTION_QUERY_HOT_STALE_MS
        : COLLECTION_QUERY_STALE_MS);
    const ttlMs = (options.ttl ? Number(options.ttl) * 1000 : undefined) ?? COLLECTION_QUERY_TTL_MS;
    const tags = buildCollectionCacheTags(schema._id as string);

    result = await cacheService.getOrSetSWR(
      cacheKey,
      loadFullData,
      ttlMs,
      staleTtlMs,
      tenantId,
      CacheCategory.CONTENT,
      tags,
    );
    cacheHit = true;
    if (result) {
      setRequestCache(cacheKey, result, schema._id as string, tenantId);
    }
  } else {
    if (cacheKey) {
      const cached = await readThroughCache(cacheKey, tenantId, {
        skipRequestCache,
        bypassCache,
      });
      if (cached.hit) {
        setRequestCache(cacheKey, cached.payload, schema._id as string, tenantId);
        recordListQuery({
          source: "CollectionsNamespace.find",
          durationMs: Math.round((performance.now() - t0) * 100) / 100,
          cache: "hit",
          collectionId: String(schema._id),
          rowCount: Array.isArray(cached.payload?.data) ? cached.payload.data.length : 0,
          queryHash: cacheKey,
        });
        if (plan.isPlain) {
          return cached.payload;
        }
        return presentRead(cached.payload, schema, hot, encCtx, options.user, options.system);
      }
    }

    result = cacheKey
      ? await cacheService.coalesceQuery(cacheKey, loadFullData)
      : await loadFullData();

    if (!bypassCache && cacheKey && result?.success && result?.data) {
      try {
        await cacheService.set(
          cacheKey,
          result,
          ttl || 180,
          (tenantId || undefined) as string,
          CacheCategory.CONTENT,
          buildCollectionCacheTags(schema._id as string),
        );

        if (
          query._id &&
          (!result.data || (Array.isArray(result.data) && result.data.length === 0))
        ) {
          cacheService.recordMiss(cacheKey, (tenantId || undefined) as string);
        }

        setRequestCache(cacheKey, result, schema._id as string, tenantId);
      } catch (error) {
        logger.debug("[collections-namespace] suppressed error", error);
      }
    }
  }

  const durationMs = Math.round((performance.now() - t0) * 100) / 100;
  recordListQuery({
    source: "CollectionsNamespace.find",
    durationMs,
    cache: cacheHit ? "hit" : bypassCache ? "bypass" : "miss",
    collectionId: String(schema._id),
    rowCount: Array.isArray(result?.data) ? result.data.length : 0,
    queryHash: cacheKey || "",
  });

  if (plan.isPlain) {
    return result;
  }
  return presentRead(result, schema, hot, encCtx, options.user, options.system);
}
