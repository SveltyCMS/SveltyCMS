/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the CMS configuration
 * - Generate GraphQL type definitions and resolvers for each collection
 * - Handle complex field types and nested structures
 * - Integrate with Redis for caching (if enabled)
 *
 * Features:
 * - Dynamic schema generation based on widget configurations
 * - Support for extracted fields and nested structures
 * - Integration with custom widget schemas
 * - Redis caching for improved performance
 * - Error handling and logging
 *
 * Usage:
 * Used by the main GraphQL setup to generate collection-specific schemas and resolvers
 */

import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';
import { dbAdapter } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

interface Collection {
	name: string;
	fields: any[];
}

interface WidgetSchema {
	graphql: string;
	typeName: string;
	resolver?: any;
}

// Registers collection schemas dynamically.
export async function registerCollections() {
	const collections = await getCollections();
	const typeDefsSet = new Set<string>();
	const resolvers: { [key: string]: any } = { Query: {} };
	const collectionSchemas: string[] = [];

	for (const collection of Object.values(collections) as Collection[]) {
		if (!collection.name) {
			logger.error('Collection name is undefined:', collection);
			continue;
		}

		resolvers[collection.name] = {};
		let collectionSchema = `
            type ${collection.name} {
                _id: String
                createdAt: String
                updatedAt: String
        `;

		for (const field of collection.fields) {
			const schema = widgets[field.widget.Name].GraphqlSchema?.({ field, label: getFieldName(field, true), collection }) as WidgetSchema | undefined;

			if (schema?.resolver) {
				deepmerge(resolvers, schema.resolver);
			}

			if (schema) {
				schema.graphql.split(/(?=type.*?{)/).forEach((type) => typeDefsSet.add(type));

				if ('extract' in field && field.extract && 'fields' in field && field.fields.length > 0) {
					field.fields.forEach((_field: any) => {
						const fieldSchema = widgets[_field.widget.Name].GraphqlSchema?.({
							field: _field,
							label: getFieldName(_field, true),
							collection
						});
						collectionSchema += `${getFieldName(_field, true)}: ${fieldSchema?.typeName}\n`;
						deepmerge(resolvers[collection.name], {
							[getFieldName(_field, true)]: (parent: any) => parent[getFieldName(_field)]
						});
					});
				} else {
					collectionSchema += `${getFieldName(field, true)}: ${schema.typeName}\n`;
					deepmerge(resolvers[collection.name], {
						[getFieldName(field, true)]: (parent: any) => parent[getFieldName(field)]
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

	for (const collection of Object.values(collections) as Collection[]) {
		if (!collection.name) {
			logger.error('Collection name is undefined:', collection);
			continue;
		}

		resolvers.Query[collection.name] = async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}

			try {
				if (privateEnv.USE_REDIS === true) {
					const cachedResult = await redisClient.get(collection.name);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				const dbResult = await dbAdapter.findMany(collection.name, { status: { $ne: 'unpublished' } }, { sort: { createdAt: -1 } });

				dbResult.forEach((doc: any) => {
					doc.createdAt = new Date(doc.createdAt).toISOString();
					doc.updatedAt = new Date(doc.updatedAt).toISOString();
				});

				if (privateEnv.USE_REDIS === true) {
					await redisClient.set(collection.name, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour
				}

				return dbResult;
			} catch (error) {
				logger.error(`Error fetching data for ${collection.name}:`, error);
				throw error;
			}
		};
	}

	return resolvers.Query;
}
