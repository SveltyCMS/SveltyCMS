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
import { logger } from '@src/utils/logger';

interface Collection {
	name: string;
	fields: Array<{
		widget: {
			Name: string;
		};
		extract?: boolean;
		fields?: any[];
	}>;
}

interface WidgetSchema {
	graphql: string;
	typeName: string;
	resolver?: any;
}

// Registers collection schemas dynamically.
export async function registerCollections() {
	const collections = await getCollections();
	logger.debug(`Collections fetched: ${Object.keys(collections).join(', ')}`);

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
			const widget = widgets[field.widget.Name];
			if (!widget || !widget.GraphqlSchema) {
				logger.warn(`Widget schema not found or missing GraphqlSchema for widget: ${field.widget.Name}`);
				continue;
			}

			const schema = widget.GraphqlSchema({ field, label: getFieldName(field, true), collection }) as WidgetSchema | undefined;

			if (schema?.resolver) {
				deepmerge(resolvers, schema.resolver);
			}

			if (schema) {
				schema.graphql.split(/(?=type.*?{)/).forEach((type) => typeDefsSet.add(type));

				if (field.extract && field.fields?.length > 0) {
					for (const _field of field.fields) {
						const nestedSchema = widgets[_field.widget.Name]?.GraphqlSchema?.({
							field: _field,
							label: getFieldName(_field, true),
							collection
						});

						if (nestedSchema) {
							collectionSchema += `${getFieldName(_field, true)}: ${nestedSchema.typeName}\n`;
							deepmerge(resolvers[collection.name], {
								[getFieldName(_field, true)]: (parent: any) => parent[getFieldName(_field)]
							});
						} else {
							logger.warn(`Nested schema not found for field: ${getFieldName(_field, true)}`);
						}
					}
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

	// Add pagination arguments to the Query type
	const paginationArgs = `
        input PaginationInput {
            page: Int = 1
            limit: Int = 50
        }
    `;

	return {
		typeDefs: paginationArgs + Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n'),
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

		// Add pagination to the resolver
		resolvers.Query[collection.name] = async (_: any, args: { pagination: { page: number; limit: number } }) => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}

			const { page = 1, limit = 50 } = args.pagination || {};
			const skip = (page - 1) * limit;

			try {
				if (privateEnv.USE_REDIS === true && redisClient) {
					const cachedResult = await redisClient.get(`${collection.name}:${page}:${limit}`);
					if (cachedResult) {
						logger.debug(`Cache hit for collection: ${collection.name}, page: ${page}, limit: ${limit}`);
						return JSON.parse(cachedResult);
					}
				}

				const dbResult = await dbAdapter.findMany(collection.name, { status: { $ne: 'unpublished' } }, { sort: { createdAt: -1 }, skip, limit });

				dbResult.forEach((doc: any) => {
					doc.createdAt = new Date(doc.createdAt).toISOString();
					doc.updatedAt = new Date(doc.updatedAt).toISOString();
				});

				if (privateEnv.USE_REDIS === true && redisClient) {
					await redisClient.set(`${collection.name}:${page}:${limit}`, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour by default
					logger.debug(`Cache set for collection: ${collection.name}, page: ${page}, limit: ${limit}`);
				}

				return dbResult;
			} catch (error) {
				logger.error(`Error fetching data for collection ${collection.name}:`, error);
				throw error;
			}
		};
	}

	return resolvers.Query;
}
