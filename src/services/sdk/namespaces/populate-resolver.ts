/**
 * @file src/services/sdk/namespaces/populate-resolver.ts
 * @description Resolves populated relations for collection query results.
 *
 * When `populate: ["author", "categories"]` is passed in find options,
 * this module coalesces related entries across fields by target collection
 * to eliminate redundant N+1 queries and attaches them to each result item
 * as `_populated_<field>`.
 *
 * ### Features:
 * - coalesced per-target-collection fetches with L1/L2 cache-through
 * - caller policy applied to target rows (publication, ownership, redaction)
 * - privileged-only deferred relation warm-up (`scheduleRelationWarmup`)
 */
import type { DatabaseId } from "@src/content/types";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { isAdmin } from "@src/databases/auth/constants";
import { redactRecord } from "@utils/field-access";
import { logger } from "@utils/logger";
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
  /**
   * When `false`, resolve and warm the relation cache but do not write
   * `_populated_*` keys onto the input rows. Used by the deferred warm-up so a
   * read caller's response shape stays untouched.
   * @default true
   */
  attach?: boolean;
}

/**
 * Max ids per relation query — protects SQL variable limits. Hoisted so the
 * constant is not re-created per target-collection resolution.
 */
const RELATION_FETCH_CHUNK_SIZE = 500;

/**
 * Max relation fields warmed per detail read — bounds the deferred fetch fan-out
 * (one query per distinct target collection).
 */
const RELATION_WARMUP_MAX_FIELDS = 4;

/**
 * Max unique target ids collected per detail read — bounds the deferred `$in`
 * batch. IDs are counted per target collection: the resolver fetches each
 * collection separately, so the same id in two collections is two row reads.
 */
const RELATION_WARMUP_MAX_IDS = 50;

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

                // `set` writes L1 before its first await, so the local read is
                // warm synchronously; the L2/Redis write is buffered in the
                // background. Never await it — the read must not pay the
                // Redis round-trip, and a failed write must not fail the read.
                const cacheKey = `${tenantKey}:collection:${collectionId}:${rid}`;
                void cacheService
                  .set(cacheKey, { success: true, data: rel }, 180, tenantId, CacheCategory.ENTRY, [
                    `doc:${collectionId}:${rid}`,
                  ])
                  .catch((err: unknown) => {
                    logger.debug(
                      `[SDK] relation cache warm-up failed for "${cacheKey}": ${
                        err instanceof Error ? err.message : String(err)
                      }`,
                    );
                  });
              }
            }
          }
        }

        // Attach resolved relations directly to items. Target rows are redacted
        // with the TARGET schema's field policy; `redactRecord` returns the same
        // reference when nothing is guarded, so the shared cache stays raw.
        // `attach: false` is a warm-up pass: the cache writes above are the whole
        // point, and the caller's rows must keep their original shape.
        if (policy.attach === false) return;

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

/**
 * Add a not-yet-seen id to a warm-up field, respecting the global budget.
 */
function collectWarmupId(
  value: unknown,
  targetKey: string,
  into: string[],
  seen: Set<string>,
): void {
  if (typeof value !== "string" || value.length === 0) return;
  const key = `${targetKey}\u0000${value}`;
  if (seen.has(key)) return;
  if (seen.size >= RELATION_WARMUP_MAX_IDS) return;
  seen.add(key);
  into.push(value);
}

/**
 * Deferred, bounded cache warm-up for a detail row's declared relations.
 *
 * The entry editor opens relation pickers separately from the detail read, so a
 * warm L1 makes the first picker open a cache hit. The pass is only useful for
 * privileged callers: `resolvePopulatedRelations` skips the shared cache when
 * `enforceTargetPolicy` is true (publication/ownership constraint), so an
 * unprivileged caller's targets can never be reused by anyone else.
 *
 * Never affects the read: runs in a `setTimeout(…, 0)` that is unref'd, is
 * capped at {@link RELATION_WARMUP_MAX_FIELDS} fields / {@link RELATION_WARMUP_MAX_IDS}
 * unique ids, and logs (never rethrows) a failed pass. The caller's rows are
 * read, never written — `attach: false` skips the `_populated_*` loop.
 */
export function scheduleRelationWarmup(
  items: readonly unknown[],
  schema: unknown,
  tenantId: string | undefined,
  dbAdapter: unknown,
  getCollectionName: (id: string) => string,
  policy: PopulatePolicy = {},
): void {
  if (items.length === 0) return;
  // Admin/system only: everyone else's target reads are policy-clamped, so the
  // shared cache is never read or written for them (`enforceTargetPolicy`).
  if (policy.system !== true && !isAdmin(policy.user)) return;

  const declared = (schema as { fields?: unknown } | null | undefined)?.fields;
  if (!Array.isArray(declared)) return;

  const warmFields: string[] = [];
  // One carrier row rather than a copy of the caller's items: with
  // `attach: false` the resolver only reads the relation values, and the cap
  // must not truncate (or otherwise touch) the caller's rows.
  const carrier: Record<string, string[]> = {};
  const seenIds = new Set<string>();

  for (const field of declared) {
    if (warmFields.length >= RELATION_WARMUP_MAX_FIELDS) break;
    if (!field || typeof field !== "object") continue;

    const declaredField = field as {
      name?: unknown;
      db_fieldName?: unknown;
      relation?: unknown;
      collection?: unknown;
    };
    const target = declaredField.relation || declaredField.collection;
    if (typeof target !== "string" || target.length === 0) continue;

    const fieldName =
      typeof declaredField.db_fieldName === "string" && declaredField.db_fieldName
        ? declaredField.db_fieldName
        : typeof declaredField.name === "string" && declaredField.name
          ? declaredField.name
          : null;
    if (!fieldName) continue;

    const values: string[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const value = (item as Record<string, unknown>)[fieldName];
      if (typeof value === "string") {
        collectWarmupId(value, target, values, seenIds);
      } else if (Array.isArray(value)) {
        for (const entry of value) collectWarmupId(entry, target, values, seenIds);
      }
    }

    if (values.length === 0) continue;
    warmFields.push(fieldName);
    carrier[fieldName] = values;
  }

  if (warmFields.length === 0) return;

  // Defer past the detail response; never hold the process open (CLI/tests).
  const timer: unknown = setTimeout(() => {
    resolvePopulatedRelations(
      [carrier],
      schema,
      warmFields,
      tenantId,
      dbAdapter,
      getCollectionName,
      { ...policy, attach: false },
    ).catch((error: unknown) => {
      // Warm-up is best-effort by contract — a failed pass must not surface.
      logger.debug(
        `[SDK] relation warm-up failed for "${String(
          (schema as { name?: unknown }).name ?? "unknown",
        )}": ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, 0);
  (timer as { unref?: () => void }).unref?.();
}
