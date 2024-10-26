/**
 * @file src/routes/api/graphql/+server.ts
 * @description GraphQL API setup and request handler for the CMS.
 *
 * This module sets up the GraphQL schema and resolvers, including:
 * - Collection-specific schemas and resolvers
 * - User-related schemas and resolvers
 * - Media-related schemas and resolvers
 * - Access management permission definition and checking
 */

import { privateEnv } from '@root/config/private';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

// GraphQL Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import { registerCollections, collectionsResolvers } from './resolvers/collections';
import { userTypeDefs, userResolvers } from './resolvers/users';
import { mediaTypeDefs, mediaResolvers } from './resolvers/media';
import { dbAdapter } from '@src/databases/db';

// Redis
import { createClient } from 'redis';

// Permission Management
import { checkUserPermission } from '@src/auth/permissionCheck';
import { registerPermission } from '@src/auth/permissionManager';
import { PermissionAction, PermissionType } from '@src/auth/permissionTypes';

// System Logger
import { logger } from '@utils/logger';

// Define the access management permission configuration
const accessManagementPermission = {
	contextId: 'config/accessManagement',
	name: 'Access Management',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.CONFIGURATION,
	description: 'Allows management of user access and permissions'
};

// Register the permission
registerPermission(accessManagementPermission);

// Initialize Redis client if needed
let redisClient: ReturnType<typeof createClient> | null = null;

if (privateEnv.USE_REDIS === true) {
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
async function setupGraphQL() {
	try {
		logger.info('Setting up GraphQL schema and resolvers');
		const { typeDefs: collectionsTypeDefs, collections } = await registerCollections();

		const typeDefs = `
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
									.map((collection) => `${collection.name}: [${collection.name}]`)
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

		const resolvers = {
			Query: {
				...(await collectionsResolvers(redisClient, privateEnv)),
				...userResolvers(dbAdapter),
				...mediaResolvers(dbAdapter),
				accessManagementPermission: async (_, __, context) => {
					const { user } = context;
					if (!user) {
						throw Error('Unauthorized');
					}
					const { hasPermission } = await checkUserPermission(user, accessManagementPermission);
					if (!hasPermission) {
						throw Error('Forbidden');
					}
					return accessManagementPermission;
				}
			}
		};

		const yogaApp = createYoga<RequestHandler>({
			schema: createSchema({
				typeDefs,
				resolvers
			}),
			graphqlEndpoint: '/api/graphql',
			fetchAPI: globalThis,
			context: async (event: RequestEvent) => {
				// Assuming user is added to event.locals during authentication
				return { user: event.locals.user };
			}
		});

		logger.info('GraphQL setup completed successfully');
		return yogaApp;
	} catch (error) {
		logger.error('Error setting up GraphQL: ', error);
		throw error;
	}
}

const yogaAppPromise = setupGraphQL();

const handler = async (event: RequestEvent) => {
	try {
		const yogaApp = await yogaAppPromise;
		const response = await yogaApp.handleRequest(event.request, event);
		logger.info('GraphQL request handled successfully', { status: response.status });
		return new Response(response.body, {
			status: response.status,
			headers: response.headers
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error handling GraphQL request:', { error: errorMessage });
		return json({ success: false, error: `Error handling GraphQL request: ${errorMessage}` }, { status: 500 });
	}
};

// Ensure Redis is disconnected when the server shuts down
if (typeof process !== 'undefined') {
	process.on('SIGINT', cleanupRedis);
	process.on('SIGTERM', cleanupRedis);
}

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
