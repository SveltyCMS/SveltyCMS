/**
 * @file src/services/sdk/namespaces/populate-resolver.ts
 * @description Resolves populated relations for collection query results.
 *
 * When `populate: ["author", "categories"]` is passed in find options,
 * this module coalesces related entries across fields by target collection
 * to eliminate redundant N+1 queries and attaches them to each result item
 * as `_populated_<field>`.
 */
import type { DatabaseId } from "@src/content/types";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { redactRecord } from "@utils/field-access";
import { ownershipFilter } from "./collections/access-filter";
import {
  getReadConstraint,
  mergeAccessConstraint,
} from "@src/services/security/access-rule-service";
import {
  applyPublicationToQuery,
  resolvePublicationFilter,
  type PublicationFilter,
} from "@utils/security/publication-policy";

/**
 * Caller policy applied to the TARGET rows of a populated relation. Without it a
 * relation is a bypass: the parent query is scoped/redacted, the target fetch is
 * a bare `_id $in` that returns drafts, foreign-tenant rows, and private fields.
 */
export interface PopulatePolicy {
  user?: unknown;
  system?: boolean;
  requestedPublicationFilter?: PublicationFilter;
  resolveTargetSchema?: (collectionId: string) => Promise<any>;
}

/**
 * Max ids per relation query — protects SQL variable limits. Hoisted so the
 * constant is not re-created per target-collection resolution.
 */
const RELATION_FETCH_CHUNK_SIZE = 500;

/**
 * Resolve populated relations for a result set.
 * Coalesces lookups across all populate fields sharing the same target collection
 * into a single query per collection, eliminating redundant database round-trips.
 *
 * 🚀 High-Scale L1 Optimization for 100k+ docs:
 * Probes the in-memory L1 cache for already-loaded relation entities before hitting
 * the database. Only un-cached IDs trigger a DB read, slashing database queries
 * on repeated parent lists with shared relations (authors, categories, tags).
 */
export async function resolvePopulatedRelations(
  items: any[],
  schema: any,
  populateFields: string[],
  tenantId: string | undefined,
  _dbAdapter: any,
  getCollectionName: (id: string) => string,
  policy: PopulatePolicy = {},
): Promise<void> {
  if (!items || items.length === 0 || !populateFields || populateFields.length === 0) return;

  // 1. Group fields and collect unique IDs by target collection
  const fieldLookup = new Map<string, any>();
  if (Array.isArray(schema.fields)) {
    for (let i = 0; i < schema.fields.length; i++) {
      const f = schema.fields[i];
      if (f.db_fieldName) fieldLookup.set(f.db_fieldName, f);
      if (f.name) fieldLookup.set(f.name, f);
    }
  }

  const collectionTargets = new Map<
    string,
    {
      collectionId: string;
      fields: string[];
      ids: Set<string>;
    }
  >();

  for (const fieldName of populateFields) {
    const field = fieldLookup.get(fieldName);
    if (!field) continue;

    const relationCollection = field.relation || field.collection;
    if (!relationCollection) continue;

    const collectionName = getCollectionName(relationCollection);
    let target = collectionTargets.get(collectionName);
    if (!target) {
      target = { collectionId: relationCollection, fields: [], ids: new Set<string>() };
      collectionTargets.set(collectionName, target);
    }
    target.fields.push(fieldName);

    for (let i = 0; i < items.length; i++) {
      const val = items[i][fieldName];
      if (typeof val === "string" && val) {
        target.ids.add(val);
      } else if (Array.isArray(val)) {
        for (let j = 0; j < val.length; j++) {
          const v = val[j];
          if (typeof v === "string" && v) target.ids.add(v);
        }
      }
    }
  }

  if (collectionTargets.size === 0) return;

  // 2. Resolve relations per target collection with L1 cache-through.
  // Single Array.from with a map function: one array allocation instead of
  // entries() + .map() (two).
  const collectionFetches = Array.from(
    collectionTargets.entries(),
    async ([collectionName, { collectionId, fields, ids }]) => {
      if (ids.size === 0) return;

      try {
        const targetSchema = policy.resolveTargetSchema
          ? await policy.resolveTargetSchema(collectionId)
          : null;
        const isAdminActor = policy.system === true;
        const publicationFilter = resolvePublicationFilter(
          { user: policy.user as never, system: policy.system === true },
          policy.requestedPublicationFilter ?? null,
        );
        const targetName = String(targetSchema?.name || collectionName);
        const accessConstraint = getReadConstraint(targetName, {
          user: policy.user as never,
          role: (policy.user as { role?: string } | undefined)?.role,
          tenantId: tenantId ? String(tenantId) : null,
        });
        const ownership = targetSchema
          ? ownershipFilter(targetSchema, policy.user, policy.system)
          : false;
        // Fail closed: ownership declared but the caller has no id.
        if (ownership === null) return;
        // Only a privileged caller with no row constraint may reuse the shared
        // raw relation cache — otherwise cached drafts/private rows would bypass
        // the target policy. Without a target schema there is no policy to
        // enforce (unit-level callers / schema not loaded yet).
        const enforceTargetPolicy =
          Boolean(targetSchema) &&
          !isAdminActor &&
          (publicationFilter !== "all" ||
            accessConstraint !== null ||
            (ownership !== false && typeof ownership === "object"));

        const relatedMap = new Map<string, any>();
        const missingIds: string[] = [];
        // L2 keys are built once during the L1 probe and carried in parallel,
        // so the Redis batch never re-interpolates the same key strings.
        const missingKeys: string[] = [];

        // 🚀 L1 Probe: Check if relation entity is already in-memory
        const tenantKey = tenantId || "global";
        if (!enforceTargetPolicy) {
          for (const id of ids) {
            const cacheKey = `${tenantKey}:collection:${collectionId}:${id}`;
            const cached = cacheService.getSync<any>(cacheKey, tenantId);
            if (cached && typeof cached === "object") {
              const row = "data" in cached ? cached.data : cached;
              if (row) {
                relatedMap.set(id, row);
                continue;
              }
            }
            missingIds.push(id);
            missingKeys.push(cacheKey);
          }
        } else {
          for (const id of ids) missingIds.push(id);
        }

        // 🚀 L2 Probe (Redis batch): If Redis is available, check missing keys in bulk
        if (
          !enforceTargetPolicy &&
          missingIds.length > 0 &&
          typeof cacheService.getMany === "function"
        ) {
          const l2Results = await cacheService.getMany<any>(missingKeys, tenantId).catch(() => []);
          // In-place compaction of the ID list only (no `stillMissing` copy);
          // survivors keep their original relative order for the DB `$in` batch
          // below. `missingKeys` is deliberately NOT compacted/truncated: the
          // array reference was handed to getMany, and callers that retain it
          // (spies, mock call recordings) must keep seeing the as-called keys.
          let write = 0;
          for (let i = 0; i < missingIds.length; i++) {
            const cached = l2Results[i];
            if (cached && typeof cached === "object") {
              const row = "data" in cached ? cached.data : cached;
              if (row) {
                relatedMap.set(missingIds[i], row);
                continue;
              }
            }
            missingIds[write] = missingIds[i];
            write++;
          }
          missingIds.length = write;
        }

        // Fetch remaining un-cached IDs in chunked batches (protects SQL variable limits)
        if (missingIds.length > 0) {
          for (let c = 0; c < missingIds.length; c += RELATION_FETCH_CHUNK_SIZE) {
            const chunk = missingIds.slice(c, c + RELATION_FETCH_CHUNK_SIZE);
            const baseQuery: Record<string, unknown> = { _id: { $in: chunk } };
            let scopedQuery: Record<string, unknown> = baseQuery;
            if (targetSchema) {
              scopedQuery = mergeAccessConstraint(
                typeof ownership === "object" && ownership !== null
                  ? { ...baseQuery, ...ownership }
                  : baseQuery,
                accessConstraint,
              );
              applyPublicationToQuery(scopedQuery, publicationFilter);
            }
            const relatedResult = await _dbAdapter.crud.findMany(collectionName, scopedQuery, {
              limit: chunk.length,
              tenantId: tenantId as DatabaseId,
              // Never fetch relations across tenants: system scope is for a global
              // (tenantless) read only.
              ...(tenantId ? {} : withSystemScope("bootstrap")),
            });

            if (relatedResult?.success && Array.isArray(relatedResult.data)) {
              for (let i = 0; i < relatedResult.data.length; i++) {
                const rel = relatedResult.data[i];
                const rid = String(rel._id);
                relatedMap.set(rid, rel);

                // Synchronously warm L1 for immediate reuse without promise lag
                const cacheKey = `${tenantKey}:collection:${collectionId}:${rid}`;
                cacheService.setSync?.(
                  cacheKey,
                  { success: true, data: rel },
                  180,
                  tenantId,
                  CacheCategory.ENTRY,
                  [`doc:${collectionId}:${rid}`],
                );
              }
            }
          }
        }

        // Attach resolved relations directly to items. Target rows are redacted
        // with the TARGET schema's field policy; `redactRecord` returns the same
        // reference when nothing is guarded, so the shared cache stays raw.
        const targetFields = Array.isArray(targetSchema?.fields) ? targetSchema.fields : null;
        for (let f = 0; f < fields.length; f++) {
          const fieldName = fields[f];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const val = item[fieldName];
            if (typeof val === "string") {
              const row = relatedMap.get(val) || null;
              item[`_populated_${fieldName}`] =
                row && targetFields ? redactRecord(row, targetFields, policy.user as never) : row;
            } else if (Array.isArray(val)) {
              const populatedList: any[] = [];
              for (let v = 0; v < val.length; v++) {
                const resolved = relatedMap.get(val[v]);
                if (resolved) {
                  populatedList.push(
                    targetFields
                      ? redactRecord(resolved, targetFields, policy.user as never)
                      : resolved,
                  );
                }
              }
              item[`_populated_${fieldName}`] = populatedList;
            }
          }
        }
      } catch {
        // Silently skip failed relation resolution
      }
    },
  );

  // One target: await it directly — Promise.all([p]) only adds a wrapper.
  if (collectionFetches.length === 1) {
    await collectionFetches[0];
  } else {
    await Promise.all(collectionFetches);
  }
}
