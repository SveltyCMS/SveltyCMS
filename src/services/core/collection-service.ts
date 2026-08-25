/**
 * @file src/services/core/collection-service.ts
 * @description
 * Service for retrieving and caching collection list/edit data.
 * Centralizes logic for SSR loaders and cache warming with L1/L2 SWR.
 *
 * ### Caching (aligned with cache-system.mdx)
 * - Keys: `collection:{id}:query:{hash}:page:…` (prefix-bucketed)
 * - Strategy: `getOrSetSWR` (fresh TTL + stale window, single-flight)
 * - Tags: `collection`, `collection:{id}` for targeted invalidation
 * - Category: `COLLECTION`
 * - Empty pages are valid results (not Bloom negative-cached)
 *
 * ### Filtering (platform capability)
 * - Compiles via `collection-filter-engine` (schema + widgets + FLAC)
 * - Applies portable QueryBuilder clauses (eq / between / search)
 * - Never forwards raw `{ contains }` objects into SQL `eq`
 *
 * @see docs/reference/architecture/collection-filtering.mdx
 * @see docs/reference/architecture/cache-system.mdx
 * @see docs/reference/api/content.mdx
 */

import type { CollectionEntry, RevisionData, Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import type { BaseEntity, DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import {
  applyFiltersToQueryBuilder,
  compileSecureFilters,
  countStatusFacets,
  hashCollectionListQuery,
  type StatusFacetCounts,
} from "@src/services/core/collection-filter-engine";
import {
  buildCollectionQueryCacheKey,
  type CollectionFilterMap,
} from "@utils/collection-query-filters";
import { recordListQuery } from "@utils/list-query-metrics";
import { modifyRequest } from "@utils/modify-request";
import { isMultiTenantEnabled } from "@utils/tenant";
import { collectionTableName } from "@src/databases/core/collection-name";
import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { deepClone } from "@utils/native-utils";

const clientSchemaMemo = new WeakMap<object, Schema>();

// Helper to get dbAdapter safely via dynamic import to avoid circular dep issues
const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter as IDBAdapter;

/** Fresh window: 60s — list data changes often during editorial work. */
const COLLECTION_QUERY_TTL_MS = 60_000;
/** Stale window: 5 min — serve stale while revalidating (SWR). */
const COLLECTION_QUERY_STALE_MS = 300_000;

interface CollectionDataParams {
  bypassCache?: boolean;
  collection: Schema;
  editEntryId?: string;
  filter?: CollectionFilterMap | Record<string, unknown>;
  language: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: { field: string; direction: "asc" | "desc" };
  tenantId?: string | null;
  user: User;
}

export type CollectionDataResult = {
  contentLanguage: string;
  collectionSchema: Schema;
  entries: CollectionEntry[];
  pagination: {
    totalItems: number;
    pagesCount: number;
    currentPage: number;
    pageSize: number;
    /** True when a further page exists (limit+1 fetch). */
    hasMore?: boolean;
  };
  revisions: RevisionData[];
};

export class CollectionService {
  private static instance: CollectionService;

  private constructor() {}

  public static getInstance(): CollectionService {
    if (!CollectionService.instance) {
      CollectionService.instance = new CollectionService();
    }
    return CollectionService.instance;
  }

  /**
   * Retrieves collection data with SWR caching, modifyRequest, and pagination.
   */
  public async getCollectionData(params: CollectionDataParams): Promise<CollectionDataResult> {
    const t0 = performance.now();
    const {
      collection,
      page = 1,
      pageSize = 10,
      sort = { field: "createdAt", direction: "desc" },
      filter = {},
      search = "",
      language,
      user,
      tenantId,
      editEntryId,
      bypassCache = false,
    } = params;

    const collectionId = String(collection._id ?? collection.name ?? "unknown");

    // Compile once for cache key (accepted filters only — FLAC-aware, stable)
    const compiledForKey = compileSecureFilters(filter, collection, user, {
      logRejections: false,
    });
    const queryHash = hashCollectionListQuery({
      compiled: compiledForKey,
      search,
      sort,
    });

    // Prefix-bucketed key → invalidateCollection(collectionId) clears all pages/filters
    const cacheKey = buildCollectionQueryCacheKey({
      collectionId,
      page,
      pageSize,
      queryHash,
      language,
      tenantId,
      userId: user._id,
      editEntryId,
    });

    const tags = ["collection", `collection:${collectionId}`];

    const finish = (result: CollectionDataResult, cache: "hit" | "miss" | "bypass" | "swr") => {
      const durationMs = Math.round((performance.now() - t0) * 100) / 100;
      recordListQuery({
        source: "CollectionService.getCollectionData",
        durationMs,
        cache,
        collectionId,
        rowCount: result.entries.length,
        queryHash,
      });
      logger.debug(
        `Collection list ${cache} ${durationMs}ms rows=${result.entries.length} key=${cacheKey.slice(0, 80)}…`,
      );
      return result;
    };

    if (bypassCache) {
      return finish(await this.loadCollectionData(params, collectionId), "bypass");
    }

    // getOrSetSWR: L1 hit / stale-while-revalidate / single-flight miss
    // Negative Bloom is intentional NO-OP for empty lists (valid empty pages).
    const cached = await cacheService.getOrSetSWR<CollectionDataResult>(
      cacheKey,
      () => this.loadCollectionData(params, collectionId),
      COLLECTION_QUERY_TTL_MS,
      COLLECTION_QUERY_STALE_MS,
      tenantId,
      CacheCategory.COLLECTION,
      tags,
    );

    if (cached) {
      // SWR may return stale while refreshing — treat as hit for metrics
      return finish(cached, "hit");
    }

    logger.warn(`Cache returned null for collection query, loading uncached: ${cacheKey}`);
    return finish(await this.loadCollectionData(params, collectionId), "miss");
  }

  /**
   * Status facet counts for filter chips (P1). Tenant-scoped via baseWhere.
   */
  public async getStatusFacets(input: {
    collection: Schema;
    tenantId?: string | null;
  }): Promise<StatusFacetCounts> {
    const collectionId = String(input.collection._id ?? input.collection.name ?? "unknown");
    const dbAdapter = await getDbAdapter();
    if (!dbAdapter) throw error(500, "Database adapter is not available.");

    const baseWhere: Record<string, unknown> = {};
    if (isMultiTenantEnabled() && input.tenantId != null) {
      baseWhere.tenantId = input.tenantId;
    }

    return countStatusFacets({
      queryBuilder: (table) => dbAdapter.queryBuilder(table) as any,
      // 🐛 FIX (BUG-01): canonical physical name — manual `collection_${id}`
      // breaks for hyphenated ids ("blog-posts" → collection_blog-posts,
      // actual table: collection_blogposts). collectionTableName normalizes
      // and is idempotent for already-prefixed names.
      collectionTableName: collectionTableName(collectionId),
      baseWhere,
      tenantId: input.tenantId,
      crudCount: (table, filter, opts) =>
        dbAdapter.crud.count(table, filter as any, opts as any) as Promise<{
          success: boolean;
          data?: number;
        }>,
    });
  }

  /**
   * DB load path — no caching. Invoked by getOrSetSWR factory or bypassCache.
   */
  private async loadCollectionData(
    params: CollectionDataParams,
    collectionId: string,
  ): Promise<CollectionDataResult> {
    const {
      collection,
      page = 1,
      pageSize = 10,
      sort = { field: "createdAt", direction: "desc" },
      filter = {},
      search = "",
      language,
      user,
      tenantId,
      editEntryId,
    } = params;

    const dbAdapter = await getDbAdapter();
    if (!dbAdapter) {
      throw error(500, "Database adapter is not available.");
    }

    if (dbAdapter.ensureCollections) {
      await dbAdapter.ensureCollections();
    }

    const collectionTable = collectionTableName(collectionId);

    // Base isolation (tenant + edit) — never from client filter map
    const baseWhere: Record<string, unknown> = {};
    if (isMultiTenantEnabled() && tenantId != null) {
      baseWhere.tenantId = tenantId;
    }
    if (editEntryId) {
      baseWhere._id = editEntryId;
    }

    // Platform filter engine: schema + FLAC → portable QueryBuilder IR
    const compiled = compileSecureFilters(filter, collection, user);
    logger.debug(`[CollectionService] Querying table: ${collectionTable}`, {
      equality: compiled.equality,
      ranges: compiled.ranges,
      textSearch: compiled.textSearch,
      rejected: compiled.rejected,
      tenantId,
      search: search || undefined,
    });

    let query = dbAdapter.queryBuilder(collectionTable);
    const applied = applyFiltersToQueryBuilder(query, compiled, {
      baseWhere,
      globalSearch: search,
      collection,
      user,
    });
    query = applied.qb;

    // 🚀 findPage pattern: fetch pageSize+1 for hasMore; avoid mandatory dual-query
    // when the first page is short (totalItems = entries.length, skip count).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sort field is dynamic schema key
    query = query
      .sort(sort.field as any, sort.direction)
      .paginate({ page, pageSize: pageSize + 1 });

    const simpleCountEligible =
      !search &&
      compiled.ranges.length === 0 &&
      compiled.inLists.length === 0 &&
      compiled.nullChecks.length === 0 &&
      compiled.textSearch.length === 0 &&
      typeof dbAdapter.crud?.count === "function";

    const countFilter = simpleCountEligible
      ? ({ ...baseWhere, ...compiled.equality } as Record<string, unknown>)
      : null;

    let entries: CollectionEntry[] = [];
    let totalItems = 0;
    let hasMore = false;

    // Re-runnable closures so a missing physical table can be healed + retried.
    const runEntries = () => query.execute();
    const runCount = () =>
      simpleCountEligible
        ? dbAdapter.crud.count(collectionTable, countFilter as any, {
            tenantId: tenantId as any,
            mode: "exact",
            skipMeta: true,
          })
        : (() => {
            let countQuery = dbAdapter.queryBuilder(collectionTable);
            countQuery = applyFiltersToQueryBuilder(countQuery, compiled, {
              baseWhere,
              globalSearch: search,
              collection,
              user,
            }).qb;
            return countQuery.count();
          })();

    let [entriesResult, countResult] = await Promise.all([runEntries(), runCount()]);

    // 🚀 SELF-HEALING READS: DB resets (testing reset / E2E) drop dynamic
    // collection tables while the content system keeps compiled schemas in
    // memory. Re-provision the physical model from the compiled schema and
    // retry once — insert paths already self-heal missing tables; reads did
    // not (public site SSR and admin lists hard-failed). Zero cost on the
    // happy path (only runs on query failure).
    if (!entriesResult.success || !countResult.success) {
      try {
        await dbAdapter.collection.createModel(collection);
      } catch (healError) {
        logger.warn(`[CollectionService] Physical model heal failed for ${collectionId}`, {
          healError,
        });
      }
      if (!entriesResult.success && !countResult.success) {
        [entriesResult, countResult] = await Promise.all([runEntries(), runCount()]);
      } else if (!entriesResult.success) {
        entriesResult = await runEntries();
      } else {
        countResult = await runCount();
      }
    }

    if (entriesResult.success) {
      const raw = (entriesResult.data || []) as unknown as CollectionEntry[];
      hasMore = raw.length > pageSize;
      entries = hasMore ? raw.slice(0, pageSize) : raw;
    } else {
      logger.error("Failed to load collection entries", { entriesResult });
    }

    if (countResult.success && typeof countResult.data === "number") {
      totalItems = countResult.data as number;
    } else if (entriesResult.success && page === 1 && !hasMore) {
      // First page short list: total is known without a successful count
      totalItems = entries.length;
    } else {
      logger.error("Failed to load collection count", { countResult });
      // Fallback: lower bound so pagination UI still advances when hasMore
      totalItems = hasMore
        ? (page - 1) * pageSize + entries.length + 1
        : (page - 1) * pageSize + entries.length;
    }

    if (entries.length > 0) {
      await modifyRequest({
        data: entries,
        fields: collection.fields as never,
        collection: collection as never,
        user,
        type: "GET",
        tenantId,
      });
    }

    // Language projection (view mode)
    if (!editEntryId) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] as Record<string, unknown>;
        for (const field of collection.fields as Array<Record<string, unknown>>) {
          const fieldName = (field.db_fieldName || field.label) as string;
          if (
            field.translated &&
            entry[fieldName] &&
            typeof entry[fieldName] === "object" &&
            !Array.isArray(entry[fieldName])
          ) {
            const localized = entry[fieldName] as Record<string, unknown>;
            const value = localized[language];
            entry[fieldName] = value !== undefined && value !== null && value !== "" ? value : "-";
          }
        }
      }
      await hydrateRelationDisplays(entries, collection, dbAdapter, tenantId);
    }

    // Plugin SSR hooks
    const pluginData: Record<string, Record<string, unknown>> = {};
    if (!editEntryId && entries.length > 0) {
      try {
        const { pluginRegistry } = await import("@src/plugins");
        const hooks = await pluginRegistry.getSSRHooks(collectionId, tenantId, collection);

        if (hooks.length > 0) {
          logger.debug("Running plugin SSR hooks", {
            collectionId,
            hooksCount: hooks.length,
            entriesCount: entries.length,
          });

          const pluginContext = {
            user,
            tenantId: tenantId || "default",
            language,
            dbAdapter,
            collectionSchema: collection,
          };

          const allPluginData = await Promise.all(
            hooks.map((hook) => hook(pluginContext, entries)),
          );

          for (const hookData of allPluginData) {
            for (const entryData of hookData) {
              if (!pluginData[entryData.entryId]) {
                pluginData[entryData.entryId] = {};
              }
              Object.assign(pluginData[entryData.entryId], entryData.data);
            }
          }

          entries = entries.map((entry) => {
            const pData = pluginData[entry._id as string];
            if (pData) {
              return { ...entry, pluginData: pData };
            }
            return entry;
          });
        }
      } catch (err) {
        logger.warn("Failed to run plugin SSR hooks", { error: err });
      }
    }

    // Revisions (edit mode)
    let revisionsMeta: RevisionData[] = [];
    if (editEntryId && collection.revision) {
      try {
        const { HistoryService } = await import("@src/services/content/history-service");
        const revisionsResult = await HistoryService.getRevisions({
          collectionId,
          entryId: editEntryId,
          tenantId: tenantId || "",
          dbAdapter,
          limit: 100,
        });
        if (revisionsResult.success && "data" in revisionsResult) {
          revisionsMeta = ((revisionsResult.data as { items?: RevisionData[] }).items ||
            []) as RevisionData[];
        }
      } catch (e) {
        logger.warn("Failed to load revisions", e);
      }
    }

    // Memoized client-sanitized schema (avoids JSON serialization on hot edit page loads)
    let collectionSchemaForClient = clientSchemaMemo.get(collection);
    if (!collectionSchemaForClient) {
      collectionSchemaForClient = deepClone(collection) as Schema;
      clientSchemaMemo.set(collection, collectionSchemaForClient);
    }

    return {
      contentLanguage: language,
      collectionSchema: collectionSchemaForClient,
      entries: entries || [],
      pagination: {
        totalItems: totalItems || 0,
        pagesCount: Math.ceil((totalItems || 0) / pageSize) || 1,
        currentPage: page,
        pageSize,
        hasMore,
      },
      revisions: revisionsMeta || [],
    };
  }
}

/**
 * One findByIds per related collection so list cells do not HTTP-fetch each row.
 * Replaces stored ids with `{ _id, [displayField] }` for Relation Display.
 */
async function hydrateRelationDisplays(
  entries: CollectionEntry[],
  collection: Schema,
  dbAdapter: IDBAdapter,
  tenantId?: string | null,
): Promise<void> {
  if (entries.length === 0 || !Array.isArray(collection.fields)) return;

  type RelField = { name: string; table: string; displayField: string };
  const relFields: RelField[] = [];
  for (const field of collection.fields as Array<Record<string, unknown>>) {
    const widgetName = (field.widget as { Name?: string } | undefined)?.Name;
    if (widgetName !== "Relation" && widgetName !== "RelationList") continue;
    const target = typeof field.collection === "string" ? field.collection : "";
    const displayField = typeof field.displayField === "string" ? field.displayField : "";
    const name = String(field.db_fieldName || field.name || field.label || "");
    if (!target || !displayField || !name) continue;
    relFields.push({ name, table: collectionTableName(target), displayField });
  }
  if (relFields.length === 0) return;

  const byTable = new Map<string, { displayField: string; names: string[]; ids: Set<string> }>();
  for (const rel of relFields) {
    let group = byTable.get(rel.table);
    if (!group) {
      group = { displayField: rel.displayField, names: [], ids: new Set() };
      byTable.set(rel.table, group);
    }
    group.names.push(rel.name);
    for (const entry of entries) {
      const raw = (entry as Record<string, unknown>)[rel.name];
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const v of values) {
        if (typeof v === "string" && v) group.ids.add(v);
      }
    }
  }

  const lookups = await Promise.all(
    [...byTable.entries()].map(async ([table, group]) => {
      const ids = [...group.ids];
      if (ids.length === 0) return { group, rows: [] as Record<string, unknown>[] };
      try {
        // Display-field column names are dynamic schema strings, so widen the
        // generic to an index-signature row (keyof becomes `string`).
        const res = await dbAdapter.crud.findByIds<BaseEntity & Record<string, unknown>>(
          table,
          ids as DatabaseId[],
          {
            tenantId: tenantId as DatabaseId,
            fields: ["_id", group.displayField],
            limit: ids.length,
          },
        );
        const rows = res.success && Array.isArray(res.data) ? res.data : [];
        return { group, rows };
      } catch (err) {
        logger.debug("[CollectionService] Relation hydrate skipped", { table, err });
        return { group, rows: [] as Record<string, unknown>[] };
      }
    }),
  );

  for (const { group, rows } of lookups) {
    if (rows.length === 0) continue;
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const id = String(row._id ?? "");
      if (id) byId.set(id, row);
    }
    for (const entry of entries) {
      const rec = entry as Record<string, unknown>;
      for (const name of group.names) {
        const raw = rec[name];
        if (Array.isArray(raw)) {
          rec[name] = raw.map((v) =>
            typeof v === "string" && byId.has(v)
              ? { _id: v, [group.displayField]: byId.get(v)?.[group.displayField] }
              : v,
          );
        } else if (typeof raw === "string" && byId.has(raw)) {
          rec[name] = {
            _id: raw,
            [group.displayField]: byId.get(raw)?.[group.displayField],
          };
        }
      }
    }
  }
}

export const collectionService = CollectionService.getInstance();
