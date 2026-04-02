/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the CMS configuration
 * - Generate GraphQL type definitions and resolvers for each collection
 * - Handle complex field types and nested structures
 * - Integrate with Redis for caching (via CacheService, tenent-aware)
 * - Apply token replacement for string fields
 *
 * Features:
 * - Dynamic schema generation based on widget configurations
 * - Support for extracted fields and nested structures
 * - Integration with custom widget schemas
 * - Redis caching for improved performance (following Architecture Standard)
 * - Error handling and logging
 *
 * Usage:
 * Used by the main GraphQL setup to generate collection-specific schemas and resolvers
 */

// Collection Manager
import { modifyRequest } from "@api/collections/modify-request";
import { contentManager } from "@src/content";
import type { FieldInstance, Schema } from "@src/content/types";
// Types
import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter, DatabaseId, CollectionModel } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
// Token Engine
import { replaceTokens } from "@src/services/token/engine";
import type { TokenContext } from "@src/services/token/types";

// System Logger
import { logger } from "@utils/logger.server";
import { createCleanTypeName, getFieldName } from "@utils/utils";
// deepmerge import removed
import { widgets } from "@src/stores/widget-store.svelte.ts";

interface DocumentBase {
  _id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

// Interface compatible with CacheService wrapper
interface CacheClient {
  get(key: string, tenantId?: string | null): Promise<string | null>;
  set(
    key: string,
    value: string,
    ex: string,
    duration: number,
    tenantId?: string | null,
  ): Promise<unknown>;
}

// Memoization for registerCollections results per tenant
const schemaCache = new Map<string, { timestamp: number; result: any }>();
const CACHE_EXPIRY_MS = 30000; // 30 seconds

// Registers collection schemas dynamically, now tenant-aware
export async function registerCollections(tenantId?: string | null) {
  const cacheKey = tenantId || "system";
  const now = Date.now();
  const cached = schemaCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_EXPIRY_MS) {
    return cached.result;
  }

  await contentManager.initialize(tenantId);
  const collections: Schema[] = await contentManager.getCollections(tenantId);

  const typeDefsSet = new Set<string>();
  const collectionSchemas: string[] = [];
  const resolvers: any = { Query: {} };

  // Add common types
  typeDefsSet.add(`
    input PaginationInput {
      page: Int
      limit: Int
    }
  `);

  for (const collection of collections) {
    if (!collection._id) {
      continue;
    }

    const name = typeof collection.name === "string" ? collection.name : "";
    const cleanTypeName = createCleanTypeName({ _id: collection._id, name });

    let collectionGQL = `type ${cleanTypeName} {\n`;
    collectionGQL += `  _id: String!\n`;
    collectionGQL += `  createdAt: String\n`;
    collectionGQL += `  updatedAt: String\n`;

    for (const field of (collection.fields as FieldInstance[]) || []) {
      const fieldName = getFieldName(field);
      const widgetName = field.widget.Name || field.widget.constructor.name;
      const widget = widgets[widgetName];

      if (widget && widget.GraphqlSchema) {
        const { typeID, graphql, resolver } = widget.GraphqlSchema({
          field,
          label: fieldName,
          collection,
          collections,
        });

        if (typeID) {
          collectionGQL += `  ${fieldName}: ${typeID}\n`;
        }
        if (graphql) {
          typeDefsSet.add(graphql);
        }
        if (resolver) {
          resolvers[cleanTypeName] = {
            ...resolvers[cleanTypeName],
            ...resolver,
          };
        }
      } else {
        // Default mapping for basic widgets
        collectionGQL += `  ${fieldName}: String\n`;
      }
    }

    collectionGQL += `}\n`;
    collectionSchemas.push(collectionGQL);

    // Add query for this collection
    typeDefsSet.add(
      `extend type Query { ${cleanTypeName}(pagination: PaginationInput): [${cleanTypeName}] }\n`,
    );
  }

  const finalResult = {
    typeDefs: Array.from(typeDefsSet).join("\n") + collectionSchemas.join("\n"),
    resolvers,
    collections,
  };

  schemaCache.set(cacheKey, { timestamp: now, result: finalResult });
  return finalResult;
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(
  dbAdapter: DatabaseAdapter,
  cacheClient: CacheClient | null,
  tenantId?: string | null,
) {
  if (!dbAdapter) {
    throw new Error("Database adapter is not initialized");
  }
  const { resolvers, collections } = await registerCollections(tenantId);

  for (const collection of collections) {
    if (!collection._id) {
      continue;
    }

    const name = typeof collection.name === "string" ? collection.name : "";
    const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
    resolvers.Query[cleanTypeName] = async function resolver(
      _parent: unknown,
      args: { pagination?: { page?: number; limit?: number } },
      context: unknown,
    ): Promise<DocumentBase[]> {
      // Type guard for context
      const ctx = context as {
        user?: User;
        tenantId?: string | null;
        bypassTenantIsolation?: boolean;
        locale?: string;
      };
      if (!ctx.user) {
        throw new Error("Authentication required");
      }

      if (getPrivateSettingSync("MULTI_TENANT")) {
        if (ctx.tenantId !== tenantId) {
          logger.error(`Resolver tenantId mismatch. Expected ${tenantId}, got ${ctx.tenantId}`);
          throw new Error("Internal server error: Tenant context mismatch.");
        }

        const userTenant = ctx.user.tenantId;
        if (userTenant && userTenant !== ctx.tenantId) {
          if (!ctx.bypassTenantIsolation) {
            throw new Error("Forbidden: Tenant isolation mismatch");
          } else {
            // Global admin bypass
            import("@src/services/audit-log-service")
              .then((module) => {
                module.auditLogService.logEvent({
                  action: "security_bypass",
                  actorId: (ctx.user?._id || "system") as DatabaseId,
                  eventType: module.AuditEventType.UNAUTHORIZED_ACCESS,
                  severity: "medium",
                  result: "success",
                  details: {
                    description: "Global admin bypassed tenant isolation in GraphQL Collections",
                    targetTenant: ctx.tenantId || "",
                    userTenant: userTenant || "",
                    collection: collection._id,
                  },
                  tenantId: (ctx.tenantId as DatabaseId) || null,
                });
              })
              .catch(() => {});
          }
        }
      }

      if (!dbAdapter) {
        throw new Error("Database adapter is not initialized");
      }

      const { page = 1, limit = 50 } = args.pagination || {};
      const locale = ctx.locale || "en";

      try {
        const collectionStats = contentManager.getCollectionStats(collection._id!, ctx.tenantId);
        if (!collectionStats) {
          throw new Error(`Collection not found: ${collection._id}`);
        }

        // CACHE: Conforming to Cache Architecture (Category: Query)
        // Key: query:collections:{id}:{page}:{limit}:{locale}:{version}
        const contentVersion = contentManager.getContentVersion();
        const cacheKey = `query:collections:${collection._id}:${page}:${limit}:${locale}:${contentVersion}`;

        if (getPrivateSettingSync("USE_REDIS") && cacheClient) {
          const cachedResult = await cacheClient.get(cacheKey, ctx.tenantId);
          if (cachedResult) {
            return JSON.parse(cachedResult);
          }
        }

        // Query execution
        const query: Record<string, unknown> = {};
        if (getPrivateSettingSync("MULTI_TENANT") && ctx.tenantId) {
          query.tenantId = ctx.tenantId;
        }

        const collectionName = `collection_${collection._id}`;

        // Ensure collection infra (QueryBuilder) is ready
        if (dbAdapter.ensureCollections) {
          await dbAdapter.ensureCollections();
        }

        const queryBuilder = dbAdapter
          .queryBuilder(collectionName)
          .where(Object.keys(query).length ? query : {})
          .paginate({ page, pageSize: limit });
        const result = await queryBuilder.execute();

        if (!result.success) {
          throw new Error(`Database query failed: ${result.error?.message || "Unknown error"}`);
        }

        const resultArray = (Array.isArray(result.data)
          ? result.data
          : []) as unknown as DocumentBase[];

        // Modify Request (Permissions & Computed Fields)
        if (resultArray.length > 0) {
          try {
            await modifyRequest({
              data: resultArray,
              fields: collection.fields as FieldInstance[],
              collection: collection as unknown as CollectionModel,
              user: ctx.user!,
              type: "GET",
            });
          } catch (modifyError) {
            logger.warn("GraphQLmodify-requestfailed", {
              error: modifyError instanceof Error ? modifyError.message : "Unknown error",
            });
          }
        }

        // Token Replacement
        const processedResults = await Promise.all(
          resultArray.map(async (doc) => {
            const tokenContext: TokenContext = {
              entry: doc,
              user: ctx.user,
            };

            const processedDoc = { ...doc };
            for (const key in processedDoc) {
              if (!Object.hasOwn(processedDoc, key)) {
                continue;
              }
              const value = processedDoc[key];
              if (typeof value === "string" && value.includes("{{")) {
                try {
                  processedDoc[key] = await replaceTokens(value, tokenContext);
                } catch (err) {
                  logger.warn(`Token replacement failed for field ${key}`, err);
                }
              }
            }
            return processedDoc;
          }),
        );

        // Date Normalization
        for (const doc of processedResults) {
          doc.createdAt = doc.createdAt
            ? new Date(doc.createdAt).toISOString()
            : new Date().toISOString();
          doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
        }

        // CACHE SET: Category 'query' (Default TTL: 30m = 1800s)
        if (getPrivateSettingSync("USE_REDIS") && cacheClient) {
          await cacheClient.set(
            cacheKey,
            JSON.stringify(processedResults),
            "EX",
            1800,
            ctx.tenantId,
          );
        }

        return processedResults;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching data for ${collection._id}: ${errorMessage}`);
        throw new Error(`Failed to fetch data for ${collection._id}: ${errorMessage}`);
      }
    };
  }

  return resolvers;
}
