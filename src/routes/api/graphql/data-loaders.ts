import DataLoader from "dataloader";
import { getDb } from "@src/databases/db";

interface RelationTarget {
  id: string;
  collection: string;
}

/**
 * 🚀 Zero-Allocation Batch Loader for Cross-Collection Widget Relations
 * Compresses N+1 independent downstream database network roundtrips
 * into a single unified batched query index lookup.
 */
export function createRelationLoader(tenantId: string) {
  return new DataLoader<RelationTarget, any, string>(
    async (targets) => {
      // Group targets by collection to perform single-pass database sweeps
      const groups = new Map<string, string[]>();
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        let collectionGroup = groups.get(t.collection);
        if (!collectionGroup) {
          collectionGroup = [];
          groups.set(t.collection, collectionGroup);
        }
        collectionGroup.push(t.id);
      }

      const db = getDb();
      const resultMap = new Map<string, any>();
      const groupPromises = [];

      // Execute separate database queries in parallel across distinct collections
      for (const [collection, ids] of groups.entries()) {
        groupPromises.push(
          (async () => {
            try {
              const recordsResult = await db.crud.findMany(collection, {
                _id: { $in: ids },
                ...(tenantId && tenantId !== "global" ? { tenantId } : {}),
              });
              const records = recordsResult.data || [];
              for (let k = 0; k < records.length; k++) {
                const row = records[k]!;
                resultMap.set(`${collection}/${row._id}`, row);
              }
            } catch {
              /* suppress individual collection lookup misses */
            }
          })(),
        );
      }

      await Promise.all(groupPromises);

      // Map back to the exact initial order requested by the GraphQL execution engine
      const orderedResults = Array.from({ length: targets.length });
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        orderedResults[i] = resultMap.get(`${t.collection}/${t.id}`) || null;
      }

      return orderedResults;
    },
    {
      // Cache identical database references inside the same request context sequence
      cacheKeyFn: (target) => `${target.collection}/${target.id}`,
    },
  );
}
