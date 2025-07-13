/**
 * @file src/routes/api/graphql/+server.ts
 * @description Production-ready GraphQL API endpoint for the SvelteKit CMS.
 *
 * This module provides a robust GraphQL server with the following features:
 * - **Dynamic Schema Generation**: Builds GraphQL schema from collection, user, and media definitions.
 * - **Eager Initialization**: Server is set up on module load to ensure "fail-fast" behavior.
 * - **Security Hardening**: Implements plugins to block schema suggestions and limit query resources, preventing abuse.
 * - **Performance Caching**: Uses Redis for response caching to reduce database load and improve speed.
 * - **Graceful Shutdown**: Ensures proper cleanup of database and Redis connections when the server stops.
 * - **SvelteKit Integration**: Correctly handles passing request-specific context (`event.locals`) to resolvers.
 */

// --- Core SvelteKit & Environment Imports ---
import { json, type RequestHandler } from '@sveltejs/kit'; // SvelteKit's request/response utilities.
import { building } from '$app/environment'; // SvelteKit's build-time environment flag.
import { privateEnv } from '@root/config/private'; // Import private environment variables.
// Note: For best practice, use Zod to validate privateEnv on import from a dedicated config file.

// --- GraphQL & Yoga Imports ---
import { createSchema, createYoga } from 'graphql-yoga'; // Core GraphQL server setup.
import { useBlockFieldSuggestions } from '@graphql-yoga/plugin-block-field-suggestions'; // Security: Disables introspection field suggestions.
import { useResourceLimiter } from '@graphql-yoga/plugin-resource-limiter'; // Security: Prevents overly complex/deep queries.
import { useResponseCache } from '@graphql-yoga/plugin-response-cache'; // Performance: Caches full GraphQL responses.

// --- Database & Caching Imports ---
import { dbAdapter } from '@src/databases/db'; // Your main database adapter.
import { createClient, type RedisClientType } from 'redis'; // Redis client for caching.

// --- CMS-Specific Imports ---
import { registerCollections, collectionsResolvers } from './resolvers/collections'; // Resolvers for content collections.
import { userTypeDefs, userResolvers } from './resolvers/users'; // Resolvers for user data.
import { mediaTypeDefs, mediaResolvers } from './resolvers/media'; // Resolvers for media assets.
import { hasPermissionWithRoles, registerPermission } from '@src/auth/permissions'; // Permission management utilities.
import { PermissionAction, PermissionType, type User } from '@src/auth/types'; // Authentication & permission types.
import { roles } from '@root/config/roles'; // User role definitions.
import { logger } from '@utils/logger.svelte'; // System-wide logger.

// --- Helper Functions ---

/** Creates a clean, valid GraphQL type name from a collection's metadata. */
function createCleanTypeName(collection: { name: string; _id: string }): string {
	const baseName = collection.name.split('/').pop() || collection.name; // Get the last part of the name.
	const cleanName = baseName
		.replace(/[^a-zA-Z0-9]/g, '') // Remove special characters.
		.replace(/^[0-9]/, 'Collection$&') // Prepend if name starts with a number.
		.replace(/^\w/, (c) => c.toUpperCase()); // Capitalize the first letter.
	const shortId = collection._id.substring(0, 8); // Add a unique suffix from the ID.
	return `${cleanName}_${shortId}`;
}

/** Handles graceful shutdown of external connections. */
async function cleanup(redisClient: RedisClientType | null) {
	logger.info('Starting graceful shutdown...');
	if (redisClient && redisClient.isOpen) {
		try {
			await redisClient.quit(); // Disconnect the Redis client.
			logger.info('Redis client disconnected gracefully.');
		} catch (err) {
			logger.error('Error disconnecting Redis client:', err);
		}
	}
	// if (dbAdapter.disconnect) { await dbAdapter.disconnect(); } // Disconnect database if adapter supports it.
}

// --- Main GraphQL Server Setup ---

/**
 * Creates and configures the entire GraphQL server instance on startup.
 * @returns A promise that resolves to the Yoga instance and Redis client, or nulls on failure.
 */
async function createGraphQLServer() {
	let redisClient: RedisClientType | null = null; // Initialize Redis client variable.

	try {
		logger.info('Setting up GraphQL server...');

		// Initialize Redis Client if enabled in the environment.
		if (!building && privateEnv.USE_REDIS === true) {
			logger.info('Initializing Redis client...');
			redisClient = createClient({
				url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
				password: privateEnv.REDIS_PASSWORD
			});
			redisClient.on('error', (err: Error) => logger.error('Redis error:', err)); // Log Redis errors.
			await redisClient.connect(); // Connect to the Redis server.
		}

		// Create a cache client adapter for resolvers.
		const cacheClient = redisClient
			? {
					get: async (key: string) => redisClient.get(key),
					set: async (key: string, value: string, ex: string, duration: number) => redisClient.set(key, value, { EX: duration })
				}
			: null;

		// Register CMS permissions during setup.
		if (!building) {
			registerPermission({
				contextId: 'config/accessManagement',
				name: 'Access Management',
				action: PermissionAction.MANAGE,
				contextType: PermissionType.CONFIGURATION,
				description: 'Allows management of user access and permissions'
			});
		}

		// Dynamically build the GraphQL schema from different parts of the CMS.
		const { typeDefs: collectionsTypeDefs, collections } = await registerCollections();
		const typeDefs = `
            input PaginationInput { page: Int = 1, limit: Int = 50 }
            ${collectionsTypeDefs}
            ${userTypeDefs()}
            ${mediaTypeDefs()}
            
            type AccessManagementPermission { contextId: String!, name: String!, action: String!, contextType: String!, description: String }
            
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

		// Combine resolvers from all parts of the CMS.
		const resolvers = {
			Query: {
				...(await collectionsResolvers(cacheClient, privateEnv)),
				...userResolvers(dbAdapter),
				...mediaResolvers(dbAdapter),
				accessManagementPermission: async (_: any, __: any, context: { user: User }) => {
					if (!context.user) throw new Error('Unauthorized: No user in context'); // Check for user in context.
					const hasPerm = hasPermissionWithRoles(context.user, 'config:accessManagement', roles); // Verify permission.
					if (!hasPerm) throw new Error('Forbidden: Insufficient permissions');
					return {
						contextId: 'config/accessManagement',
						name: 'Access Management',
						action: 'MANAGE',
						contextType: 'CONFIGURATION',
						description: 'Allows management of user access and permissions'
					};
				}
			}
		};

		// Create the Yoga server instance with schema and plugins.
		const yoga = createYoga<RequestHandler>({
			schema: createSchema({ typeDefs, resolvers }),
			graphqlEndpoint: '/api/graphql',
			fetchAPI: globalThis,
			plugins: [
				// Security: Disable field suggestions to prevent schema probing.
				useBlockFieldSuggestions(),
				// Security: Set limits on query complexity and execution time to prevent abuse.
				useResourceLimiter({
					selectionSetDepth: 10,
					maxExecutionTime: 5000 // 5 seconds
				}),
				// Performance: Enable response caching using Redis.
				useResponseCache({
					session: () => redisClient, // Provide the Redis client for storage.
					ttl: 60_000, // Cache responses for 60 seconds.
					invalidateViaMutation: true, // Automatically invalidate cache on mutations.
					include: Object.values(collections).map(createCleanTypeName) // Specify which types are cacheable.
				})
			]
		});

		logger.info('GraphQL setup completed successfully.');
		return { yoga, redisClient }; // Return both the app and the client for cleanup.
	} catch (error) {
		logger.error('Fatal error during GraphQL setup:', error);
		await cleanup(redisClient); // Attempt cleanup even if setup fails.
		return { yoga: null, redisClient: null }; // Return nulls to indicate failure.
	}
}

// --- Initialization and Request Handling ---

// Eagerly initialize the server when the module loads.
const { yoga, redisClient } = await createGraphQLServer();

// Add shutdown hooks for graceful exit, only on the server.
if (!building && typeof process !== 'undefined') {
	process.on('SIGINT', () => cleanup(redisClient)); // Handle Ctrl+C.
	process.on('SIGTERM', () => cleanup(redisClient)); // Handle process termination.
}

/** The main request handler for both GET and POST requests. */
const handler: RequestHandler = async (event) => {
	// If server setup failed, return a 500 error immediately.
	if (!yoga) {
		return json({ success: false, error: 'GraphQL server failed to initialize.' }, { status: 500 });
	}

	try {
		// Handle the incoming request, passing SvelteKit's `locals` into the context.
		return await yoga.handleRequest(event.request, { ...event, locals: event.locals });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error handling GraphQL request:', { error: errorMessage });
		return json({ success: false, error: `Error handling GraphQL request: ${errorMessage}` }, { status: 500 });
	}
};

// Export the handler for SvelteKit's routing.
export { handler as GET, handler as POST };
