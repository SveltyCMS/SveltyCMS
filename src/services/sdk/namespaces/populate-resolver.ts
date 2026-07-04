/**
 * @file src/services/sdk/namespaces/populate-resolver.ts
 * @description Resolves populated relations for collection query results.
 *
 * When `populate: ["author", "categories"]` is passed in find options,
 * this module fetches the related entries and attaches them to each result
 * item as `_populated_<field>`.
 */
import type { DatabaseId } from "@src/content/types";

/**
 * Resolve populated relations for a result set.
 * For each populate field, fetches the related entries and attaches them to items.
 */
export async function resolvePopulatedRelations(
  items: any[],
  schema: any,
  populateFields: string[],
  tenantId: string | undefined,
  _dbAdapter: any,
  getCollectionName: (id: string) => string,
): Promise<void> {
  for (const fieldName of populateFields) {
    const field = (schema.fields as any[])?.find(
      (f: any) => f.db_fieldName === fieldName || f.name === fieldName,
    );
    if (!field) continue;

    const relationCollection = field.relation || field.collection;
    if (!relationCollection) continue;

    // Collect all unique related IDs
    const relatedIds = new Set<string>();
    for (const item of items) {
      const val = item[fieldName];
      if (typeof val === "string" && val) relatedIds.add(val);
      else if (Array.isArray(val)) val.forEach((v: string) => v && relatedIds.add(v));
    }

    if (relatedIds.size === 0) continue;

    // Fetch related entries
    try {
      const collectionName = getCollectionName(relationCollection);
      const relatedResult = await _dbAdapter.crud.findMany(
        collectionName,
        { _id: { $in: [...relatedIds] } },
        { limit: relatedIds.size, tenantId: tenantId as DatabaseId, bypassTenantCheck: true },
      );

      if (relatedResult.success && relatedResult.data) {
        const relatedMap = new Map<string, any>();
        for (const rel of relatedResult.data) {
          relatedMap.set(String(rel._id), rel);
        }

        // Attach related entries
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
    } catch {
      // Silently skip failed relation resolution
    }
  }
}
