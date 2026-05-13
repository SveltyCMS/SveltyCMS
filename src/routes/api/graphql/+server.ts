/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { building } from "$app/environment";

import { createYoga, createSchema } from "graphql-yoga";
import { useGraphQlJit } from "@envelop/graphql-jit";
import { pubSub } from "@src/services/background/pub-sub";
import { contentSystem } from "@src/content/index.server";
import { registerCollections, collectionsResolvers } from "./resolvers/collections";
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";
import { seoResolvers, seoTypeDefs } from "./resolvers/seo";
import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";

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
  // We need to fetch the dynamic schemas which includes their types and queries
  const { typeDefs: collectionTypeDefs, queryFields } = await registerCollections(tenantId);
  const collectionResolversMap = await collectionsResolvers(dbAdapter, null, tenantId);

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
    },
  };

  return { typeDefs, resolvers };
}

let yogaAppPromise: Promise<any> | null = null;
let lastSchemaVersion: number | null = null;

async function getYogaApp(dbAdapter: any, tenantId?: string | null) {
  const currentVersion = contentSystem.version;

  if (!yogaAppPromise || lastSchemaVersion !== currentVersion) {
    if (lastSchemaVersion !== null) {
      console.error(
        `[GraphQL] Version change detected: ${lastSchemaVersion} -> ${currentVersion}. Rebuilding schema...`,
      );
    }
    lastSchemaVersion = currentVersion;
    yogaAppPromise = (async () => {
      try {
        const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
        if (!typeDefs) throw new Error("GraphQL typeDefs are empty");

        const schema = createSchema({ typeDefs, resolvers });

        return createYoga({
          schema: schema as any,
          graphqlEndpoint: "/api/graphql",
          landingPage: true,
          cors: false,
          graphiql: { subscriptionsProtocol: "WS" },
          plugins:
            process.env.USE_GRAPHQL_JIT === "true" || process.env.BENCHMARK === "true"
              ? [useGraphQlJit()]
              : [],
          context: async (serverContext: any) => ({
            // Pull from SvelteKit locals passed via serverContext
            user: serverContext.user,
            tenantId: serverContext.tenantId,
            dbAdapter: serverContext.dbAdapter,
            cms: serverContext.cms,
            pubSub,
          }),
        });
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : "";
        logger.error(`[GraphQL] Yoga Init Error: ${msg}`, { stack });
        if (process.env.BENCHMARK_DEBUG === "true") {
          console.error(`[GraphQL] Schema build failed: ${msg}`);
          if (stack) console.error(stack);
        }
        yogaAppPromise = null;
        throw err;
      }
    })();
  }
  return yogaAppPromise;
}

// ---------------------------------------------------------------------------
// WebSocket Server Initialization
// ---------------------------------------------------------------------------
const globalWithWs = globalThis as any;
let wsServerInitialized = false;

async function initializeWebSocketServer(dbAdapter: any, tenantId?: string | null) {
  if (
    wsServerInitialized ||
    building ||
    globalWithWs.__SVELTY_GRAPHQL_WS__ ||
    process.env.BUN_TEST_MOCKS === "false" ||
    process.env.SKIP_GRAPHQL_WS === "true"
  )
    return;

  try {
    const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
    const schema = createSchema({ typeDefs, resolvers });

    const wsServer = new WebSocketServer({ port: 3001, path: "/api/graphql" });
    globalWithWs.__SVELTY_GRAPHQL_WS__ = wsServer;

    useServer(
      {
        schema,
        context: async (_ctx) => {
          // Add your WS auth logic here (token from connectionParams)
          return { pubSub, tenantId };
        },
      },
      wsServer,
    );

    wsServerInitialized = true;
    logger.info("GraphQL WebSocket Server running on ws://localhost:3001/api/graphql");
  } catch (err) {
    logger.error("Failed to start GraphQL WS server", err);
  }
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------
import { LocalCMS } from "@src/services/sdk";

async function handleRequest(event: RequestEvent) {
  const { locals, request } = event;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  // 🛡️ Gating: Wait for any pending content reloads (especially on SQLite during benchmarks)
  await contentSystem.waitForReload();

  if (contentSystem.isReloading) {
    return new Response(
      JSON.stringify({ errors: [{ message: "CMS is currently reloading. Please retry." }] }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let adapter = locals.dbAdapter;

  if (!adapter) {
    const { getDb } = await import("@src/databases/db");
    adapter = getDb();
  }

  if (!adapter) {
    throw new AppError("Database unavailable: Adapter not initialized", 503);
  }

  // 🚀 PERFORMANCE: Reuse CMS instance to prevent object churn
  if (!(locals as any).sharedCMS || (locals as any).sharedCMS.db !== adapter) {
    (locals as any).sharedCMS = new LocalCMS(adapter);
  }
  const cms = (locals as any).sharedCMS;

  try {
    const yogaApp = await getYogaApp(adapter, locals.tenantId);
    if (!yogaApp) {
      throw new AppError(
        "GraphQL Yoga is currently unavailable (initialization failed)",
        503,
        "GRAPHQL_UNAVAILABLE",
      );
    }

    // Lazy WS init (fire-and-forget)
    if (!wsServerInitialized) {
      initializeWebSocketServer(adapter, locals.tenantId).catch((err) => {
        logger.error("Lazy GraphQL WS initialization failed:", err);
      });
    }

    const yogaResponse = await yogaApp.handleRequest(request, {
      user: locals.user,
      tenantId: locals.tenantId,
      dbAdapter: adapter,
      cms,
    });

    return new Response(yogaResponse.body, {
      status: yogaResponse.status,
      statusText: yogaResponse.statusText,
      headers: yogaResponse.headers,
    });
  } catch (err: any) {
    console.error("GraphQL Request Error STACK:", err.stack || err);
    logger.error("GraphQL Request Error:", err);
    return new Response(JSON.stringify({ errors: [{ message: err.message }] }), {
      status: err.status || 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const GET = apiHandler(handleRequest);
export const POST = apiHandler(handleRequest);
