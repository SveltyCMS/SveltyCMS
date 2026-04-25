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
import { modifyRequest } from "@utils/modify-request";
import { contentSystem } from "@src/content";
import type { FieldInstance, Schema } from "@src/content/types";
// Types
import type { User } from "@src/databases/auth/types";
import type { CollectionModel, DatabaseAdapter } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
// Token Engine
import { replaceTokens } from "@src/services/token/engine";
import type { TokenContext } from "@src/services/token/types";
import { widgets } from "@src/stores/widget-store.svelte.ts";

// System Logger
import { logger } from "@utils/logger.server";
import { getFieldName } from "@utils/utils";
// deepmerge import removed
import type { GraphQLFieldResolver } from "graphql";

// Helper to extract localized value
function getLocalizedValue(value: unknown, locale = "en"): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // Check if it looks like a localized object (keys are language codes)
    const valObj = value as Record<string, unknown>;
    if (locale in valObj) {
      return valObj[locale];
    }
    // Fallback to 'en' or first key
    if ("en" in valObj) {
      return valObj.en;
    }
    const keys = Object.keys(valObj);
    if (keys.length > 0) {
      return valObj[keys[0]];
    }
  }
  return value;
}

/**
 * Creates a clean GraphQL type name from collection info
 * Uses collection name + short UUID suffix for uniqueness and readability
 */
export function createCleanTypeName(collection: { _id?: string; name?: string | unknown }): string {
  const rawName = typeof collection.name === "string" ? collection.name : "";
  const baseName = rawName.split("/").pop() || rawName;
  const cleanName = baseName
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[0-9]/, "Collection$&")
    .replace(/^[a-z]/, (c) => c.toUpperCase());

  // Use the full ID if it looks like a benchmark/static ID (8 chars or less),
  // otherwise take the first 8 for uniqueness.
  const id = collection._id ?? "";
  const idSuffix = id.length <= 8 ? id : id.substring(0, 8);
  return `${cleanName}_${idSuffix}`;
}

interface WidgetSchema {
  graphql: string;
  base?: string;
  resolver?: Record<string, GraphQLFieldResolver<unknown, unknown>>;
  typeID: string;
  typeName: string;
}

interface DocumentBase {
  _id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

interface ResolverContext {
  Query: Record<string, GraphQLFieldResolver<unknown, unknown>>;
  [key: string]: Record<string, GraphQLFieldResolver<unknown, unknown>>;
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

// Registers collection schemas dynamically, now tenant-aware
export async function registerCollections(tenantId?: string | null) {
  await contentSystem.initialize(tenantId);
  await widgets.initialize(tenantId || "default");
  const collections: Schema[] = await contentSystem.getCollections(tenantId);

  const typeIDs = new Set<string>();
  const typeDefsSet = new Set<string>();
  const resolvers: ResolverContext = { Query: {} };
  const collectionSchemas: string[] = [];
  const queryFields: string[] = [];
  const collectionNameMapping = new Map<string, string>();
  const relationMap = new Map<
    string,
    Array<{ otherCollection: Schema; otherField: FieldInstance }>
  >();

  for (const collection of collections) {
    const name = typeof collection.name === "string" ? collection.name : "";
    if (!name) {
      logger.trace(`[GraphQL] Skipping collection without name: ${collection._id}`);
      continue;
    }
    const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
    relationMap.set(name, []); // Initialize map for relation lookup
    collectionNameMapping.set(name, cleanTypeName);
  }

  // --- Optimization: Pre-calculate Relations to avoid O(N^2) lookup ---
  for (const otherCollection of collections) {
    if (!otherCollection.name) continue;
    for (const otherField of otherCollection.fields as FieldInstance[]) {
      const otherWidgetName =
        typeof otherField.widget === "string" ? otherField.widget : otherField.widget?.Name;
      if (otherWidgetName === "Relation") {
        const targetCollection = (otherField as any).collection;
        if (targetCollection) {
          if (!relationMap.has(targetCollection)) relationMap.set(targetCollection, []);
          relationMap.get(targetCollection)!.push({ otherCollection, otherField });
        }
      }
    }
  }

  for (const collection of collections) {
    const name = typeof collection.name === "string" ? collection.name : "";
    if (!name) continue;
    const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
    resolvers[cleanTypeName] = {};
    let collectionSchema = `\n\ttype ${cleanTypeName} {\n`;

    for (const field of collection.fields as FieldInstance[]) {
      const widgetNameRaw = typeof field.widget === "string" ? field.widget : field.widget?.Name;
      if (!widgetNameRaw || typeof widgetNameRaw !== "string") {
        continue;
      }

      const widgetFunctionsMap = widgets.widgetFunctions;
      let widget =
        widgetFunctionsMap[widgetNameRaw] ||
        widgetFunctionsMap[widgetNameRaw.charAt(0).toLowerCase() + widgetNameRaw.slice(1)] ||
        widgetFunctionsMap[widgetNameRaw.toLowerCase()];

      if (!widget) {
        continue;
      }

      if (typeof widget.GraphqlSchema !== "function") {
        continue;
      }

      const fieldName = getFieldName(field);
      const schema = widget.GraphqlSchema({
        field,
        label: `${cleanTypeName}_${fieldName}`,
        fieldName,
        collection,
        collectionNameMapping,
      }) as WidgetSchema | undefined;

      if (!schema) continue;

      if (schema.base) {
        collectionSchema += `\t\t${schema.base}\n`;
      }

      if (schema.resolver) Object.assign(resolvers[cleanTypeName], schema.resolver);

      if (schema.graphql?.trim() && !typeIDs.has(schema.typeID)) {
        typeIDs.add(schema.typeID);
        typeDefsSet.add(schema.graphql);
      } else if (!schema.graphql?.trim() && schema.typeID) {
        typeIDs.add(schema.typeID);
      }

      // Nested Fields Logic
      if (
        "extract" in field &&
        Array.isArray((field as any).fields) &&
        (field as any).fields.length > 0
      ) {
        for (const FIELD of (field as any).fields) {
          const nestedWidgetNameRaw = FIELD.widget?.Name;
          if (!nestedWidgetNameRaw || typeof nestedWidgetNameRaw !== "string") continue;

          let nestedWidget =
            widgetFunctionsMap[nestedWidgetNameRaw] ||
            widgetFunctionsMap[
              nestedWidgetNameRaw.charAt(0).toLowerCase() + nestedWidgetNameRaw.slice(1)
            ] ||
            widgetFunctionsMap[nestedWidgetNameRaw.toLowerCase()];

          if (!nestedWidget || typeof nestedWidget.GraphqlSchema !== "function") continue;

          const nestedFieldName = getFieldName(FIELD);
          const nestedSchema = nestedWidget.GraphqlSchema({
            field: FIELD,
            label: `${cleanTypeName}_${nestedFieldName}`,
            fieldName: nestedFieldName,
            collection,
            collectionNameMapping,
          });

          if (nestedSchema?.typeID) {
            if (nestedSchema.graphql?.trim() && !typeIDs.has(nestedSchema.typeID)) {
              typeIDs.add(nestedSchema.typeID);
              typeDefsSet.add(nestedSchema.graphql);
            } else if (!nestedSchema.graphql?.trim()) {
              typeIDs.add(nestedSchema.typeID);
            }
            collectionSchema += `\t\t${nestedFieldName}: ${nestedSchema.typeID}\n`;

            resolvers[cleanTypeName][nestedFieldName] = (parent: any, _args: any, ctx: any) =>
              getLocalizedValue(parent[nestedFieldName], ctx.locale);
          }
        }
      } else {
        collectionSchema += `\t\t${fieldName}: ${schema.typeID}\n`;
        if (!resolvers[cleanTypeName][fieldName]) {
          resolvers[cleanTypeName][fieldName] = (parent: any, _args: any, ctx: any) =>
            getLocalizedValue(parent[fieldName], ctx.locale);
        }
      }
    }

    // --- Efficient Inverse Relations Logic ---
    const related = relationMap.get(name) || [];
    for (const { otherCollection, otherField } of related) {
      const inverseFieldName = createCleanTypeName({
        _id: otherCollection._id,
        name: typeof otherCollection.name === "string" ? otherCollection.name : "",
      }).split("_")[0];

      collectionSchema += `\t\t${inverseFieldName}: [${createCleanTypeName(otherCollection)}]\n`;

      resolvers[cleanTypeName][inverseFieldName] = async (
        parent: any,
        _args: any,
        context: any,
      ) => {
        const { dbAdapter, tenantId } = context;
        if (!dbAdapter) return [];

        const result = await dbAdapter.crud.findMany(
          typeof otherCollection.name === "string" ? otherCollection.name : "",
          {
            [getFieldName(otherField)]: parent._id,
            ...(tenantId ? { tenantId } : {}),
          },
        );
        return result.success ? result.data : [];
      };
    }

    // --- Base Fields (Only if not already defined) ---
    const baseFields = [
      { name: "_id", type: "String" },
      { name: "status", type: "String" },
      { name: "createdAt", type: "String" },
      { name: "updatedAt", type: "String" },
      { name: "createdBy", type: "String" },
      { name: "updatedBy", type: "String" },
    ];

    for (const baseField of baseFields) {
      if (!collectionSchema.includes(`\t\t${baseField.name}:`)) {
        collectionSchema += `\t\t${baseField.name}: ${baseField.type}\n`;
      }
    }
    collectionSchema += "\t}";

    collectionSchemas.push(`${collectionSchema}\n`);
    queryFields.push(`${cleanTypeName}(pagination: PaginationInput): [${cleanTypeName}]`);
  }

  const finalTypeDefs = Array.from(typeDefsSet).join("\n") + collectionSchemas.join("\n");

  return {
    typeDefs: finalTypeDefs,
    queryFields,
    resolvers,
    collections,
  };
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
      const ctx = context as {
        user?: User;
        tenantId?: string | null;
        locale?: string;
        bypassTenantIsolation?: boolean;
      };
      if (!ctx.user) {
        throw new Error("Authentication required");
      }

      if (getPrivateSettingSync("MULTI_TENANT") && ctx.tenantId !== tenantId) {
        logger.error(`Resolver tenantId mismatch. Expected ${tenantId}, got ${ctx.tenantId}`);
        throw new Error("Internal server error: Tenant context mismatch.");
      }

      // Check user tenant isolation
      if (getPrivateSettingSync("MULTI_TENANT") && !ctx.bypassTenantIsolation) {
        const userTenantId = ctx.user.tenantId;
        const isGlobalAdmin = !userTenantId || userTenantId === "global";
        if (!isGlobalAdmin && userTenantId !== ctx.tenantId) {
          throw new Error("Forbidden: Tenant isolation mismatch");
        }
      }

      if (!dbAdapter) {
        throw new Error("Database adapter is not initialized");
      }

      const { page = 1, limit = 50 } = args.pagination || {};
      const locale = ctx.locale || "en";

      try {
        const contentVersion = contentSystem.getContentVersion();
        const cacheKey = `query:collections:${collection._id}:${page}:${limit}:${locale}:${contentVersion}`;

        if (getPrivateSettingSync("USE_REDIS") && cacheClient) {
          const cachedResult = await cacheClient.get(cacheKey, ctx.tenantId);
          if (cachedResult) {
            return JSON.parse(cachedResult);
          }
        }

        const query: Record<string, unknown> = {};
        if (getPrivateSettingSync("MULTI_TENANT") && ctx.tenantId) {
          query.tenantId = ctx.tenantId;
        }

        const collectionName = `collection_${collection._id}`;
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
            logger.warn("GraphQL modify-request failed", {
              error: modifyError instanceof Error ? modifyError.message : "Unknown error",
            });
          }
        }

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

        for (const doc of processedResults) {
          doc.createdAt = doc.createdAt
            ? new Date(doc.createdAt).toISOString()
            : new Date().toISOString();
          doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
        }

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
