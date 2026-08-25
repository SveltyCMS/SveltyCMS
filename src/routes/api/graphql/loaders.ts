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
import { applyPublicationToQuery } from "@utils/security/publication-policy";
import { collectionTableName } from "@src/databases/core/collection-name";

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
      // 🐛 FIX (BUG-01): canonical physical name — the manual `collection_${id}`
      // broke GraphQL loading for hyphenated collection ids (missing table).
      const collectionName = collectionTableName(collectionId);
      loader = new BatchLoader(async (ids) => {
        try {
          const entryMap = new Map<string, any>();
          const BATCH_SIZE = 1000;

          for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const batchIds = ids.length <= BATCH_SIZE ? ids : ids.slice(i, i + BATCH_SIZE);
            const query: Record<string, unknown> = { _id: { $in: batchIds } };
            applyPublicationToQuery(query, publicationFilter);

            const result = await dbAdapter.crud.findMany(collectionName, query, {
              tenantId: tenantId as DatabaseId,
              limit: Math.max(batchIds.length, 1000),
            });

            if (result.success && Array.isArray(result.data)) {
              for (const entry of result.data) {
                if (entry?._id) {
                  const key = typeof entry._id === "string" ? entry._id : String(entry._id);
                  entryMap.set(key, entry);
                }
              }
            } else if (!result.success) {
              logger.error(
                `[GraphQL loaders] collectionLoader for "${collectionId}" failed: ${result.message || "Unknown error"}`,
                result.error,
              );
            }
          }

          return ids.map((id) => {
            const key = typeof id === "string" ? id : String(id);
            return entryMap.get(key) || null;
          });
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
            const userMap = new Map<string, User>();
            const BATCH_SIZE = 1000;

            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
              const batchIds = ids.length <= BATCH_SIZE ? ids : ids.slice(i, i + BATCH_SIZE);
              const result = await dbAdapter.crud.findByIds<User>(
                "users",
                batchIds as DatabaseId[],
                {
                  tenantId: tenantId as DatabaseId,
                  limit: Math.max(batchIds.length, 1000),
                },
              );

              if (result.success && Array.isArray(result.data)) {
                for (const user of result.data) {
                  if (user?._id) {
                    const key = typeof user._id === "string" ? user._id : String(user._id);
                    userMap.set(key, user);
                  }
                }
              } else if (!result.success) {
                logger.error(
                  `[GraphQL loaders] userLoader failed: ${result.message || "Unknown error"}`,
                  result.error,
                );
              }
            }

            return ids.map((id) => {
              const key = typeof id === "string" ? id : String(id);
              return userMap.get(key) || null;
            });
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
              const mediaMap = new Map<string, MediaItem>();
              const BATCH_SIZE = 1000;

              for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const batchIds = ids.length <= BATCH_SIZE ? ids : ids.slice(i, i + BATCH_SIZE);
                const result = await dbAdapter.crud.findByIds<MediaItem>(
                  "media",
                  batchIds as DatabaseId[],
                  {
                    tenantId: tenantId as DatabaseId,
                    limit: Math.max(batchIds.length, 1000),
                  },
                );

                if (result.success && Array.isArray(result.data)) {
                  for (const item of result.data) {
                    if (item?._id) {
                      const key = typeof item._id === "string" ? item._id : String(item._id);
                      mediaMap.set(key, item);
                    }
                  }
                } else if (!result.success) {
                  logger.error(
                    `[GraphQL loaders] mediaLoader failed: ${result.message || "Unknown error"}`,
                    result.error,
                  );
                }
              }

              return ids.map((id) => {
                const key = typeof id === "string" ? id : String(id);
                return mediaMap.get(key) || null;
              });
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
          const query: Record<string, unknown> = {
            [foreignKeyField]: { $in: parentIds },
          };
          const result = await dbAdapter.crud.findMany(collectionName, query, {
            tenantId: tenantId as DatabaseId,
            limit: Math.max(parentIds.length * 50, 1000),
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
