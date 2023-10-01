// yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';

import mongoose from 'mongoose';

import { getCollections } from '@src/collections';
import widgets from '@src/components/widgets';

let typeDefs = /* GraphQL */ ``;
const collectionSchemas: string[] = [];
const collections = await getCollections();

for (const collection of collections) {
	let collectionSchema = `
	type ${collection.name} {
		_id: String
		createdAt: Float
		updatedAt: Float
		permissions: String
		name: String
		icon: String
		slug: String
		fields: [String]
		strict: Boolean
		status: String
	`;
	for (const field of collection.fields) {
		const label = field.label;
		const schema = widgets[field.widget.key].GraphqlSchema?.({ label });
		if (schema) {
			if (!typeDefs.includes(schema)) {
				typeDefs += schema;
			}
			collectionSchema += `${label}: ${field.widget.key}\n`;
		}
	}
	collectionSchemas.push(collectionSchema + '}\n');
}
typeDefs += collectionSchemas.join('\n');
typeDefs += `
type Query {
	${collections.map((collection: any) => `${collection.name}: [${collection.name}]`).join('\n')}
}
`;
console.log(typeDefs);

// Initialize an empty resolvers object
const resolvers = {
	Query: {}
};

// Loop over each collection
for (const collection of collections) {
	// Add a resolver function for this collection
	resolvers.Query[collection.name] = async () => {
		// Use the collection name to find the correct model in mongoose
		const model = mongoose.models[collection.name];
		// If the model exists, find all documents
		if (model) {
			return await model.find({}).lean();
		}
		// If the model does not exist, return an error
		else {
			throw new Error(`No model found for collection ${collection.name}`);
		}
	};
}

const yogaApp = createYoga<RequestEvent>({
	// Import schema and resolvers
	schema: createSchema({
		typeDefs,
		resolvers
	}),
	// Define the GraphQL endpoint
	graphqlEndpoint: '/api/graphql',
	// Use SvelteKit's Response object
	fetchAPI: globalThis
});

export { yogaApp as GET, yogaApp as POST };
