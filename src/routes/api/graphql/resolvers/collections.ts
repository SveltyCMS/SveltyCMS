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

// Registers collection schemas dynamically.
export async function registerCollections() {
	await contentManager.initialize(); // Ensure ContentManager is initialized
	const collections = contentManager.loadedCollections;
	logger.debug(`Collections fetched: ${collections.map((c) => c.name).join(', ')}`);

	// Track all type names to detect duplicates
	const typeIDs = new Set<string>();
	const typeDefsSet = new Set<string>();
	const resolvers: ResolverContext = { Query: {} };
	const collectionSchemas: string[] = [];

	for (const collection of collections as Collection[]) {
		if (!collection._id) {
			logger.error('Collection ID is undefined:', collection);
			continue;
		}

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
				logger.warn(`Widget schema not found or missing GraphqlSchema for widget: ${field.widget.Name}`);
				continue;
			}

			const schema = widget.GraphqlSchema({
				field,
				label: getFieldName(field, true),
				collection
			}) as WidgetSchema | undefined;

			if (schema?.resolver) {
				// deepmerge correctly merges resolvers without duplication of functions, but objects within objects
				deepmerge(resolvers, { [collection._id]: schema.resolver });
			}

			if (schema) {
				// Add the main type ID from the schema if not already present
				if (!typeIDs.has(schema.typeID)) {
					typeIDs.add(schema.typeID);
				} else {
					logger.warn(`Duplicate type ID detected from schema.typeID: ${schema.typeID}`);
				}

				// Split graphql string into individual type definitions and add them
				schema.graphql.split(/(?=type\s+\w+\s*{)/).forEach((typeDefinition) => {
					// Trim to remove any leading/trailing whitespace
					const trimmedTypeDefinition = typeDefinition.trim();
					if (trimmedTypeDefinition) {
						// Ensure it's not an empty string
						// Extract the type ID from the definition
						const typeMatch = trimmedTypeDefinition.match(/type\s+(\w+)/);
						if (typeMatch && typeMatch[1]) {
							const extractedTypeId = typeMatch[1];
							if (!typeIDs.has(extractedTypeId)) {
								typeIDs.add(extractedTypeId);
								typeDefsSet.add(trimmedTypeDefinition);
							} else {
								logger.warn(`Duplicate type ID definition detected from graphql string: ${extractedTypeId}`);
							}
						} else {
							logger.warn(`Could not extract type ID from: ${trimmedTypeDefinition.substring(0, 50)}...`);
						}
					}
				});

				if (field.extract && field.fields && field.fields.length > 0) {
					for (const _field of field.fields) {
						const nestedSchema = widgets[_field.widget.Name]?.GraphqlSchema?.({
							field: _field,
							label: getFieldName(_field, true),
							collection
						});

						if (nestedSchema) {
							// Ensure the nested schema's typeID is registered
							if (!typeIDs.has(nestedSchema.typeID)) {
								logger.warn(`Referenced type ID not found for nested field: ${nestedSchema.typeID}. This might indicate a missing type definition.`);
								// Optionally, add it here if it's expected to be a new type
								// typeIDs.add(nestedSchema.typeID);
								// typeDefsSet.add(nestedSchema.graphql); // This assumes nestedSchema.graphql is a complete type definition
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
				throw Error('Database adapter is not initialized');
			}

			const { page = 1, limit = 50 } = args.pagination || {};
			const skip = (page - 1) * limit;

			try {
				const cacheKey = `${collection._id}:${page}:${limit}`;

				// Try to get from cache first
				if (privateEnv.USE_REDIS === true && cacheClient) {
					const cachedResult = await cacheClient.get(cacheKey);
					if (cachedResult) {
						logger.debug(`Cache hit for collection: ${collection._id}, page: ${page}, limit: ${limit}`);
						return JSON.parse(cachedResult);
					}
				}

				// Query database
				const query = { status: { $ne: 'unpublished' } };
				const options = { sort: { createdAt: -1 }, skip, limit };
				const dbResult = await dbAdapter.crud.findMany(collection._id, query, options);

				// Process dates
				dbResult.forEach((doc: DocumentBase) => {
					try {
						doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
						doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						logger.warn(`Date conversion failed for document in ${collection._id}: ${errorMessage}`);
						doc.createdAt = new Date().toISOString();
						doc.updatedAt = doc.createdAt;
					}
				});

				// Cache the result
				if (privateEnv.USE_REDIS === true && cacheClient) {
					await cacheClient.set(cacheKey, JSON.stringify(dbResult), 'EX', 60 * 60); // 1 hour cache
					logger.debug(`Cache set for collection: ${collection._id}, page: ${page}, limit: ${limit}`);
				}

				return dbResult;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logger.error(`Error fetching data for collection ${collection._id}: ${errorMessage}`);
				throw error;
			}
		};
	}

	return resolvers.Query;
}
