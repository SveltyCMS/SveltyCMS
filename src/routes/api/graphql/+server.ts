/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API setup and request handler for the CMS.
 *
 * This module sets up the GraphQL schema and resolvers, including:
 * - Collection-specific schemas and resolvers, scoped to the current tenant
 * - User-related schemas and resolvers
 * - Media-related schemas and resolvers
 * - Access management permission definition and checking
 * - GraphQL Subscriptions for real-time updates (WebSocket)
 * - Optimized Cache Client wrapping CacheService
 */

import { CacheCategory } from "@src/databases/cache/types";
// GraphQL Yoga
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
import type { RequestEvent } from "@sveltejs/kit";
import { building } from "$app/environment";

// Create a cache client adapter compatible with the expected interface in resolvers
const cacheClient = getPrivateSettingSync("USE_REDIS")
  ? {
      get: async (key: string, tenantId?: string | null) => {
        try {
          // Namespace GraphQL caches and include tenant when provided
          return await cacheService.get<string>(`graphql:${key}`, tenantId);
        } catch (err) {
          logger.debug("GraphQL cache get failed, continuing without cache", err);
          return null;
        }
      },
      set: async (
        key: string,
        value: string,
        _ex: string,
        duration: number,
        tenantId?: string | null,
      ) => {
        try {
          // Ignore 'EX' (Generic wrapper) and use duration directly
          // Namespace GraphQL caches
          await cacheService.set(`graphql:${key}`, value, duration, tenantId, CacheCategory.API);
        } catch (err) {
          logger.debug("GraphQL cache set failed, continuing without cache", err);
        }
      },
    }
  : null;

// Auth / Permission
import { hasPermissionWithRoles, registerPermission } from "@src/databases/auth/permissions";
import { PermissionAction, PermissionType, type Role, type User } from "@src/databases/auth/types";
// Unified Cache Service
import { cacheService } from "@src/databases/cache/cache-service";
// Import shared PubSub instance
import { pubSub } from "@src/services/pub-sub";
// Widget Store - ensure widgets are loaded before GraphQL setup
import { widgets } from "@src/stores/widget-store.svelte.ts";
// System Logger
import { logger } from "@utils/logger.server";
import { useServer } from "graphql-ws/use/ws";
import { createSchema, createYoga } from "graphql-yoga";
import { useGraphQlJit } from "@envelop/graphql-jit";
// GraphQL Subscriptions
import { WebSocketServer } from "ws";
import { NoSchemaIntrospectionCustomRule } from "graphql";
import { dev } from "$app/environment";

import { createLoaders } from "./loaders";
import { createDepthLimitRule, createMaxAliasesRule } from "./rules";
import { collectionsResolvers, registerCollections } from "./resolvers/collections";
import { createCleanTypeName } from "@utils/utils";
import { mediaResolvers, mediaTypeDefs } from "./resolvers/media";
import { systemResolvers, systemTypeDefs } from "./resolvers/system";
import { userResolvers, userTypeDefs } from "./resolvers/users";

// Removed local createPubSub() call
// const pubSub = createPubSub();

// Define the access management permission configuration
const accessManagementPermission = {
  _id: "config:accessManagement" as DatabaseId,
  contextId: "config/accessManagement",
  name: "Access Management",
  action: PermissionAction.MANAGE,
  contextType: PermissionType.CONFIGURATION,
  type: PermissionType.CONFIGURATION,
  description: "Allows management of user access and permissions",
};

// Register the permission
if (!building) {
  registerPermission(accessManagementPermission);
}

// Create a cache client adapter compatible with the expected interface in resolvers
// WRAPPER: Maps generic get/set to CacheService with 'graphql' namespace prefix
// NOTE: Resolvers should append specific keys. This ensures separation.
// Cache client created above

// Setup GraphQL schema and resolvers
async function createGraphQLSchema(dbAdapter: DatabaseAdapter, tenantId?: string | null) {
  // Ensure widgets are loaded before proceeding
  if (!widgets.isLoaded) {
    logger.debug("Widgets not loaded yet, initializing...");
    // Pass dbAdapter to load active widgets from DB
    await widgets.initialize(tenantId ?? undefined, dbAdapter);
  }

  const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);

  // Ensure collections is properly formatted
  const collectionsArray = (
    Array.isArray(collections) ? collections : Object.values(collections || {})
  ) as Array<{
    _id?: string;
    name?: string;
  }>;

  const typeDefs = `
		input PaginationInput {
			page: Int = 1
			limit: Int = 50
		}

		scalar JSON

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
        .filter((collection) => collection?.name && collection._id)
        .map(
          (collection) =>
            `${createCleanTypeName(collection)}(pagination: PaginationInput): [${createCleanTypeName(collection)}]`,
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

			# System Queries
			collectionStats(collectionId: String!): CollectionStats
			allCollectionStats: [CollectionStats!]
			navigationStructure(options: NavigationOptions): [NavigationNode]
			nodeChildren(nodeId: String!): [NavigationNode]
			breadcrumb(path: String!): [BreadcrumbItem]
			contentManagerHealth: ContentManagerHealth
			contentManagerDiagnostics: ContentManagerDiagnostics
			contentManagerMetrics: ContentManagerMetrics
			validateContentStructure: StructureValidation
		}
	`;

  const collectionsResolversObj = await collectionsResolvers(dbAdapter, cacheClient, tenantId);

  const resolvers = {
    Query: {
      ...collectionsResolversObj.Query,
      ...userResolvers(dbAdapter),
      ...mediaResolvers(dbAdapter),
      ...systemResolvers.Query,
      accessManagementPermission: async (
        _: unknown,
        __: unknown,
        context: { user?: User; locals?: { roles?: Role[] } },
      ) => {
        const { user } = context;
        if (!user) {
          throw new Error("Unauthorized: No user in context");
        }
        const userHasPermission = hasPermissionWithRoles(
          user,
          "config:accessManagement",
          context.locals?.roles || [],
        );
        if (!userHasPermission) {
          throw new Error("Forbidden: Insufficient permissions");
        }
        return accessManagementPermission;
      },
    },
    ...Object.keys(collectionsResolversObj)
      .filter((key) => key !== "Query")
      .reduce(
        (acc, key) => {
          acc[key] = collectionsResolversObj[key];
          return acc;
        },
        {} as Record<string, Record<string, unknown>>,
      ),
    Subscription: {
      contentStructureUpdated: {
        subscribe: (_: unknown, __: unknown, context: { pubSub: any }) => {
          return context.pubSub.subscribe("contentStructureUpdated");
        },
        resolve: (payload: unknown) => payload,
      },
      entryUpdated: {
        subscribe: (
          _: unknown,
          _args: { collection?: string; id?: string },
          context: { pubSub: any },
        ) => {
          // Subscribe to all updates
          // In a real app, you might want to filter by collection/id here if the PubSub supports it,
          // or filter in the resolver. For simplest implementation: subscribe to channel, modify payload in resolve?
          // Actually, graphql-yoga pubsub is simple.
          // We can just subscribe to the channel 'entryUpdated'.
          const iterator = context.pubSub.subscribe("entryUpdated");
          // We can filter in the resolver or using pipe/filter on iterator if needed.
          // But standard pattern: client receives event and checks if it matches.
          return iterator;
        },
        resolve: (payload: unknown) => payload,
      },
    },
  };

  // Return raw typeDefs/resolvers; Yoga and WS server will build schemas as needed
  return { typeDefs, resolvers };
}

async function setupGraphQL(dbAdapter: DatabaseAdapter, tenantId?: string | null) {
  try {
    const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);

    // Create GraphQL Yoga app; let Yoga manage the schema from typeDefs/resolvers
    const yogaApp = createYoga({
      graphqlEndpoint: "/api/graphql",
      landingPage: true,
      plugins: [useGraphQlJit()],
      cors: false,
      graphiql: {
        subscriptionsProtocol: "WS",
      },
      parserAndValidationCache: true,
      // @ts-expect-error Yoga server options type mismatch
      validationRules: [
        createDepthLimitRule(8),
        createMaxAliasesRule(15),
        ...(dev ? [] : [NoSchemaIntrospectionCustomRule]),
      ],
      schema: createSchema({ typeDefs, resolvers }),
      context: async ({ request }) => {
        // Extract the context from the request if it was passed
        const contextData = (
          request as Request & {
            contextData?: {
              user: unknown;
              dbAdapter?: DatabaseAdapter;
              tenantId?: string | null;
              bypassTenantIsolation?: boolean;
            };
          }
        ).contextData;
        const loaders = createLoaders(
          contextData?.dbAdapter as DatabaseAdapter,
          contextData?.tenantId ?? null,
        );

        return {
          user: contextData?.user,
          dbAdapter: contextData?.dbAdapter,
          tenantId: contextData?.tenantId,
          bypassTenantIsolation: contextData?.bypassTenantIsolation,
          locale: request.headers.get("accept-language")?.split(",")[0]?.trim().slice(0, 2) || "en", // Simple locale extraction
          pubSub,
          loaders,
        };
      },
    });

    logger.info("GraphQL setup completed successfully");
    return yogaApp;
  } catch (error) {
    logger.error("Error setting up GraphQL:", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      tenantId,
    });
    throw error;
  }
}

// Store Yoga apps per tenant to prevent schema leakage
const yogaApps = new Map<string, Promise<ReturnType<typeof createYoga<any, any>>>>();
let wsInitPromise: Promise<void> | null = null;
let wsServerInitialized = false;

// Store global instance to prevent HMR EADDRINUSE errors
const globalWithWs = globalThis as typeof globalThis & {
  __SVELTY_GRAPHQL_WS__?: WebSocketServer;
};

// NOTE: This is a workaround for SvelteKit not exposing the HTTP server instance.
// We create a standalone WebSocket server on a different port.
// In a production environment, you would ideally integrate this with your main HTTP server.
async function initializeWebSocketServer(dbAdapter: DatabaseAdapter, tenantId?: string | null) {
  if (globalWithWs.__SVELTY_GRAPHQL_WS__ || wsServerInitialized || building) {
    return;
  }

  if (wsInitPromise) return wsInitPromise;

  wsInitPromise = (async () => {
    try {
      // Re-check state after entering the promise chain
      if (globalWithWs.__SVELTY_GRAPHQL_WS__ || wsServerInitialized) return;

      const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
      const schema = createSchema({ typeDefs, resolvers });

      const wsServer = new WebSocketServer({
        port: 3001,
        path: "/api/graphql",
      });

      globalWithWs.__SVELTY_GRAPHQL_WS__ = wsServer;

      useServer(
        {
          schema,
          context: async (ctx) => {
            // Extract authentication from connection params
            const connectionParams = ctx.connectionParams as
              | {
                  authorization?: string;
                  sessionId?: string;
                  cookie?: string;
                }
              | undefined;

            let user: any = null;

            // Try multiple authentication methods
            if (connectionParams) {
              try {
                // Method 1: Bearer token (for API tokens)
                if (connectionParams.authorization) {
                  const token = connectionParams.authorization.replace(/^Bearer\s+/i, "");
                  const tokenValidation = await dbAdapter.auth.validateToken(
                    token,
                    undefined,
                    "access",
                    { tenantId: tenantId as DatabaseId },
                  );

                  if (tokenValidation?.success) {
                    const tokenData = await dbAdapter.auth.getTokenByValue(token, {
                      tenantId: tenantId as DatabaseId,
                    });
                    if (tokenData?.success && tokenData.data) {
                      const userResult = await dbAdapter.auth.getUserById(tokenData.data.user_id, {
                        tenantId: tenantId as DatabaseId,
                      });
                      if (userResult?.success) {
                        user = userResult.data;
                        logger.info("WebSocket: User authenticated via token", {
                          userId: user?._id,
                        });
                      }
                    }
                  }
                }
              } catch (error) {
                logger.error("WebSocket authentication error:", {
                  error: error instanceof Error ? error.message : "Unknown error",
                });
              }
            }

            return {
              user,
              pubSub,
              tenantId,
            };
          },
        },
        wsServer,
      );

      wsServerInitialized = true;
      logger.info("GraphQL WebSocket Server initialized on port 3001");
    } catch (error) {
      logger.error("Failed to initialize WebSocket server:", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      wsInitPromise = null; // Allow retry on failure
    }
  })();

  return wsInitPromise;
}

// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

const handler = apiHandler(async (event: RequestEvent) => {
  const { locals, request } = event;

  // Authentication is handled by hooks.server.ts
  if (!locals.user) {
    throw new AppError(
      "Unauthorized: You must be logged in to access the GraphQL endpoint.",
      401,
      "UNAUTHORIZED",
    );
  }

  // Check if database adapter is available
  if (!locals.dbAdapter) {
    throw new AppError(
      "Service Unavailable: Database service is not available.",
      503,
      "DB_UNAVAILABLE",
    );
  }

  try {
    const tenantId = locals.tenantId || "system";

    // Initialize/Get Yoga app for this specific tenant
    if (!yogaApps.has(tenantId)) {
      logger.debug(`Initializing GraphQL Yoga app for tenant: ${tenantId}`);
      yogaApps.set(tenantId, setupGraphQL(locals.dbAdapter, locals.tenantId));
    }

    const yogaApp = await yogaApps.get(tenantId);
    if (!yogaApp) {
      throw new AppError("GraphQL Yoga app failed to initialize", 500, "GRAPHQL_INIT_FAILED");
    }

    // Initialize WebSocket server (global for now, but with tenant context)
    if (!wsServerInitialized) {
      logger.debug("Initializing WebSocket server");
      void initializeWebSocketServer(locals.dbAdapter, locals.tenantId);
    }

    // Create a compatible Request object for GraphQL Yoga
    // The issue is that SvelteKit's request.url is a URL object, but GraphQL Yoga expects a string
    const requestInit: RequestInit = {
      method: request.method,
      headers: request.headers,
    };

    // Only add body for non-GET requests
    if (request.method !== "GET" && request.body) {
      requestInit.body = request.body;
      // 'duplex' is required for streaming bodies but not in RequestInit type
      // Assign duplex property for streaming bodies (Node.js fetch polyfill)
      (requestInit as RequestInit & { duplex?: string }).duplex = "half";
    }
    const compatibleRequest = new Request(request.url.toString(), requestInit);

    // Add context data to the request object for GraphQL Yoga
    (
      compatibleRequest as Request & {
        contextData?: {
          user: unknown;
          dbAdapter: DatabaseAdapter;
          tenantId?: string | null;
          bypassTenantIsolation?: boolean;
        };
      }
    ).contextData = {
      user: locals.user,
      dbAdapter: locals.dbAdapter,
      tenantId: locals.tenantId,
      bypassTenantIsolation: locals.isAdmin === true,
    };

    // Use GraphQL Yoga's handleRequest method
    const yogaResponse = await yogaApp.handleRequest(compatibleRequest, {
      user: locals.user,
      tenantId: locals.tenantId,
    });

    if (!yogaResponse) {
      throw new AppError("GraphQL Yoga returned no response", 500, "GRAPHQL_NO_RESPONSE");
    }

    // Return a SvelteKit-compatible Response that supports streaming (for @defer and SSE)
    return new Response(yogaResponse.body, {
      status: yogaResponse.status,
      statusText: yogaResponse.statusText,
      headers: yogaResponse.headers,
    });
  } catch (error) {
    logger.error("Error handling GraphQL request:", {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      tenantId: locals.tenantId,
    });

    if (error instanceof AppError) throw error;
    throw new AppError(
      "An error occurred while processing your GraphQL request.",
      500,
      "GRAPHQL_ERROR",
    );
  }
});

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
