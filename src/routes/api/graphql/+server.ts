// yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';

import mongoose from 'mongoose';

import { getCollections } from '@src/collections';
import widgets from '@src/components/widgets';
import { getFieldName } from '@src/utils/utils';

let typeDefs = /* GraphQL */ ``;
const types = new Set();
const collectionSchemas: string[] = [];
const collections = await getCollections();

console.log('collections', collections);

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
	// console.log('collection.name: ', collection.name);
	for (const field of collection.fields) {
		const schema = widgets[field.widget.key].GraphqlSchema?.({ field, label: getFieldName(field), collection });

		if (schema) {
			const _types = schema.split(/(?=type.*?{)/);
			for (const type of _types) {
				types.add(type);
			}
			if (!getFieldName(field) && field.fields && Array.isArray(field.fields) && field.fields.length > 0) {
				const _fields: Array<any> = field.fields;
				for (const _field of _fields) {
					collectionSchema += `${getFieldName(_field)}: ${collection.name}_${getFieldName(_field)}\n`;
				}
			} else {
				collectionSchema += `${getFieldName(field)}: ${collection.name}_${getFieldName(field)}\n`;
			}
		}
	}
	collectionSchemas.push(collectionSchema + '}\n');
}

typeDefs += Array.from(types).join('\n');
typeDefs += collectionSchemas.join('\n');
typeDefs += `
type Query {
	${collections.map((collection) => `${collection.name}: [${collection.name}]`).join('\n')}
}
`;

// Initialize an empty resolvers object
const resolvers = {
	Query: {}
};

// Loop over each collection
for (const collection of collections) {
	// Add a resolver function for collections
	resolvers.Query[collection.name as string] = async () => await mongoose.models[collection.name as string].find({}).lean();
}

// console.log('resolvers.Query:', resolvers.Query);
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
