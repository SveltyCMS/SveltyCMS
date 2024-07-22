import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';
import { dbAdapter } from '@api/databases/db';

// System logger
import {logger} from '@src/utils/logger';

// Registers collection schemas dynamically.
export async function registerCollections() {
	const collections = await getCollections();
	const typeDefsSet = new Set<string>();
	const resolvers: { [key: string]: any } = { Query: {} };
	const collectionSchemas: string[] = [];

	// Loop over each collection to build typeDefs and resolvers
	for (const collection of Object.values(collections)) {
		// Type check for collection
		if (!collection.name) {
			logger.error('Collection name is undefined:', collection);
			continue;
		}
		const collectionName: string = collection.name;

		// Initialize collection resolvers
		resolvers[collectionName] = {};

		// Initialize GraphQL type definition for the collection
		let collectionSchema = `
            type ${collectionName} {
                _id: String
                createdAt: String
                updatedAt: String
        `;

		// Loop over each field to build the schema and resolvers
		for (const field of collection.fields) {
			const schema = widgets[field.widget.Name].GraphqlSchema?.({ field, label: getFieldName(field, true), collection });

			// Merge resolvers if available
			if (schema?.resolver) {
				deepmerge(resolvers, schema.resolver);
			}

			// Build the GraphQL type definition
			if (schema) {
				const _types = schema.graphql.split(/(?=type.*?{)/);
				for (const type of _types) {
					typeDefsSet.add(type);
				}
				// Handle extracted fields
				if ('extract' in field && field.extract && 'fields' in field && field.fields.length > 0) {
					const _fields = field.fields;
					for (const _field of _fields) {
						collectionSchema += `${getFieldName(_field, true)}: ${
							widgets[_field.widget.Name].GraphqlSchema?.({
								field: _field,
								label: getFieldName(_field, true),
								collection
							}).typeName
						}\n`;
						deepmerge(resolvers[collectionName], {
							[getFieldName(_field, true)]: (parent) => parent[getFieldName(_field)]
						});
					}
				} else {
					collectionSchema += `${getFieldName(field, true)}: ${schema.typeName}\n`;
					deepmerge(resolvers[collectionName], {
						[getFieldName(field, true)]: (parent) => parent[getFieldName(field)]
					});
				}
			}
		}
		collectionSchemas.push(collectionSchema + '}\n');
	}

	return {
		typeDefs: Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n'),
		resolvers,
		collections
	};
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(redisClient: any, privateEnv: any) {
	const { resolvers, collections } = await registerCollections();

	for (const collection of Object.values(collections)) {
		if (!collection.name) {
			logger.error('Collection name is undefined:', collection);
			continue;
		}
		const collectionName: string = collection.name;

		resolvers.Query[collectionName] = async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}

			try {
				// Try to fetch the result from Redis first
				if (privateEnv.USE_REDIS === true) {
					const cachedResult = await redisClient.get(collectionName);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				// Fetch result from the database
				const dbResult = await dbAdapter.findMany(collectionName, { status: { $ne: 'unpublished' } }, { sort: { createdAt: -1 } });

				// Convert dates to ISO strings
				dbResult.forEach((doc: any) => {
					doc.createdAt = new Date(doc.createdAt).toISOString();
					doc.updatedAt = new Date(doc.updatedAt).toISOString();
				});

				// Store the DB result in Redis for future requests
				if (privateEnv.USE_REDIS === true) {
					await redisClient.set(collectionName, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour
				}

				return dbResult;
			} catch (error) {
				logger.error(`Error fetching data for ${collectionName}:`, error);
				throw error;
			}
		};
	}

	return resolvers.Query;
}
