/**
 * @file src/routes/api/graphql/loaders.ts
 * @description
 * High-performance, request-scoped batching infrastructure for SveltyCMS GraphQL layer.
 * Utilizing the native BatchLoader utility to prevent N+1 query patterns.
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter, DatabaseId, MediaItem } from "@src/databases/db-interface";
import { BatchLoader } from "@src/utils/server/batch-loader";
import { logger } from "@utils/logger";

/**
 * Creates a fresh set of loaders for a single request.
 * Loaders should not be shared across requests to ensure proper tenant isolation
 * and to keep the per-request cache fresh.
 */
export function createLoaders(
  dbAdapter: DatabaseAdapter,
  tenantId: string | null,
  publicationFilter: "published" | "draft" | "all" = "all",
) {
  let userLoaderInstance: BatchLoader<string | DatabaseId, User | null> | null = null;
  let mediaLoaderInstance: BatchLoader<string | DatabaseId, MediaItem | null> | null = null;

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
            if (!result.success) {
              logger.error(
                `[GraphQL loaders] collectionLoader for "${collectionId}" failed: ${result.message || "Unknown error"}`,
                result.error,
              );
            }
            return ids.map(() => null);
          }

          let data = result.data;
          if (publicationFilter === "published") {
            data = data.filter((entry: any) => entry.status === "publish");
          } else if (publicationFilter === "draft") {
            data = data.filter(
              (entry: any) => entry.status === "draft" || entry.status === "unpublish",
            );
          }

          const entryMap = new Map(data.map((entry: any) => [entry._id.toString(), entry]));
          return ids.map((id) => entryMap.get(id.toString()) || null);
        } catch (err: any) {
          logger.error(
            `[GraphQL loaders] collectionLoader for "${collectionId}" encountered an exception:`,
            err,
          );
          return ids.map(() => null);
        }
      });
      collectionLoaders.set(collectionId, loader);
    }
    return loader;
  };

  return {
    /** 🚀 LAZY INITIALIZATION: Only instantiates when accessed in a resolver context */
    get userLoader() {
      if (!userLoaderInstance) {
        userLoaderInstance = new BatchLoader<string | DatabaseId, User | null>(async (ids) => {
          try {
            const result = await dbAdapter.crud.findByIds<User>("users", ids as DatabaseId[], {
              tenantId: tenantId as DatabaseId,
            });

            if (!result.success || !result.data) {
              if (!result.success) {
                logger.error(
                  `[GraphQL loaders] userLoader failed: ${result.message || "Unknown error"}`,
                  result.error,
                );
              }
              return ids.map(() => null);
            }

            const userMap = new Map<string, User>(
              result.data.map((user: User) => [user._id.toString(), user]),
            );
            return ids.map((id) => userMap.get(id.toString()) || null);
          } catch (err: any) {
            logger.error(`[GraphQL loaders] userLoader encountered an exception:`, err);
            return ids.map(() => null);
          }
        });
      }
      return userLoaderInstance;
    },

    /** 🚀 LAZY INITIALIZATION: Only instantiates when accessed in a resolver context */
    get mediaLoader() {
      if (!mediaLoaderInstance) {
        mediaLoaderInstance = new BatchLoader<string | DatabaseId, MediaItem | null>(
          async (ids) => {
            try {
              const result = await dbAdapter.crud.findByIds<MediaItem>(
                "media",
                ids as DatabaseId[],
                {
                  tenantId: tenantId as DatabaseId,
                },
              );

              if (!result.success || !result.data) {
                if (!result.success) {
                  logger.error(
                    `[GraphQL loaders] mediaLoader failed: ${result.message || "Unknown error"}`,
                    result.error,
                  );
                }
                return ids.map(() => null);
              }

              const mediaMap = new Map<string, MediaItem>(
                result.data.map((item: MediaItem) => [item._id.toString(), item]),
              );
              return ids.map((id) => mediaMap.get(id.toString()) || null);
            } catch (err: any) {
              logger.error(`[GraphQL loaders] mediaLoader encountered an exception:`, err);
              return ids.map(() => null);
            }
          },
        );
      }
      return mediaLoaderInstance;
    },

    collectionLoader: {
      get: getCollectionLoader,
    },

    /** Batch inverse relation lookups: one findMany($in) per tick instead of N queries */
    createInverseLoader: (collectionName: string, foreignKeyField: string) =>
      new BatchLoader<string | DatabaseId, any[]>(async (parentIds) => {
        try {
          const result = await dbAdapter.crud.findMany(collectionName, {
            [foreignKeyField]: { $in: parentIds },
            ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
          });
          if (!result.success || !result.data) {
            if (!result.success) {
              logger.error(
                `[GraphQL loaders] inverseLoader for "${collectionName}.${foreignKeyField}" failed: ${result.message || "Unknown error"}`,
                result.error,
              );
            }
            return parentIds.map(() => []);
          }
          const groupMap = new Map<string, any[]>();
          for (const row of result.data) {
            const fk = String((row as any)[foreignKeyField] ?? "");
            if (!groupMap.has(fk)) groupMap.set(fk, []);
            groupMap.get(fk)!.push(row);
          }
          return parentIds.map((id) => groupMap.get(String(id)) || []);
        } catch (err: any) {
          logger.error(
            `[GraphQL loaders] inverseLoader for "${collectionName}.${foreignKeyField}" encountered an exception:`,
            err,
          );
          return parentIds.map(() => []);
        }
      }),
  };
}

export type GraphQLContextLoaders = ReturnType<typeof createLoaders>;
