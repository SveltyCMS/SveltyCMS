import { privateEnv } from '@root/config/private';
import type { RequestEvent } from '@sveltejs/kit';

// GraphQL Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import { registerCollections, collectionsResolvers } from './resolvers/collections';
import { userTypeDefs, userResolvers } from './resolvers/users';
import { mediaTypeDefs, mediaResolvers } from './resolvers/media';

// Redis
import { createClient } from 'redis';

// Initialize Redis client if needed
let redisClient: any = null;

if (privateEnv.USE_REDIS === true) {
	// Create Redis client
	redisClient = createClient({
		url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
		password: privateEnv.REDIS_PASSWORD
	});

	// Connect to Redis
	redisClient.on('error', (err: Error) => {
		console.error('Redis error: ', err);
	});

	redisClient.connect().catch(console.error);
}

// GraphQL
async function setupGraphQL() {
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
			...userResolvers(), // Ensure that userResolvers and mediaResolvers are functions
			...mediaResolvers()
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

	return yogaApp;
}

const yogaAppPromise = setupGraphQL();

const handler = async (event: RequestEvent) => {
	const yogaApp = await yogaAppPromise;
	const response = await yogaApp.handleRequest(event.request, event);
	return new Response(response.body, {
		status: response.status,
		headers: response.headers
	});
};

// Export the handlers for GET and POST requests
export { handler as GET, handler as POST };
