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

import { CacheCategory } from '@shared/database/CacheCategory';

import { building } from '$app/environment';
import { getPrivateSettingSync } from '@shared/services/settingsService';
import type { RequestEvent } from '@sveltejs/kit';

// GraphQL Yoga
import type { DatabaseAdapter, DatabaseId } from '@shared/database/dbInterface';

// Create a cache client adapter compatible with the expected interface in resolvers
const cacheClient = getPrivateSettingSync('USE_REDIS')
	? {
			get: async (key: string, tenantId?: string) => {
				try {
					// Namespace GraphQL caches and include tenant when provided
					return await cacheService.get<string>(`graphql:${key}`, tenantId);
				} catch (err) {
					logger.debug('GraphQL cache get failed, continuing without cache', err);
					return null;
				}
			},
			set: async (key: string, value: string, _ex: string, duration: number, tenantId?: string) => {
				try {
					// Ignore 'EX' (Generic wrapper) and use duration directly
					// Namespace GraphQL caches
					await cacheService.set(`graphql:${key}`, value, duration, tenantId, CacheCategory.API);
				} catch (err) {
					logger.debug('GraphQL cache set failed, continuing without cache', err);
				}
			}
		}
	: null;
import { createSchema, createYoga } from 'graphql-yoga';
import { collectionsResolvers, createCleanTypeName, registerCollections } from './resolvers/collections';
import { mediaResolvers, mediaTypeDefs } from './resolvers/media';
import { userResolvers, userTypeDefs } from './resolvers/users';
import { systemResolvers, systemTypeDefs } from './resolvers/system';

// GraphQL Subscriptions
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';

// Widget Store - ensure widgets are loaded before GraphQL setup
import { widgets } from '@cms/stores/widgetStore.svelte';

// Unified Cache Service
import { cacheService } from '@shared/database/CacheService';

// Auth / Permission
import { hasPermissionWithRoles, registerPermission } from '@shared/database/auth/permissions';
import { PermissionAction, PermissionType, type User, type Role } from '@shared/database/auth/types';

// System Logger
import { logger } from '@shared/utils/logger.server';

// Import shared PubSub instance
import { pubSub } from '@shared/services/pubSub';

// Removed local createPubSub() call
// const pubSub = createPubSub();

// Define the access management permission configuration
const accessManagementPermission = {
	_id: 'config:accessManagement' as DatabaseId,
	contextId: 'config/accessManagement',
	name: 'Access Management',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.CONFIGURATION,
	type: PermissionType.CONFIGURATION,
	description: 'Allows management of user access and permissions'
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
async function createGraphQLSchema(dbAdapter: DatabaseAdapter, tenantId?: string) {
	// Ensure widgets are loaded before proceeding
	if (!widgets.isLoaded) {
		logger.debug('Widgets not loaded yet, initializing...');
		// Pass dbAdapter to load active widgets from DB
		await widgets.initialize(tenantId, dbAdapter);
	}

	const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);

	// Ensure collections is properly formatted
	const collectionsArray = (Array.isArray(collections) ? collections : Object.values(collections || {})) as Array<{
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
				.filter((collection) => collection && collection.name && collection._id)
				.map((collection) => `${createCleanTypeName(collection)}(pagination: PaginationInput): [${createCleanTypeName(collection)}]`)
				.join('\n')}
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
			accessManagementPermission: async (_: unknown, __: unknown, context: { user?: User; locals?: { roles?: Role[] } }) => {
				const { user } = context;
				if (!user) {
					throw new Error('Unauthorized: No user in context');
				}
				const userHasPermission = hasPermissionWithRoles(user, 'config:accessManagement', context.locals?.roles || []);
				if (!userHasPermission) {
					throw new Error('Forbidden: Insufficient permissions');
				}
				return accessManagementPermission;
			}
		},
		...Object.keys(collectionsResolversObj)
			.filter((key) => key !== 'Query')
			.reduce(
				(acc, key) => {
					acc[key] = collectionsResolversObj[key];
					return acc;
				},
				{} as Record<string, Record<string, unknown>>
			),
		Subscription: {
			contentStructureUpdated: {
				subscribe: (_: unknown, __: unknown, context: { pubSub: any }) => {
					return context.pubSub.subscribe('contentStructureUpdated');
				},
				resolve: (payload: any) => payload
			},
			entryUpdated: {
				subscribe: (_: unknown, _args: { collection?: string; id?: string }, context: { pubSub: any }) => {
					// Subscribe to all updates
					// In a real app, you might want to filter by collection/id here if the PubSub supports it,
					// or filter in the resolver. For simplest implementation: subscribe to channel, modify payload in resolve?
					// Actually, graphql-yoga pubsub is simple.
					// We can just subscribe to the channel 'entryUpdated'.
					const iterator = context.pubSub.subscribe('entryUpdated');
					// We can filter in the resolver or using pipe/filter on iterator if needed.
					// But standard pattern: client receives event and checks if it matches.
					return iterator;
				},
				resolve: (payload: any) => payload
			}
		}
	};

	// Return raw typeDefs/resolvers; Yoga and WS server will build schemas as needed
	return { typeDefs, resolvers };
}

async function setupGraphQL(dbAdapter: DatabaseAdapter, tenantId?: string) {
	try {
		const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);

		// Create GraphQL Yoga app; let Yoga manage the schema from typeDefs/resolvers
		const yogaApp = createYoga({
			graphqlEndpoint: '/api/graphql',
			landingPage: true,
			plugins: [],
			cors: false,
			graphiql: {
				subscriptionsProtocol: 'WS'
			},
			// @ts-expect-error Yoga schema type mismatch due to context generics
			schema: createSchema({ typeDefs, resolvers }),
			context: async ({ request }) => {
				// Extract the context from the request if it was passed
				const contextData = (request as Request & { contextData?: { user: unknown; tenantId?: string } }).contextData;
				return {
					user: contextData?.user,
					tenantId: contextData?.tenantId,
					locale: request.headers.get('accept-language')?.split(',')[0]?.trim().slice(0, 2) || 'en', // Simple locale extraction
					pubSub
				};
			}
		});

		logger.info('GraphQL setup completed successfully');
		return yogaApp;
	} catch (error) {
		logger.error('Error setting up GraphQL:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			tenantId
		});
		throw error;
	}
}

// Store Yoga app promise with a relaxed, generic-any typing to avoid
// tight coupling to Yoga's internal generics, which are noisy for our use case.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yogaAppPromise: Promise<ReturnType<typeof createYoga<any, any>>> | null = null;
let wsServerInitialized = false;

// NOTE: This is a workaround for SvelteKit not exposing the HTTP server instance.
// We create a standalone WebSocket server on a different port.
// In a production environment, you would ideally integrate this with your main HTTP server.
async function initializeWebSocketServer(dbAdapter: DatabaseAdapter, tenantId?: string) {
	if (wsServerInitialized || building) {
		return;
	}

	try {
		const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
		const schema = createSchema({ typeDefs, resolvers });

		const wsServer = new WebSocketServer({
			port: 3001,
			path: '/api/graphql'
		});

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

					let user = null;

					// Try multiple authentication methods
					if (connectionParams) {
						try {
							// Method 1: Bearer token (for API tokens)
							if (connectionParams.authorization) {
								const token = connectionParams.authorization.replace(/^Bearer\s+/i, '');
								const tokenValidation = await dbAdapter.auth.validateToken(token, undefined, 'access', tenantId);

								if (tokenValidation?.success) {
									const tokenData = await dbAdapter.auth.getTokenByValue(token, tenantId);
									if (tokenData?.success && tokenData.data) {
										const userResult = await dbAdapter.auth.getUserById(tokenData.data.user_id, tenantId);
										if (userResult?.success) {
											user = userResult.data;
											logger.info('WebSocket: User authenticated via token', { userId: user?._id });
										}
									}
								}
							}
						} catch (error) {
							logger.error('WebSocket authentication error:', {
								error: error instanceof Error ? error.message : 'Unknown error'
							});
						}
					}

					return {
						user,
						pubSub,
						tenantId
					};
				}
			},
			wsServer
		);

		wsServerInitialized = true;
		logger.info('GraphQL WebSocket Server initialized on port 3001');
	} catch (error) {
		logger.error('Failed to initialize WebSocket server:', {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

const handler = async (event: RequestEvent) => {
	const { locals, request } = event;

	// Authentication is handled by hooks.server.ts, but let's be extra sure
	if (!locals.user) {
		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'You must be logged in to access the GraphQL endpoint.'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Check if database adapter is available
	if (!locals.dbAdapter) {
		return new Response(
			JSON.stringify({
				error: 'Service Unavailable',
				message: 'Database service is not available.'
			}),
			{
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	try {
		// Initialize yogaAppPromise if not already done
		if (!yogaAppPromise) {
			logger.debug('Initializing GraphQL Yoga app', { tenantId: locals.tenantId });
			yogaAppPromise = setupGraphQL(locals.dbAdapter, locals.tenantId);
		}
		const yogaApp = await yogaAppPromise;
		if (!yogaApp) {
			throw new Error('GraphQL Yoga app failed to initialize');
		}

		// Initialize WebSocket server if not already done
		if (!wsServerInitialized) {
			logger.debug('Initializing WebSocket server', { tenantId: locals.tenantId });
			void initializeWebSocketServer(locals.dbAdapter, locals.tenantId);
		}

		// Create a compatible Request object for GraphQL Yoga
		// The issue is that SvelteKit's request.url is a URL object, but GraphQL Yoga expects a string
		const requestInit: RequestInit = {
			method: request.method,
			headers: request.headers
		};

		// Only add body for non-GET requests
		if (request.method !== 'GET' && request.body) {
			requestInit.body = request.body;
			// 'duplex' is required for streaming bodies but not in RequestInit type
			// Assign duplex property for streaming bodies (Node.js fetch polyfill)
			(requestInit as RequestInit & { duplex?: string }).duplex = 'half';
		}

		const compatibleRequest = new Request(request.url.toString(), requestInit);

		// Add context data to the request object for GraphQL Yoga
		(compatibleRequest as Request & { contextData?: { user: unknown; tenantId?: string } }).contextData = {
			user: locals.user,
			tenantId: locals.tenantId
		};

		// Use GraphQL Yoga's handleRequest method which is designed for server environments
		const yogaResponse = await yogaApp.handleRequest(compatibleRequest, {
			user: locals.user,
			tenantId: locals.tenantId
		});

		logger.debug('GraphQL Yoga response:', {
			status: yogaResponse?.status,
			statusText: yogaResponse?.statusText,
			headers: yogaResponse ? Object.fromEntries(yogaResponse.headers.entries()) : 'N/A',
			isResponse: yogaResponse instanceof Response
		});

		if (!yogaResponse) {
			logger.error('GraphQL Yoga returned undefined or null response');
			throw new Error('GraphQL Yoga returned no response');
		}

		// Return a SvelteKit-compatible Response
		// FIX: We consume the body to ensure it's loaded and return a new Response
		// This handles streaming issues where SvelteKit/Node might not like the Yoga stream format directly
		const bodyBuffer = await yogaResponse.arrayBuffer();

		return new Response(bodyBuffer, {
			status: yogaResponse.status,
			statusText: yogaResponse.statusText,
			headers: yogaResponse.headers
		});
	} catch (error) {
		logger.error('Error handling GraphQL request:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			tenantId: locals.tenantId
		});

		// Return proper JSON error response
		return new Response(
			JSON.stringify({
				error: 'Internal Server Error',
				message: 'An error occurred while processing your GraphQL request.'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
