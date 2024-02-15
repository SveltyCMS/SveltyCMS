// Graphql Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';
import mongoose from 'mongoose';

import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';
import { onMount } from 'svelte';

// Global Search Index
import { globalSearchIndex } from '@utils/globalSearchIndex';

// Redis
import { PUBLIC_USE_REDIS } from '$env/static/public';
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from '$env/static/private';
import { createClient } from 'redis';

let redisClient: any = null;

if (PUBLIC_USE_REDIS === 'true') {
	// Create Redis client
	redisClient = createClient({
		url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
		password: REDIS_PASSWORD
	});

	redisClient.on('error', (err: Error) => {
		console.log('Redis error: ', err);
	});
}

// Define the page data
const globalSearchData = {
	title: 'GraphQL API',
	description: 'Access the GraphQL API endpoint.',
	keywords: ['graphql', 'api', 'endpoint', 'data'],
	triggers: { 'Go to GraphQL API': { path: '/api/graphql', action: () => {} } }
};

// Function to check if a page entry already exists in the global search index
const isPageEntryExists = (index: any, pageData: any) => {
	return index.some((item: any) => {
		return item.title === pageData.title; // Assuming title uniquely identifies a page
	});
};

// Mount hook to add the GraphQL API page data to the global search index
onMount(() => {
	// Get the current value of the global search index
	const currentIndex = globalSearchIndex;

	// Check if the GraphQL API page data already exists in the index
	const isDataExists = isPageEntryExists(currentIndex, globalSearchData);

	// If the data doesn't exist, add it to the global search index
	if (!isDataExists) {
		globalSearchIndex.update((index) => [...index, globalSearchData]);
	}
});

let typeDefs = /* GraphQL */ ``;
const types = new Set();

// Initialize an empty resolvers object
let resolvers: { [key: string]: any } = {
	Query: {}
};

const collectionSchemas: string[] = [];
const collections = await getCollections();

// Loop over each collection to define typeDefs and resolvers
for (const collection of collections) {
	resolvers[collection.name as string] = {};
	// Default same for all Content
	let collectionSchema = `
	type ${collection.name} {
		_id: String
		createdAt: Float
		updatedAt: Float
	`;

	for (const field of collection.fields) {
		const schema = widgets[field.widget.key].GraphqlSchema?.({ field, label: getFieldName(field, true), collection });
		if (schema.resolver) {
			resolvers = deepmerge(resolvers, schema.resolver);
		}
		if (schema) {
			const _types = schema.graphql.split(/(?=type.*?{)/);
			for (const type of _types) {
				types.add(type);
			}
			if ('extract' in field && field.extract && 'fields' in field && field.fields.length > 0) {
				// for helper widgets which extract its fields and does not exist in db itself like image array
				const _fields = field.fields;
				for (const _field of _fields) {
					collectionSchema += `${getFieldName(_field, true)}: ${
						widgets[_field.widget.key].GraphqlSchema?.({
							field: _field,
							label: getFieldName(_field, true),
							collection
						}).typeName
					}\n`;
					console.log('---------------------------');
					console.log(collectionSchema);
					resolvers[collection.name as string] = deepmerge(
						{
							[getFieldName(_field, true)]: (parent) => {
								return parent[getFieldName(_field)];
							}
						},
						resolvers[collection.name as string]
					);
				}
			} else {
				collectionSchema += `${getFieldName(field, true)}: ${schema.typeName}\n`;

				resolvers[collection.name as string] = deepmerge(
					{
						[getFieldName(field, true)]: (parent) => {
							return parent[getFieldName(field)];
						}
					},
					resolvers[collection.name as string]
				);
			}
		}
	}
	collectionSchemas.push(collectionSchema + '}\n');
}

typeDefs += Array.from(types).join('\n');
typeDefs += collectionSchemas.join('\n');
typeDefs += `
type Query {
	${collections.map((collection: any) => `${collection.name}: [${collection.name}]`).join('\n')}
}
`;

// console.log(typeDefs);

// Loop over each collection to define resolvers for querying data
for (const collection of collections) {
	// console.log('collection.name:', collection.name);

	// Add a resolver function for collections
	resolvers.Query[collection.name as string] = async () => {
		if (PUBLIC_USE_REDIS === 'true') {
			// Try to fetch the result from Redis first
			const cachedResult = await new Promise((resolve, reject) => {
				redisClient.get(collection.name, (err, result) => {
					if (err) reject(err);
					resolve(result ? JSON.parse(result) : null);
				});
			});

			if (cachedResult !== null) {
				// If the result was found in Redis, return it
				return cachedResult;
			}
		}

		// If the result was not found in Redis, fetch it from the database
		const dbResult = await mongoose.models[collection.name as string].find({ status: { $ne: 'unpublished' } }).lean();

		if (PUBLIC_USE_REDIS === 'true') {
			// Store the DB result in Redis for future requests
			redisClient.set(collection.name, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour
		}

		// Convert the array of objects to a JSON object
		return JSON.stringify(dbResult);
	};
}

// console.log('resolvers.Query:', resolvers.Query);

const yogaApp = createYoga<RequestEvent>({
	// Import schema and resolvers
	schema: createSchema({
		typeDefs,
		resolvers
	}),
	// Define explicitly the GraphQL endpoint
	graphqlEndpoint: '/api/graphql',
	// Use SvelteKit's Response object
	fetchAPI: globalThis
});

export { yogaApp as GET, yogaApp as POST };
