import { privateEnv } from '@root/config/private';
import type { RequestEvent } from '@sveltejs/kit';

// GraphQL Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import { registerCollections, collectionsResolvers } from './resolvers/collections';
import { userTypeDefs, userResolvers } from './resolvers/users';
import { mediaTypeDefs, mediaResolvers } from './resolvers/media';
import { dbAdapter } from '@api/databases/db';

// Redis
import { createClient } from 'redis';

// System Logs
import logger from '@src/utils/logger';

// Initialize Redis client if needed
let redisClient: any = null;

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

// GraphQL
async function setupGraphQL() {
	try {
		logger.info('Setting up GraphQL schema and resolvers');
		const { typeDefs: collectionsTypeDefs, collections } = await registerCollections();

		const typeDefs = `
        ${collectionsTypeDefs}
        ${userTypeDefs()}
        ${mediaTypeDefs()}
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
        }
    `;

		const resolvers = {
			Query: {
				...(await collectionsResolvers(redisClient, privateEnv)),
				...userResolvers(dbAdapter),
				...mediaResolvers(dbAdapter)
			}
		};

		const yogaApp = createYoga<RequestEvent>({
			schema: createSchema({
				typeDefs,
				resolvers
			}),
			graphqlEndpoint: '/api/graphql',
			fetchAPI: globalThis
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
		logger.error('Error handling GraphQL request: ', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
