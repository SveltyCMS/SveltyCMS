/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 */

import type { RequestEvent } from "@sveltejs/kit";

import { createYoga, createSchema } from "graphql-yoga";
import { pubSub } from "@src/services/background/pub-sub";
import { createDepthLimitRule, createMaxAliasesRule } from "./rules";
import { registerCollections, collectionsResolvers } from "./resolvers/collections";

// GraphQL validation plugin: enforces query depth (max 7) and alias count (max 15)
const securityValidationPlugin = {
  onValidate({ addValidationRule }: { addValidationRule: (rule: any) => void }) {
    addValidationRule(createDepthLimitRule(7));
    addValidationRule(createMaxAliasesRule(15));
  },
};
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";
import { seoResolvers, seoTypeDefs } from "./resolvers/seo";
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
    }

    input PaginationInput {
      page: Int
      limit: Int
    }

    type Mutation {
      _empty: String
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
    Query: {
      ...userResolvers(dbAdapter),
      ...systemResolvers.Query,
      ...collectionResolversMap.Query,
      ...mediaResolvers(dbAdapter),
      ...seoResolvers.Query,
    },
    Mutation: {
      ...(systemResolvers as any).Mutation,
      ...(collectionResolversMap as any).Mutation,
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

        const plugins: any[] = [securityValidationPlugin];
        if (process.env.USE_GRAPHQL_JIT === "true" || process.env.BENCHMARK === "true") {
          const { useGraphQlJit } = await import("@envelop/graphql-jit");
          plugins.push(useGraphQlJit());
        }

        const app = createYoga({
          schema: schema as any,
          graphqlEndpoint: "/api/graphql",
          landingPage: true,
          cors: false,
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

  const { contentSystem } = await import("@src/content/index.server");
  await contentSystem.waitForReload();

  let adapter = locals.dbAdapter;
  // 🚀 HARDENING: If adapter is missing or disconnected (e.g. after reinitialize), refresh it
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

  const url = new URL(request.url);
  const publicationFilterParam = url.searchParams.get("publicationFilter");
  const publicationFilterHeader = request.headers.get("x-publication-filter");
  const publicationFilter = (publicationFilterParam || publicationFilterHeader || "all") as
    | "published"
    | "draft"
    | "all";

  let _loaders: any = null;

  try {
    const yogaApp = await _getYogaApp(adapter, locals.tenantId);
    const yogaResponse = await yogaApp.handleRequest(request, {
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

    return new Response(yogaResponse.body, {
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
