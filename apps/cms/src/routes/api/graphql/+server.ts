/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API setup and request handler for the CMS.
 *
 * This module sets up the GraphQL schema and resolvers, including:
 * - Collection-specific schemas and resolvers, scoped to the current tenant
 * - User-related schemas and resolvers
 * - Media-related schemas and resolvers
 * - Access management permission definition and checking
 */

import { building } from '$app/environment';
import { getPrivateSettingSync } from '@src/services/settingsService';
import type { RequestEvent } from '@sveltejs/kit';

// GraphQL Yoga
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import { createSchema, createYoga } from 'graphql-yoga';
import { collectionsResolvers, createCleanTypeName, registerCollections } from './resolvers/collections';
import { mediaResolvers, mediaTypeDefs } from './resolvers/media';
import { userResolvers, userTypeDefs } from './resolvers/users';

// Widget Store - ensure widgets are loaded before GraphQL setup
import { widgetStoreActions, isLoaded } from '@stores/widgetStore.svelte';
import { get } from 'svelte/store';

// Unified Cache Service
import { cacheService } from '@src/databases/CacheService';

// Auth / Permission
import { hasPermissionWithRoles, registerPermission } from '@src/databases/auth/permissions';
import { PermissionAction, PermissionType } from '@src/databases/auth/types';

// Roles Configuration
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the access management permission configuration
const accessManagementPermission = {
	contextId: 'config/accessManagement',
	name: 'Access Management',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.CONFIGURATION,
	description: 'Allows management of user access and permissions'
};

// Register the permission
if (!building) {
	registerPermission(accessManagementPermission);
}

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
					await cacheService.set(`graphql:${key}`, value, duration, tenantId);
				} catch (err) {
					logger.debug('GraphQL cache set failed, continuing without cache', err);
				}
			}
		}
	: null;

// Setup GraphQL schema and resolvers
async function setupGraphQL(dbAdapter: DatabaseAdapter, tenantId?: string) {
	try {
		logger.info('Setting up GraphQL schema and resolvers', { tenantId });

		// Ensure widgets are loaded before proceeding
		if (!get(isLoaded)) {
			logger.debug('Widgets not loaded yet, initializing...');
			await widgetStoreActions.initializeWidgets(tenantId);
		}

		const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);

		// Ensure collections is properly formatted
		const collectionsArray = Array.isArray(collections) ? collections : Object.values(collections || {});
		logger.debug('Collections array for GraphQL', {
			collectionsCount: collectionsArray.length,
			collectionNames: collectionsArray.map((c) => c?.name).filter(Boolean)
		});

		const typeDefs = `
            input PaginationInput {
                page: Int = 1
                limit: Int = 50
            }

            ${collectionsTypeDefs}
            ${userTypeDefs()}
            ${mediaTypeDefs()}

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
									.map((collection) => `${createCleanTypeName(collection)}: [${createCleanTypeName(collection)}]`)
									.join('\n')}
                users: [User]
                mediaImages: [MediaImage]
                mediaDocuments: [MediaDocument]
                mediaAudio: [MediaAudio]
                mediaVideos: [MediaVideo]
                mediaRemote: [MediaRemote]
                accessManagementPermission: AccessManagementPermission
            }
        `;

		const collectionsResolversObj = await collectionsResolvers(dbAdapter, cacheClient, privateEnv, tenantId);

		const resolvers = {
			Query: {
				...collectionsResolversObj.Query,
				...userResolvers(dbAdapter),
				...mediaResolvers(dbAdapter),
				accessManagementPermission: async (_, __, context) => {
					const { user } = context;
					if (!user) {
						throw new Error('Unauthorized: No user in context');
					}
					const userHasPermission = hasPermissionWithRoles(user, 'config:accessManagement', roles);
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
				)
		};

		// Create schema and return GraphQL Yoga app
		const yogaApp = createYoga({
			schema: createSchema({
				typeDefs,
				resolvers
			}),
			graphqlEndpoint: '/api/graphql',
			landingPage: false, // Disable landing page but keep GraphiQL
			healthCheckEndpoint: false, // Disable health check to avoid SvelteKit compatibility issues
			plugins: [], // Disable all plugins to prevent URL compatibility issues
			cors: false, // Let SvelteKit handle CORS
			graphiql: true, // Enable built-in GraphiQL interface
			context: async ({ request }) => {
				// Extract the context from the request if it was passed
				const contextData = (request as Request & { contextData?: { user: unknown; tenantId?: string } }).contextData || {};
				const user = contextData.user as { _id?: string } | undefined;
				logger.debug('GraphQL context created', {
					userId: user?._id,
					tenantId: contextData.tenantId
				});
				return {
					user: contextData.user,
					tenantId: contextData.tenantId
				};
			}
		});

		logger.info('GraphQL setup completed successfully');
		return yogaApp;
	} catch (error) {
		logger.error('Error setting up GraphQL:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			errorStack: error instanceof Error ? error.stack : undefined,
			errorType: typeof error,
			errorString: String(error),
			tenantId
		});
		throw error;
	}
}

let yogaAppPromise: Promise<ReturnType<typeof createYoga>> | null = null;

const handler = async (event: RequestEvent) => {
	const { locals, request } = event;

	// Authentication is handled by hooks.server.ts, but let's be extra sure
	if (!locals.user) {
		logger.warn('Unauthorized access to GraphQL endpoint');
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
		logger.error('Database adapter not available in GraphQL handler');
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
		logger.debug('GraphQL Yoga app ready, handling request');

		// Create a compatible Request object for GraphQL Yoga
		// The issue is that SvelteKit's request.url is a URL object, but GraphQL Yoga expects a string
		const requestInit: RequestInit = {
			method: request.method,
			headers: request.headers
		};

		// Only add body and duplex for non-GET requests
		if (request.method !== 'GET' && request.body) {
			requestInit.body = request.body;
			requestInit.duplex = 'half';
		}

		const compatibleRequest = new Request(request.url.toString(), requestInit);

		// Add context data to the request object for GraphQL Yoga
		(compatibleRequest as Request & { contextData?: { user: unknown; tenantId?: string } }).contextData = {
			user: locals.user,
			tenantId: locals.tenantId
		};

		// Use GraphQL Yoga's handleRequest method which is designed for server environments
		const yogaResponse = await yogaApp.handleRequest(compatibleRequest);

		// Convert GraphQL Yoga response to proper SvelteKit Response
		const responseText = await yogaResponse.text();
		const headers = new Headers();

		// Copy headers from yoga response
		yogaResponse.headers.forEach((value, key) => {
			headers.set(key, value);
		});

		return new Response(responseText, {
			status: yogaResponse.status,
			statusText: yogaResponse.statusText,
			headers: headers
		});
	} catch (error) {
		logger.error('Error handling GraphQL request:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			errorStack: error instanceof Error ? error.stack : undefined,
			errorType: typeof error,
			errorString: String(error),
			tenantId: locals.tenantId,
			userId: locals.user?._id
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
