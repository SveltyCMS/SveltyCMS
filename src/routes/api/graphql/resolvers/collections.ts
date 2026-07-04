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
import { contentSystem } from "@src/content/index.server";
import type { FieldInstance, Schema } from "@src/content/types";
// Types
import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
// Token Engine
import { replaceTokens } from "@src/services/token/engine";
import type { TokenContext } from "@src/services/token/types";
import { widgets } from "@src/stores/widget-store.svelte";

// System Logger
import { logger } from "@utils/logger";
import { getFieldName } from "@utils/utils";
// deepmerge import removed
import type { GraphQLFieldResolver } from "graphql";

// Helper to extract localized value
function getLocalizedValue(value: unknown, locale = "en"): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const valObj = value as Record<string, unknown>;
    // 🚀 Fast-path for direct locale hit
    if (valObj[locale] !== undefined) return valObj[locale];
    if (valObj.en !== undefined) return valObj.en;
    // 🚀 Slow-path fallback
    for (const k in valObj) {
      if (Object.hasOwn(valObj, k)) return valObj[k];
    }
  }
  return value;
}

/**
 * Creates a clean GraphQL type name from collection info
 * Uses collection name (converted to PascalCase) + optional short UUID suffix for uniqueness.
 */
export function createCleanTypeName(collection: { _id?: string; name?: string | unknown }): string {
  const rawName =
    typeof collection.name === "string" ? collection.name : String(collection._id || "Collection");

  // 1. Convert to PascalCase (handle underscores and hyphens)
  const baseName = rawName.split("/").pop() || rawName;
  const cleanName = baseName
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  // GraphQL identifiers cannot start with a digit
  if (/^[0-9]/.test(cleanName)) {
    return "_" + cleanName;
  }

  const id = collection._id ?? "";
  const normalizedId = id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const normalizedClean = cleanName.toLowerCase();

  // 2. If the cleanName is essentially the same as the ID, return it directly
  if (normalizedClean === normalizedId || normalizedId.startsWith(normalizedClean)) {
    return cleanName;
  }

  // 3. Fallback: Append suffix for uniqueness
  const idSuffix = id.length <= 6 ? id : id.substring(0, 6);
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
  logger.debug(
    `[DEBUG] Executing registerCollections in ${import.meta.url} for tenant: ${tenantId}`,
  );

  await contentSystem.initialize(tenantId);
  await widgets.initialize(tenantId || "default");

  const { isMockScanCollection, isBenchmarkRuntime } =
    await import("@src/routes/setup/preset-collections.server");
  const isBenchmark = isBenchmarkRuntime();

  // 🚀 BENCHMARK HARDENING: Force collection list refresh if in benchmark mode
  if (isBenchmark) {
    const { getDb } = await import("@src/databases/db");
    const { refreshContent } = await import("@src/content/engine.server");
    await refreshContent(tenantId, {
      mode: "schemas",
      adapter: getDb() || undefined,
    });
  }

  const collections: Schema[] = await contentSystem.getCollections(tenantId);

  // 🧪 Filter test collections from GraphQL schema registration.
  // Mock scan artifacts (content-scan benchmark) are ALWAYS excluded — even in
  // benchmark runtime the matrix would otherwise register 150+ mock types → HTTP 500.
  // bench_* / test_* remain available in benchmark mode for relational audits.
  const filtered = collections.filter((c) => {
    const id = String(c._id || "");
    const name = typeof c.name === "string" ? c.name : "";
    if (isMockScanCollection(id, name)) {
      logger.debug(`[GraphQL] Excluding mock scan artifact: ${c._id}`);
      return false;
    }
    const idLower = id.toLowerCase();
    const isBenchTestCollection =
      idLower.startsWith("bench_") || idLower.startsWith("test-") || idLower.startsWith("test_");
    if (isBenchTestCollection && !isBenchmark) {
      logger.debug(`[GraphQL] Excluding test collection: ${c._id}`);
      return false;
    }
    return true;
  });

  logger.debug(
    `[DEBUG] Collections total: ${collections.length}, after test filter: ${filtered.length}. IDs: ${filtered.map((c) => c._id).join(", ")}`,
  );

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

  const iterable = filtered;

  for (const collection of iterable) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      console.log(
        `[GraphQL Debug] Processing collection: id=${collection._id}, name=${collection.name}`,
      );
    }
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
  for (const otherCollection of iterable) {
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

  for (const collection of iterable) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      console.log(
        `[GraphQL Debug] Processing collection: id=${collection._id}, name=${collection.name}`,
      );
    }
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
        const { loaders } = context;
        if (!loaders) return [];

        const collectionName = typeof otherCollection.name === "string" ? otherCollection.name : "";
        const fieldName = getFieldName(otherField);
        const loader = loaders.createInverseLoader(collectionName, fieldName);

        return loader.load(parent._id);
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

  // Add allCollections query for listing all collection schemas.
  // This is used by the benchmark matrix and is useful for API clients.
  typeDefsSet.add(`
	type CollectionInfo {
		_id: String!
		name: String!
		slug: String!
		icon: String
		description: String
		fieldCount: Int!
	}`);
  queryFields.push(`allCollections: [CollectionInfo!]!`);
  const _allCollectionsCache = new Map<string, { data: any[]; ts: number }>();
  const ALL_COLLECTIONS_CACHE_TTL = 5000; // 5 seconds — schemas rarely change

  resolvers.Query["allCollections"] = async (_parent: unknown, _args: unknown, context: any) => {
    if (!context.user) {
      throw new Error("Authentication required");
    }

    const tenantKey = context.tenantId || "global";
    const cached = _allCollectionsCache.get(tenantKey);
    if (cached && Date.now() - cached.ts < ALL_COLLECTIONS_CACHE_TTL) {
      return cached.data;
    }

    const { contentSystem } = await import("@src/content/index.server");
    const all: Schema[] = await contentSystem.getCollections(context.tenantId);
    const { isMockScanCollection, isBenchmarkRuntime } =
      await import("@src/routes/setup/preset-collections.server");
    const isBenchmark = isBenchmarkRuntime();
    const filtered = all.filter((c) => {
      const id = String(c._id || "");
      const name = typeof c.name === "string" ? c.name : "";
      if (isMockScanCollection(id, name)) return false;
      const idLower = id.toLowerCase();
      const isBenchTestCollection =
        idLower.startsWith("bench_") || idLower.startsWith("test-") || idLower.startsWith("test_");
      return isBenchmark || !isBenchTestCollection;
    });
    const result = filtered.map((col) => ({
      _id: col._id,
      name: col.name,
      slug: col.slug || col.name,
      icon: col.icon || null,
      description: col.description || null,
      fieldCount: (col.fields || []).length,
    }));

    _allCollectionsCache.set(tenantKey, { data: result, ts: Date.now() });
    return result;
  };

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log(
      `[GraphQL Debug] Registered query fields: ${queryFields.map((f) => f.split("(")[0]).join(", ")}`,
    );
  }

  const finalTypeDefs = Array.from(typeDefsSet).join("\n") + collectionSchemas.join("\n");

  return {
    typeDefs: finalTypeDefs,
    queryFields,
    resolvers,
    collections: filtered,
  };
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(
  dbAdapter: DatabaseAdapter,
  _cacheClient: CacheClient | null,
  tenantId?: string | null,
  preRegistered?: { resolvers: any; collections: Schema[] },
) {
  if (!dbAdapter) {
    throw new Error("Database adapter is not initialized");
  }
  const { resolvers, collections } = preRegistered || (await registerCollections(tenantId));

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
        publicationFilter?: string;
        cms?: any;
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

      try {
        let cms = ctx.cms;
        if (!cms) {
          const { LocalCMS } = await import("@src/services/sdk");
          cms = new LocalCMS(dbAdapter);
        }

        const result = await cms.collections.find(collection._id as string, {
          tenantId: ctx.tenantId,
          limit,
          offset: (page - 1) * limit,
          publicationFilter: ctx.publicationFilter || "all",
          user: ctx.user,
        });

        if (!result.success) {
          throw new Error(`Database query failed: ${result.error?.message || "Unknown error"}`);
        }

        const resultArray = (result.data || []) as unknown as DocumentBase[];

        const processedResults = await Promise.all(
          resultArray.map(async (doc) => {
            // Whole-document scan: JSON.stringify once, check for {{ marker.
            // Catches tokens anywhere in the string (start, mid, nested), unlike
            // charCodeAt(0) which only catches leading-brace tokens.
            const docBody = JSON.stringify(doc);
            if (docBody.includes("{{")) {
              const tokenContext: TokenContext = { entry: doc, user: ctx.user };
              for (const key in doc) {
                if (!Object.hasOwn(doc, key)) continue;
                const value = doc[key];
                if (typeof value === "string" && value.includes("{{")) {
                  try {
                    doc[key] = await replaceTokens(value, tokenContext);
                  } catch {
                    /* ignore */
                  }
                }
              }
            }

            // 2. Date Normalization (Optimized: Skip re-parsing if already ISO)
            const c = doc.createdAt as string;
            if (c && typeof c === "string" && c.length >= 20 && c.endsWith("Z")) {
              // Already ISO, skip re-parse
            } else {
              doc.createdAt = c ? new Date(c).toISOString() : new Date().toISOString();
            }

            const u = doc.updatedAt as string;
            if (u && typeof u === "string" && u.length >= 20 && u.endsWith("Z")) {
              // Already ISO, skip re-parse
            } else {
              doc.updatedAt = u ? new Date(u).toISOString() : doc.createdAt;
            }

            return doc;
          }),
        );

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
