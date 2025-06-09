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

import widgets from '@widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';
import { dbAdapter } from '@src/databases/db';
import type { GraphQLFieldResolver } from 'graphql';

// Collection Manager
import { contentManager } from '@src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.svelte';

interface CollectionField {
	widget: {
		Name: string;
	};
	extract?: boolean;
	fields?: CollectionField[];
	label?: string;
}

interface Collection {
	id: string;
	name: string;
	fields: CollectionField[];
}

interface WidgetSchema {
	graphql: string;
	typeID: string;
	typeName: string;
	resolver?: Record<string, GraphQLFieldResolver<unknown, unknown>>;
}

interface DocumentBase {
	_id: string;
	createdAt: string;
	updatedAt: string;
	[key: string]: unknown;
}

// Type for document with extracted fields
interface DocumentWithFields extends DocumentBase {
	[fieldName: string]: unknown;
}

interface ResolverContext {
	Query: Record<string, GraphQLFieldResolver<unknown, unknown>>;
	[key: string]: Record<string, GraphQLFieldResolver<unknown, unknown>>;
}

// Define a generic cache interface instead of depending on Redis
interface CacheClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ex: string, duration: number): Promise<unknown>;
}

// Registers collection schemas dynamically
export async function registerCollections() {
	await contentManager.initialize();
	const collections = contentManager.loadedCollections.filter((c: Collection) => {
		if (!c._id) {
			logger.error('Skipping collection with undefined ID:', c);
			return false;
		}
		return true;
	});
	// logger.debug(`Collections fetched: ${collections.map((c) => c.name).join(', ')}`);

	// Track all type names to detect duplicates
	const typeIDs = new Set<string>();
	const typeDefsSet = new Set<string>();
	const resolvers: ResolverContext = { Query: {} };
	const collectionSchemas: string[] = [];

	for (const collection of collections as Collection[]) {
		resolvers[collection._id] = {};
		let collectionSchema = `
            type ${collection._id} {
                _id: String
                name: String
                createdAt: String
                updatedAt: String
        `;

		for (const field of collection.fields) {
			const widget = widgets[field.widget.Name];
			if (!widget || !widget.GraphqlSchema) {
				logger.warn(`Widget schema not found for: ${field.widget.Name}`);
				continue;
			}

			const schema = widget.GraphqlSchema({
				field,
				label: getFieldName(field, true),
				collection
			}) as WidgetSchema | undefined;

			if (!schema) {
				logger.error(`No schema returned for widget: ${field.widget.Name}`);
				continue;
			}

			// logger.debug(`Widget schema for ${field.widget.Name}:`, schema);

			if (schema.resolver) {
				deepmerge(resolvers, { [collection._id]: schema.resolver });
			}

			// Add main type
			if (!typeIDs.has(schema.typeID)) {
				typeIDs.add(schema.typeID);
				typeDefsSet.add(schema.graphql);
			} else {
				logger.warn(`Duplicate type ID: ${schema.typeID}`);
			}

			if (field.extract && field.fields && field.fields.length > 0) {
				for (const _field of field.fields) {
					const nestedSchema = widgets[_field.widget.Name]?.GraphqlSchema?.({
						field: _field,
						label: getFieldName(_field, true),
						collection
					});

					if (nestedSchema) {
						if (!typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
							logger.debug(`Added nested type: ${nestedSchema.typeID}`);
						}
						collectionSchema += `${getFieldName(_field, true)}: ${nestedSchema.typeID}\n`;
						deepmerge(resolvers[collection._id], {
							[getFieldName(_field, true)]: (parent: DocumentWithFields) => parent[getFieldName(_field)]
						});
					} else {
						logger.warn(`Nested schema not found for field: ${getFieldName(_field, true)}`);
					}
				}
			} else {
				collectionSchema += `${getFieldName(field, true)}: ${schema.typeID}\n`;
				deepmerge(resolvers[collection._id], {
					[getFieldName(field, true)]: (parent: DocumentWithFields) => parent[getFieldName(field)]
				});
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

	const finalTypeDefs = paginationArgs + Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');
	//logger.debug('Final GraphQL TypeDefs:', finalTypeDefs);

	return {
		typeDefs: finalTypeDefs,
		resolvers,
		collections
	};
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(cacheClient: CacheClient | null, privateEnv: { USE_REDIS?: boolean }) {
	const { resolvers, collections } = await registerCollections();

	for (const collection of collections as Collection[]) {
		if (!collection._id) {
			logger.error('Collection ID is undefined:', collection);
			continue;
		}

		// Add pagination to the resolver
		resolvers.Query[collection._id] = async (_: unknown, args: { pagination: { page: number; limit: number } }) => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}

			const { page = 1, limit = 50 } = args.pagination || {};
			const skip = (page - 1) * limit;
			//logger.debug(`Querying ${collection._id} with page: ${page}, limit: ${limit}, skip: ${skip}`);

			try {
				const cacheKey = `${collection._id}:${page}:${limit}`;
				// Try to get from cache first
				if (privateEnv.USE_REDIS && cacheClient) {
					const cachedResult = await cacheClient.get(cacheKey);
					if (cachedResult) {
						logger.debug(`Cache hit for ${cacheKey}`);
						return JSON.parse(cachedResult);
					}
				}

				// Query database
				const query = { status: { $ne: 'unpublished' } };
				const options = { sort: { createdAt: -1 }, skip, limit };
				const dbResult = await dbAdapter.crud.findMany(collection._id, query, options);
				//logger.debug(`Database result for ${collection._id}:`, dbResult);

				// Process dates
				dbResult.forEach((doc: DocumentBase) => {
					try {
						doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
						doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
					} catch (error) {
						logger.warn(`Date conversion failed for document in ${collection._id}:`, error);
						doc.createdAt = new Date().toISOString();
						doc.updatedAt = doc.createdAt;
					}
				});

				// Cache the result
				if (privateEnv.USE_REDIS && cacheClient) {
					await cacheClient.set(cacheKey, JSON.stringify(dbResult), 'EX', 60 * 60);
					logger.debug(`Cache set for ${cacheKey}`);
				}

				return dbResult;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logger.error(`Error fetching data for ${collection._id}: ${errorMessage}`);
				throw new Error(`Failed to fetch data for ${collection._id}: ${errorMessage}`);
			}
		};
	}

	return resolvers.Query;
}
