/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API endpoint using GraphQL Yoga + Unified Dispatcher.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { building } from "$app/environment";

import { createYoga, createSchema } from "graphql-yoga";
import { useGraphQlJit } from "@envelop/graphql-jit";
import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";

import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { pubSub } from "@src/services/pub-sub";
import { getPrivateSettingSync } from "@src/services/settings-service";

import { widgets } from "@src/stores/widget-store.svelte.ts";

import {
  collectionsResolvers,
  registerCollections,
  createCleanTypeName,
} from "./resolvers/collections";
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";

import { hasPermissionWithRoles, registerPermission } from "@src/databases/auth/permissions";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";

// ---------------------------------------------------------------------------
// Permission Registration
// ---------------------------------------------------------------------------
const accessManagementPermission = {
  _id: "config:accessManagement" as any,
  contextId: "config/accessManagement",
  name: "Access Management",
  action: PermissionAction.MANAGE,
  contextType: PermissionType.CONFIGURATION,
  type: PermissionType.CONFIGURATION,
  description: "Allows management of user access and permissions",
};

if (!building) {
  registerPermission(accessManagementPermission);
}

// ---------------------------------------------------------------------------
// Cache Client for Resolvers (GraphQL namespace)
// ---------------------------------------------------------------------------
const cacheClient = getPrivateSettingSync("USE_REDIS")
  ? {
      get: async (key: string, tenantId?: string | null) =>
        cacheService.get<string>(`graphql:${key}`, tenantId).catch(() => null),
      set: async (
        key: string,
        value: string,
        _ex: string,
        duration: number,
        tenantId?: string | null,
      ) =>
        cacheService
          .set(`graphql:${key}`, value, duration, tenantId, CacheCategory.API)
          .catch(() => {}),
    }
  : null;

// ---------------------------------------------------------------------------
// Schema & Yoga Creation (Lazy + Cached)
// ---------------------------------------------------------------------------
let yogaAppPromise: Promise<ReturnType<typeof createYoga<any, any>>> | null = null;

async function createGraphQLSchema(dbAdapter: any, tenantId?: string | null) {
  console.log("[GraphQL] Starting schema generation...");
  if (!widgets.isLoaded) {
    console.log("[GraphQL] Initializing widgets...");
    await widgets.initialize(tenantId ?? undefined, dbAdapter);
    console.log("[GraphQL] Widgets initialized.");
  }

  console.log("[GraphQL] Registering collections...");
  const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);
  console.log("[GraphQL] Collections registered.");

  const collectionsArray = Array.isArray(collections)
    ? collections
    : Object.values(collections || {});

  const typeDefs = `
    scalar JSON

    input PaginationInput {
      page: Int = 1
      limit: Int = 50
    }

    ${collectionsTypeDefs}
    ${userTypeDefs()}
    ${mediaTypeDefs()}
    ${systemTypeDefs}

    type ContentUpdateEvent {
      version: Int!
      timestamp: String!
      affectedCollections: [String!]!
      changeType: String!
    }

    type EntryUpdateEvent {
      collection: String!
      id: String!
      action: String!
      data: JSON
      timestamp: String!
    }

    type Subscription {
      contentStructureUpdated: ContentUpdateEvent!
      entryUpdated(collection: String, id: String): EntryUpdateEvent!
    }

    type AccessManagementPermission {
      contextId: String!
      name: String!
      action: String!
      contextType: String!
      description: String
    }

    type Query {
      ${collectionsArray
        .filter((c: any) => c?.name)
        .map(
          (c: any) =>
            `${createCleanTypeName(c)}(pagination: PaginationInput): [${createCleanTypeName(c)}]`,
        )
        .join("\n")}
      users(pagination: PaginationInput): [User]
      me: User
      mediaImages(pagination: PaginationInput): [MediaImage]
      mediaDocuments(pagination: PaginationInput): [MediaDocument]
      mediaAudio(pagination: PaginationInput): [MediaAudio]
      mediaVideos(pagination: PaginationInput): [MediaVideo]
      mediaRemote(pagination: PaginationInput): [MediaRemote]
      accessManagementPermission: AccessManagementPermission

      # System queries
      collectionStats(collectionId: String!): CollectionStats
      allCollectionStats: [CollectionStats!]
      navigationStructure(options: NavigationOptions): [NavigationNode]
      nodeChildren(nodeId: String!): [NavigationNode]
      breadcrumb(path: String!): [BreadcrumbItem]
      contentSystemHealth: contentSystemHealth
      contentSystemDiagnostics: contentSystemDiagnostics
      contentSystemMetrics: contentSystemMetrics
      validateContentStructure: StructureValidation
    }
  `;

  console.log("[GraphQL] Building resolvers...");
  const collectionsResolversObj = await collectionsResolvers(dbAdapter, cacheClient, tenantId);
  console.log("[GraphQL] Resolvers built.");

  const resolvers = {
    Query: {
      ...collectionsResolversObj.Query,
      ...userResolvers(dbAdapter),
      ...mediaResolvers(dbAdapter),
      ...systemResolvers.Query,
      accessManagementPermission: async (_: any, __: any, context: any) => {
        const { user, locals } = context;
        if (!user) throw new Error("Unauthorized");
        const hasAccess = hasPermissionWithRoles(
          user,
          "config:accessManagement",
          locals?.roles || [],
        );
        if (!hasAccess) throw new Error("Forbidden");
        return accessManagementPermission;
      },
    },
    ...Object.fromEntries(Object.entries(collectionsResolversObj).filter(([k]) => k !== "Query")),
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

async function getYogaApp(dbAdapter: any, tenantId?: string | null) {
  if (!yogaAppPromise) {
    console.log("[GraphQL] Creating Yoga Application instance...");
    yogaAppPromise = (async () => {
      try {
        const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
        console.log("[GraphQL] Schema created, building Yoga app...");
        const schema = createSchema({ typeDefs, resolvers });

        return createYoga({
          schema: schema as any,
          graphqlEndpoint: "/api/graphql",
          landingPage: true,
          cors: false,
          graphiql: { subscriptionsProtocol: "WS" },
          plugins: process.env.USE_GRAPHQL_JIT === "true" ? [useGraphQlJit()] : [],
          context: async ({ request }: { request: Request }) => ({
            // Pull from SvelteKit locals via the wrapped request
            user: (request as any).contextData?.user,
            tenantId: (request as any).contextData?.tenantId,
            dbAdapter: (request as any).contextData?.dbAdapter,
            pubSub,
          }),
        });
      } catch (err) {
        logger.error("[GraphQL] Yoga Init Error:", err);
        throw err;
      }
    })();
  }
  return yogaAppPromise;
}

// ---------------------------------------------------------------------------
// WebSocket Server (Subscriptions) - Separate Port
// ---------------------------------------------------------------------------
const globalWithWs = globalThis as any;
let wsServerInitialized = false;

async function initializeWebSocketServer(dbAdapter: any, tenantId?: string | null) {
  if (wsServerInitialized || building || globalWithWs.__SVELTY_GRAPHQL_WS__) return;

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
// Main Handler (Wrapped by Unified apiHandler)
// ---------------------------------------------------------------------------
const handler = apiHandler(async (event: RequestEvent) => {
  const { locals, request } = event;

  if (!locals.user) {
    throw new AppError("Unauthorized: Login required for GraphQL", 401);
  }

  let adapter = locals.dbAdapter;

  if (!adapter) {
    const { getDb } = await import("@src/databases/db");
    adapter = getDb();
  }

  if (!adapter) {
    throw new AppError("Database unavailable: Adapter not initialized", 503);
  }

  try {
    const yogaApp = await getYogaApp(adapter, locals.tenantId);

    // Lazy WS init (fire-and-forget)
    if (!wsServerInitialized) {
      void initializeWebSocketServer(adapter, locals.tenantId);
    }

    // Prepare compatible Request for Yoga
    const compatibleRequest = new Request(request.url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" ? request.body : undefined,
      ...({ duplex: "half" } as any),
    });

    // Attach context data
    (compatibleRequest as any).contextData = {
      user: locals.user,
      tenantId: locals.tenantId,
      dbAdapter: adapter,
    };

    const yogaResponse = await yogaApp.handleRequest(compatibleRequest, event);

    return new Response(await yogaResponse.arrayBuffer(), {
      status: yogaResponse.status,
      statusText: yogaResponse.statusText,
      headers: yogaResponse.headers,
    });
  } catch (error) {
    logger.error("GraphQL handler error", error);
    if (error instanceof AppError) throw error;
    throw new AppError("GraphQL request failed", 500);
  }
});

export { handler as GET, handler as POST };
