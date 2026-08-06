/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 *
 * # Features
 * - Uses GraphQL Yoga for GraphQL API endpoint.
 * - Uses Unified Dispatcher for GraphQL API endpoint.
 * - Uses PubSub for GraphQL API endpoint.
 * - Uses Loaders for GraphQL API endpoint.
 *
 * # Security
 * - Enforces query depth (max 8).
 * - Enforces alias count (max 15).
 * - Blocks schema introspection in production (only during benchmark mode).
 * - Adds validation rules for GraphQL queries.
 */

import type { RequestEvent } from "@sveltejs/kit";

import { createYoga, createSchema } from "graphql-yoga";
import { NoSchemaIntrospectionCustomRule } from "graphql";
import { useGraphQlJit } from "@envelop/graphql-jit";
import {
  responseCache,
  buildGraphQLResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";
import { pubSub } from "@src/services/background/pub-sub";
import { createDepthLimitRule, createMaxAliasesRule } from "./rules";
import { registerCollections, collectionsResolvers } from "./resolvers/collections";
import { analyzeQueryCost, formatCostError } from "./cost-analyzer";

// GraphQL validation plugin: enforces query depth (max 7), alias count (max 15),
// and blocks schema introspection in production environments
const isProduction = process.env.NODE_ENV === "production";

const depthLimitRule = createDepthLimitRule(8);
const maxAliasesRule = createMaxAliasesRule(15);

const securityValidationPlugin = {
  onParse({ params }: any) {
    // Cost-budget queries at parse time — no request.clone() needed
    const query = params?.source || params?.query;
    if (typeof query === "string") {
      const analysis = analyzeQueryCost(query);
      if (!analysis.allowed) {
        throw new AppError(formatCostError(analysis.cost, 1000), 400, "QUERY_TOO_EXPENSIVE");
      }
    }
  },
  onValidate({ addValidationRule }: { addValidationRule: (rule: any) => void }) {
    addValidationRule(depthLimitRule);
    addValidationRule(maxAliasesRule);
    // 🛡️ Explicit introspection block in production (belt-and-suspenders with Yoga's default)
    if (isProduction || process.env.BLOCK_GRAPHQL_INTROSPECTION === "true") {
      addValidationRule(NoSchemaIntrospectionCustomRule);
    }
  },
};
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";
import { seoResolvers, seoTypeDefs } from "./resolvers/seo";
import {
  virtualCollectionsMutationFields,
  virtualCollectionsMutationResolvers,
  virtualCollectionsQueryFields,
  virtualCollectionsResolvers,
  virtualCollectionsTypeDefs,
} from "./resolvers/virtual-collections";
import {
  dataOperationsMutationFields,
  dataOperationsMutationResolvers,
  dataOperationsQueryFields,
  dataOperationsQueryResolvers,
  dataOperationsTypeDefs,
  JSONScalar,
} from "./resolvers/data-operations";
import { createLoaders } from "./loaders";
import { LocalCMS } from "@src/services/sdk";

import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

import { registerPermission } from "@src/databases/auth/permissions";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";

// ---------------------------------------------------------------------------
// Permission Registration
// ---------------------------------------------------------------------------
const accessManagementPermission = {
  _id: "manage-access",
  name: "Manage Access",
  action: PermissionAction.MANAGE,
  type: PermissionType.SYSTEM,
  resource: "access",
  description: "Manage system access and permissions",
};

registerPermission(accessManagementPermission as any);

// ---------------------------------------------------------------------------
// Schema Construction
// ---------------------------------------------------------------------------
async function createGraphQLSchema(dbAdapter: any, tenantId?: string | null) {
  const registered = await registerCollections(tenantId);
  const { typeDefs: collectionTypeDefs, queryFields } = registered;
  const collectionResolversMap = await collectionsResolvers(dbAdapter, null, tenantId, registered);

  const typeDefs = `
    ${userTypeDefs()}
    ${systemTypeDefs}
    ${mediaTypeDefs()}
    ${seoTypeDefs}
    ${collectionTypeDefs}
    ${virtualCollectionsTypeDefs}
    ${dataOperationsTypeDefs}

    type Query {
      _empty: String
      me: User
      users(pagination: PaginationInput): [User]
      mediaImages(pagination: PaginationInput): [MediaImage]
      mediaDocuments(pagination: PaginationInput): [MediaDocument]
      mediaAudio(pagination: PaginationInput): [MediaAudio]
      mediaVideos(pagination: PaginationInput): [MediaVideo]
      mediaRemote(pagination: PaginationInput): [MediaRemote]
      mediaFolders: [MediaFolder]
      ${queryFields.join("\n      ")}
      ${virtualCollectionsQueryFields}
      ${dataOperationsQueryFields}
    }

    input PaginationInput {
      page: Int
      limit: Int
    }

    type Mutation {
      _empty: String
      ${virtualCollectionsMutationFields}
      ${dataOperationsMutationFields}
    }

    type Subscription {
      contentStructureUpdated: String
      entryUpdated: String
      onPing: PingPayload
    }

    type PingPayload {
      timestamp: Float
    }
  `;

  const resolvers = {
    JSON: JSONScalar,
    Query: {
      ...userResolvers(dbAdapter),
      ...systemResolvers.Query,
      ...collectionResolversMap.Query,
      ...mediaResolvers(dbAdapter),
      ...seoResolvers.Query,
      ...virtualCollectionsResolvers(dbAdapter, tenantId),
      ...dataOperationsQueryResolvers(dbAdapter, tenantId),
    },
    Mutation: {
      ...(systemResolvers as any).Mutation,
      ...(collectionResolversMap as any).Mutation,
      ...virtualCollectionsMutationResolvers(dbAdapter, tenantId),
      ...dataOperationsMutationResolvers(dbAdapter, tenantId),
    },
    Subscription: {
      contentStructureUpdated: {
        subscribe: (_: any, __: any, { pubSub }: any) =>
          pubSub.subscribe("contentStructureUpdated"),
        resolve: (payload: any) => payload,
      },
      entryUpdated: {
        subscribe: (_: any, __: any, { pubSub }: any) => pubSub.subscribe("entryUpdated"),
        resolve: (payload: any) => payload,
      },
      onPing: {
        subscribe: (_: any, __: any, { pubSub }: any) => pubSub.subscribe("entryUpdated"),
        resolve: (payload: any) => ({
          timestamp: payload.timestamp || Date.now(),
        }),
      },
    },
  };

  return { typeDefs, resolvers };
}

let yogaAppPromise: Promise<any> | null = null;
let lastSchemaVersion: number | null = null;
let lastDbAdapter: any = null;

export async function _getYogaApp(dbAdapter: any, tenantId?: string | null) {
  const { contentSystem } = await import("@src/content/index.server");
  const currentVersion = contentSystem.version;
  const isBenchmark = process.env.BENCHMARK_MODE === "true" || process.env.BENCHMARK === "true";

  if (
    !yogaAppPromise ||
    lastSchemaVersion !== currentVersion ||
    lastDbAdapter !== dbAdapter ||
    (isBenchmark && lastSchemaVersion === null)
  ) {
    lastSchemaVersion = currentVersion;
    lastDbAdapter = dbAdapter;
    yogaAppPromise = (async () => {
      try {
        const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
        const schema = createSchema({ typeDefs, resolvers });

        const plugins: any[] = [securityValidationPlugin, useGraphQlJit()];

        const app = createYoga({
          schema: schema as any,
          graphqlEndpoint: "/api/graphql",
          landingPage: true,
          cors: false,
          batching: { limit: 10 },
          plugins,
          context: async (serverContext: any) => {
            let _loaders: any = undefined;
            return {
              user: serverContext.user,
              tenantId: serverContext.tenantId,
              dbAdapter: serverContext.dbAdapter,
              cms: serverContext.cms,
              pubSub,
              get loaders() {
                if (_loaders === undefined) {
                  _loaders = serverContext.loaders;
                }
                return _loaders;
              },
              set loaders(value) {
                _loaders = value;
              },
              publicationFilter: serverContext.publicationFilter || "all",
            };
          },
        });

        return app;
      } catch (err: any) {
        yogaAppPromise = null;
        throw err;
      }
    })();
  }
  return yogaAppPromise;
}

export async function _refreshSchema(dbAdapter: any, tenantId?: string | null) {
  lastSchemaVersion = -1;
  return await _getYogaApp(dbAdapter, tenantId);
}

let sharedCMS: LocalCMS | null = null;

async function handleRequest(event: RequestEvent) {
  const { locals, request } = event;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  const url = new URL(request.url);
  const publicationFilterParam = url.searchParams.get("publicationFilter");
  const publicationFilterHeader = request.headers.get("x-publication-filter");
  const publicationFilter = (publicationFilterParam || publicationFilterHeader || "all") as
    | "published"
    | "draft"
    | "all";

  let query = "";
  let variables: any = {};
  let isQuery = true;
  let bodyText = "";

  if (request.method === "POST") {
    bodyText = await request.text().catch(() => "");
    try {
      const body = JSON.parse(bodyText);
      query = body?.query || "";
      variables = body?.variables || {};
    } catch {}
  } else if (request.method === "GET") {
    query = url.searchParams.get("query") || "";
    const varsParam = url.searchParams.get("variables");
    if (varsParam) {
      try {
        variables = JSON.parse(varsParam);
      } catch {}
    }
  }

  if (query && (/\bmutation\b/i.test(query) || /\bsubscription\b/i.test(query))) {
    isQuery = false;
  }

  const userId = locals.user?._id || locals.user?.id || null;
  const cacheKey =
    isQuery && query
      ? buildGraphQLResponseCacheKey(query, variables, publicationFilter, userId)
      : null;

  // 🚀 FAST-PATH: Return cached response immediately before content/DB/Yoga setup
  if (cacheKey) {
    const cached = responseCache.get(cacheKey, locals.tenantId as string);
    if (cached?.body) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ETag: cached.etag,
          "X-Cache": "HIT",
        },
      });
    }
  }

  // ── CACHE MISS PATH: Load content system, DB adapter & Yoga app ──
  const { contentSystem } = await import("@src/content/index.server");
  await contentSystem.waitForReload();

  let adapter = locals.dbAdapter;
  if (!adapter || (typeof adapter.isConnected === "function" && !adapter.isConnected())) {
    const { isDbConnected, getDbInitPromise, getDb } = await import("@src/databases/db");
    if (!isDbConnected()) {
      await getDbInitPromise();
    }
    adapter = getDb();
  }

  if (!adapter) {
    throw new AppError("Database unavailable: Adapter not initialized", 503);
  }

  if (!sharedCMS || sharedCMS.db !== adapter) {
    sharedCMS = new LocalCMS(adapter);
  }
  const cms = sharedCMS;
  let _loaders: any = null;

  try {
    const yogaRequest =
      request.method === "POST"
        ? new Request(request.url, { method: "POST", headers: request.headers, body: bodyText })
        : request;

    const yogaApp = await _getYogaApp(adapter, locals.tenantId);
    const yogaResponse = await yogaApp.handleRequest(yogaRequest, {
      user: locals.user,
      tenantId: locals.tenantId,
      dbAdapter: adapter,
      cms,
      get loaders() {
        if (!_loaders) {
          _loaders = createLoaders(adapter, (locals.tenantId as any) || null, publicationFilter);
        }
        return _loaders;
      },
      set loaders(value) {
        _loaders = value;
      },
      publicationFilter,
    });

    const responseBody = await yogaResponse.text();

    // 🛡️ Do not cache error-shaped responses or empty collection arrays
    if (cacheKey && yogaResponse.status === 200) {
      try {
        const parsedBody = JSON.parse(responseBody);
        const hasErrors =
          parsedBody?.errors && Array.isArray(parsedBody.errors) && parsedBody.errors.length > 0;
        const isEmptyCollectionData =
          parsedBody?.data &&
          typeof parsedBody.data === "object" &&
          Object.values(parsedBody.data).some((val) => Array.isArray(val) && val.length === 0);

        if (!hasErrors && !isEmptyCollectionData) {
          const etag = generateContentEtag(responseBody);
          responseCache.set(
            cacheKey,
            { body: responseBody, etag },
            60_000,
            locals.tenantId as string,
          );
        }
      } catch {}
    }

    return new Response(responseBody, {
      status: yogaResponse.status,
      statusText: yogaResponse.statusText,
      headers: yogaResponse.headers,
    });
  } catch (err: any) {
    logger.error("GraphQL Request Error:", err);
    return new Response(
      JSON.stringify({
        errors: [{ message: err.message }],
      }),
      {
        status: err.status || 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const GET = apiHandler(handleRequest);
export const POST = apiHandler(handleRequest);
