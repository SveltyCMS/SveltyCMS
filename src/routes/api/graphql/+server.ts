// yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';

import mongoose from 'mongoose';

import { getCollections } from '@src/collections';
import widgets from '@src/components/widgets';

let typeDefs = /* GraphQL */ ``;
const collectionSchemas: string[] = [];
const collections = await getCollections();
console.log('New line -----------------------');
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
	console.log('collection.name: ', collection.name);
	for (const field of collection.fields) {
		const label = field.label;
		const schema = widgets[field.widget.key].GraphqlSchema?.({ label });

		if (schema) {
			if (!typeDefs.includes(schema)) {
				console.log(schema);

				typeDefs += schema;
			}
			collectionSchema += `${field?.db_fieldName?.replace(/ /g, '_') || label.replace(/ /g, '_')}: ${field.widget.key}\n`;
		}
	}
	console.log('-----------------------');

	collectionSchemas.push(collectionSchema + '}\n');
}
typeDefs += collectionSchemas.join('\n');
typeDefs += `
type Query {
	${collections.map((collection: any) => `${collection.name}: [${collection.name}]`).join('\n')}
}
`;
// console.log(typeDefs);

// Initialize an empty resolvers object
const resolvers = {
	Query: {}
};

// Loop over each collection
for (const collection of collections) {
	// Add a resolver function for this collection
	const model = mongoose.models[collection.name];
	let data: any | null = null;
	// If the model exists, find all documents
	if (model) {
		data = await model.find({});
	} else {
		throw new Error(`No model found for collection ${collection.name}`);
	}
	data = data.map((doc: any) => doc.toObject());

	resolvers.Query[collection.name] = () => data;
}

console.log('resolvers.Query:', resolvers.Query);

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
