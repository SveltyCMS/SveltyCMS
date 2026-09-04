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

/**
 * Resolve populated relations for a result set.
 * Coalesces lookups across all populate fields sharing the same target collection
 * into a single query per collection, eliminating redundant database round-trips.
 */
export async function resolvePopulatedRelations(
  items: any[],
  schema: any,
  populateFields: string[],
  tenantId: string | undefined,
  _dbAdapter: any,
  getCollectionName: (id: string) => string,
): Promise<void> {
  if (!items || items.length === 0 || !populateFields || populateFields.length === 0) return;

  // 1. Group fields and collect unique IDs by target collection
  const collectionTargets = new Map<
    string,
    {
      fields: Array<{ fieldName: string }>;
      ids: Set<string>;
    }
  >();

  for (const fieldName of populateFields) {
    const field = (schema.fields as any[])?.find(
      (f: any) => f.db_fieldName === fieldName || f.name === fieldName,
    );
    if (!field) continue;

    const relationCollection = field.relation || field.collection;
    if (!relationCollection) continue;

    const collectionName = getCollectionName(relationCollection);
    let target = collectionTargets.get(collectionName);
    if (!target) {
      target = { fields: [], ids: new Set<string>() };
      collectionTargets.set(collectionName, target);
    }
    target.fields.push({ fieldName });

    for (const item of items) {
      const val = item[fieldName];
      if (typeof val === "string" && val) {
        target.ids.add(val);
      } else if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const v = val[i];
          if (typeof v === "string" && v) target.ids.add(v);
        }
      }
    }
  }

  if (collectionTargets.size === 0) return;

  // 2. Fetch all unique IDs per collection in parallel (1 query per collection, not per field)
  const collectionFetches = Array.from(collectionTargets.entries()).map(
    async ([collectionName, { fields, ids }]) => {
      if (ids.size === 0) return;

      try {
        const idArray = Array.from(ids);
        const relatedResult = await _dbAdapter.crud.findMany(
          collectionName,
          { _id: { $in: idArray } },
          { limit: idArray.length, tenantId: tenantId as DatabaseId, bypassTenantCheck: true },
        );

        if (relatedResult?.success && Array.isArray(relatedResult.data)) {
          const relatedMap = new Map<string, any>();
          for (const rel of relatedResult.data) {
            relatedMap.set(String(rel._id), rel);
          }

          // Attach to all items for each field targeting this collection
          for (const { fieldName } of fields) {
            for (const item of items) {
              const val = item[fieldName];
              if (typeof val === "string") {
                (item as any)[`_populated_${fieldName}`] = relatedMap.get(val) || null;
              } else if (Array.isArray(val)) {
                (item as any)[`_populated_${fieldName}`] = val
                  .map((v: string) => relatedMap.get(v))
                  .filter(Boolean);
              }
            }
          }
        }
      } catch {
        // Silently skip failed relation resolution
      }
    },
  );

  await Promise.all(collectionFetches);
}
