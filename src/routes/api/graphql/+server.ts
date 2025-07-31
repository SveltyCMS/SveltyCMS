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

import { privateEnv } from '@root/config/private';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { building } from '$app/environment';

// GraphQL Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import { registerCollections, collectionsResolvers } from './resolvers/collections';
import { userTypeDefs, userResolvers } from './resolvers/users';
import { mediaTypeDefs, mediaResolvers } from './resolvers/media';
import { dbAdapter } from '@src/databases/db';

// Redis
import { createClient } from 'redis';

// Auth / Permission
import { hasPermissionWithRoles, registerPermission } from '@src/auth/permissions';
import { PermissionAction, PermissionType } from '@src/auth/types';

// Roles Configuration
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// Creates a clean GraphQL type name from collection info
function createCleanTypeName(collection: { name: string; _id: string }): string {
	// Get the last part of the collection name (after any slashes)
	const baseName = collection.name.split('/').pop() || collection.name;
	// Clean the name: remove spaces, special chars, and convert to PascalCase
	const cleanName = baseName
		.replace(/[^a-zA-Z0-9]/g, '')
		.replace(/^[0-9]/, 'Collection$&') // Handle names starting with numbers
		.replace(/^\w/, (c) => c.toUpperCase()); // Ensure starts with uppercase

	// Use first 8 characters of UUID for uniqueness while keeping it readable
	const shortId = collection._id.substring(0, 8);

	return `${cleanName}_${shortId}`;
}

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

// Initialize Redis client if needed
let redisClient: ReturnType<typeof createClient> | null = null;

// Create a cache client adapter that matches our CacheClient interface
const cacheClient =
	privateEnv.USE_REDIS === true
		? {
				get: async (key: string) => redisClient?.get(key) || null,
				set: async (key: string, value: string, ex: string, duration: number) => redisClient?.set(key, value, { EX: duration })
			}
		: null;

if (!building && privateEnv.USE_REDIS === true) {
	logger.info('Initializing Redis client');
	// Create Redis client
	redisClient = createClient({
		url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
		password: privateEnv.REDIS_PASSWORD
	});
	// Connect to Redis
	redisClient.on('error', (err: Error) => {
		logger.error('Redis error: ', err);
	});

	redisClient.connect().catch((err) => logger.error('Redis connection error: ', err));
}

// Ensure Redis client is properly disconnected on shutdown
async function cleanupRedis() {
	if (redisClient) {
		try {
			await redisClient.quit();
			logger.info('Redis client disconnected gracefully');
		} catch (err) {
			logger.error('Error disconnecting Redis client: ', err);
		}
	}
}

// Setup GraphQL schema and resolvers
async function setupGraphQL(tenantId?: string) {
	try {
		logger.info('Setting up GraphQL schema and resolvers', { tenantId });

		const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);

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
                ${Object.values(collections)
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

		const collectionsResolversObj = await collectionsResolvers(cacheClient, privateEnv);

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

		const yogaApp = createYoga<RequestHandler>({
			schema: createSchema({
				typeDefs,
				resolvers
			}),
			graphqlEndpoint: '/api/graphql',
			fetchAPI: globalThis,
			context: async (event: RequestEvent) => {
				logger.debug('GraphQL context created', { userId: event.locals.user?._id, tenantId: event.locals.tenantId }); // Pass the user and tenantId to all resolvers
				return { user: event.locals.user, tenantId: event.locals.tenantId };
			}
		});

		logger.info('GraphQL setup completed successfully');
		return yogaApp;
	} catch (error) {
		logger.error('Error setting up GraphQL:', error);
		throw error;
	}
}

let yogaAppPromise: Promise<ReturnType<typeof createYoga<RequestHandler>>> | null = null;

const handler = async (event: RequestEvent) => {
	const { locals } = event;

	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Ensure Redis is disconnected when the server shuts down
	if (!building && typeof process !== 'undefined') {
		process.on('SIGINT', cleanupRedis);
		process.on('SIGTERM', cleanupRedis);
	}

	// Initialize yogaAppPromise if not already done
	if (!yogaAppPromise) {
		yogaAppPromise = setupGraphQL(locals.tenantId);
	}
	const yogaApp = await yogaAppPromise;
	return yogaApp.handleRequest(event);
};

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
