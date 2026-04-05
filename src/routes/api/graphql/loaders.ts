/**
 * @file src/routes/api/graphql/loaders.ts
 * @description
 * High-performance, request-scoped batching infrastructure for SveltyCMS GraphQL layer.
 * Utilizing the native BatchLoader utility to prevent N+1 query patterns.
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter, DatabaseId, MediaItem } from "@src/databases/db-interface";
import { BatchLoader } from "@src/utils/batch-loader";

/**
 * Creates a fresh set of loaders for a single request.
 * Loaders should not be shared across requests to ensure proper tenant isolation
 * and to keep the per-request cache fresh.
 */
export function createLoaders(dbAdapter: DatabaseAdapter, tenantId: string | null) {
  // --- 1. User Loader ---
  const userLoader = new BatchLoader<string | DatabaseId, User | null>(async (ids) => {
    try {
      const result = await dbAdapter.crud.findByIds<User>("users", ids as DatabaseId[], {
        tenantId: tenantId as DatabaseId,
      });

      if (!result.success || !result.data) {
        return ids.map(() => null);
      }

      // Map results back to the requested order
      const userMap = new Map<string, User>(
        result.data.map((user: User) => [user._id.toString(), user]),
      );
      return ids.map((id) => userMap.get(id.toString()) || null);
    } catch {
      return ids.map(() => null);
    }
  });

  // --- 2. Media Loader ---
  const mediaLoader = new BatchLoader<string | DatabaseId, MediaItem | null>(async (ids) => {
    try {
      const result = await dbAdapter.crud.findByIds<MediaItem>("media", ids as DatabaseId[], {
        tenantId: tenantId as DatabaseId,
      });

      if (!result.success || !result.data) {
        return ids.map(() => null);
      }

      const mediaMap = new Map<string, MediaItem>(
        result.data.map((item: MediaItem) => [item._id.toString(), item]),
      );
      return ids.map((id) => mediaMap.get(id.toString()) || null);
    } catch {
      return ids.map(() => null);
    }
  });

  // --- 3. Dynamic Collection Loader Factory ---
  // We use a Map to store loaders for different collections, ensuring we only
  // create one loader per collection per request.
  const collectionLoaders = new Map<string, BatchLoader<string | DatabaseId, any | null>>();

  const getCollectionLoader = (collectionId: string) => {
    let loader = collectionLoaders.get(collectionId);
    if (!loader) {
      const collectionName = `collection_${collectionId}`;
      loader = new BatchLoader(async (ids) => {
        try {
          const result = await dbAdapter.crud.findByIds(collectionName, ids as DatabaseId[], {
            tenantId: tenantId as DatabaseId,
          });

          if (!result.success || !result.data) {
            return ids.map(() => null);
          }

          const entryMap = new Map(result.data.map((entry: any) => [entry._id.toString(), entry]));
          return ids.map((id) => entryMap.get(id.toString()) || null);
        } catch {
          return ids.map(() => null);
        }
      });
      collectionLoaders.set(collectionId, loader);
    }
    return loader;
  };

  return {
    userLoader,
    mediaLoader,
    collectionLoader: {
      get: getCollectionLoader,
    },
  };
}

export type GraphQLContextLoaders = ReturnType<typeof createLoaders>;
