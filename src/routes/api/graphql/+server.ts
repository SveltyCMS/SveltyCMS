// Graphql Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';

import mongoose from 'mongoose';

import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';

let typeDefs = /* GraphQL */ ``;
const types = new Set();

// Initialize an empty resolvers object
let resolvers: { [key: string]: any } = {
	Query: {}
};

const collectionSchemas: string[] = [];
const collections = await getCollections();

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
					collectionSchema += `${getFieldName(_field, true)}: ${widgets[_field.widget.key].GraphqlSchema?.({
						field: _field,
						label: getFieldName(_field, true),
						collection
					}).typeName}\n`;
					// console.log('---------------------------');
					// console.log(collectionSchema);
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

// Loop over each collection
for (const collection of collections) {
	// console.log('collection.name:', collection.name);

	// Add a resolver function for collections
	resolvers.Query[collection.name as string] = async () =>
		await mongoose.models[collection.name as string].find({ status: { $ne: 'unpublished' } }).lean();
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
