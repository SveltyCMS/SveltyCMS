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

// Permissions
import { hasCollectionPermission } from '@api/permissions';

// Types
import type { User } from '@src/auth/types';

/**
 * Creates a clean GraphQL type name from collection info
 * Uses collection name + short UUID suffix for uniqueness and readability
 */
function createCleanTypeName(collection: Collection): string {
	// Get the last part of the collection name (after any slashes)
	const baseName = collection.name.split('/').pop() || collection.name;
	// Clean the name: remove spaces, special chars, and convert to PascalCase
	const cleanName = baseName
		.replace(/[^a-zA-Z0-9]/g, '')
		.replace(/^[0-9]/, 'Collection$&') // Handle names starting with numbers
		.replace(/^\w/, (c) => c.toUpperCase()); // Ensure starts with uppercase

	// Use first 8 characters of UUID for uniqueness while keeping it readable
	const shortId = collection._id.substring(0, 8);

	return `${cleanName}_${shortId}`;
}

interface CollectionField {
	widget: {
		Name: string;
	};
	extract?: boolean;
	fields?: CollectionField[];
	label?: string;
}

interface Collection {
	_id: string;
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
	logger.debug(
		`Collections loaded for GraphQL:`,
		collections.map((c) => ({
			name: c.name,
			id: c._id,
			cleanTypeName: createCleanTypeName(c)
		}))
	);

	// Track all type names to detect duplicates
	const typeIDs = new Set<string>();
	const typeDefsSet = new Set<string>();
	const resolvers: ResolverContext = { Query: {} };
	const collectionSchemas: string[] = [];

	// Create a mapping from collection names to clean type names for relation widgets
	const collectionNameMapping = new Map<string, string>();
	for (const collection of collections as Collection[]) {
		const cleanTypeName = createCleanTypeName(collection);
		collectionNameMapping.set(collection.name, cleanTypeName);
	}

	for (const collection of collections as Collection[]) {
		logger.debug(`Processing collection: \x1b[34m${collection.name}\x1b[0m, _id: \x1b[34m${collection._id}\x1b[0m`);
		const cleanTypeName = createCleanTypeName(collection);
		logger.debug(`Clean type name: \x1b[34m${cleanTypeName}\x1b[0m`);
		resolvers[cleanTypeName] = {};
		// Start with type definition but no fields yet
		let collectionSchema = `
            type ${cleanTypeName} {
        `;

		// First, add all the collection-specific data fields
		for (const field of collection.fields) {
			const widget = widgets[field.widget.Name];
			if (!widget || !widget.GraphqlSchema) {
				logger.warn(`Widget schema not found for: ${field.widget.Name}`);
				continue;
			}

			const schema = widget.GraphqlSchema({
				field,
				label: `${cleanTypeName}_${getFieldName(field)}`, // Make type ID unique with clean naming
				collection,
				collectionNameMapping // Pass the mapping for relation widgets
			}) as WidgetSchema | undefined;

			if (!schema) {
				logger.error(`No schema returned for widget: ${field.widget.Name}`);
				continue;
			}

			// logger.debug(`Widget schema for ${field.widget.Name}:`, schema);

			if (schema.resolver) {
				deepmerge(resolvers, { [cleanTypeName]: schema.resolver });
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
						label: `${cleanTypeName}_${getFieldName(_field)}`, // Make nested type ID unique with clean naming
						collection,
						collectionNameMapping // Pass the mapping for relation widgets
					});

					if (nestedSchema) {
						if (!typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
							logger.debug(`Added nested type: ${nestedSchema.typeID}`);
						}
						collectionSchema += `                ${getFieldName(_field)}: ${nestedSchema.typeID}\n`;
						deepmerge(resolvers[cleanTypeName], {
							[getFieldName(_field)]: (parent: DocumentWithFields) => parent[getFieldName(_field)]
						});
					} else {
						logger.warn(`Nested schema not found for field: ${getFieldName(_field)}`);
					}
				}
			} else {
				collectionSchema += `                ${getFieldName(field)}: ${schema.typeID}\n`;
				deepmerge(resolvers[cleanTypeName], {
					[getFieldName(field)]: (parent: DocumentWithFields) => parent[getFieldName(field)]
				});
			}
		}

		// Then add the system/metadata fields at the end
		collectionSchema += `
                _id: String
				status: String
                createdAt: String
                updatedAt: String
                createdBy: String
                updatedBy: String
            }`;

		// Debug: Log the generated schema
		logger.debug(`Generated schema for ${cleanTypeName}:`, collectionSchema);

		collectionSchemas.push(collectionSchema + '\n');
	}

	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');
	// logger.debug('Final GraphQL TypeDefs:', finalTypeDefs);
	// logger.debug('Final Resolvers keys:', Object.keys(resolvers));

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

		const cleanTypeName = createCleanTypeName(collection);
		// Add pagination to the resolver using clean type name
		resolvers.Query[cleanTypeName] = async (_: unknown, args: { pagination: { page: number; limit: number } }, context: { user?: User }) => {
			// Check collection permissions
			if (!context.user) {
				logger.warn(`GraphQL: No user in context for collection ${collection._id}`);
				throw new Error('Authentication required');
			}

			if (!hasCollectionPermission(context.user, collection._id, 'read')) {
				logger.warn(`GraphQL: User ${context.user._id} denied access to collection ${collection._id}`);
				throw new Error(`Access denied: Insufficient permissions for collection '${collection.name}'`);
			}

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
				// For testing: show all records regardless of status
				// In production, you might want to filter by status
				const query = {};
				const options = { limit, offset: skip };
				const dbResult = await dbAdapter.crud.findMany(collection._id, query, options);
				logger.debug(`GraphQL Query Debug for ${collection._id}:`, {
					collectionName: collection.name,
					collectionId: collection._id,
					cleanTypeName: createCleanTypeName(collection),
					query,
					options,
					success: dbResult.success,
					dataType: typeof dbResult.data,
					isArray: Array.isArray(dbResult.data),
					dataLength: dbResult.data?.length,
					error: dbResult.error
				});

				if (!dbResult.success) {
					logger.error(`Database query failed for ${collection._id}:`, dbResult.error);
					throw new Error(`Database query failed: ${dbResult.error?.message || 'Unknown error'}`);
				}

				// Ensure dbResult.data is an array
				let resultArray: DocumentBase[];
				if (Array.isArray(dbResult.data)) {
					resultArray = dbResult.data as DocumentBase[];
				} else {
					logger.warn(`Unexpected database result format for ${collection._id}:`, dbResult.data);
					resultArray = [];
				}

				// Process dates
				resultArray.forEach((doc: DocumentBase) => {
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
					await cacheClient.set(cacheKey, JSON.stringify(resultArray), 'EX', 60 * 60);
					logger.debug(`Cache set for ${cacheKey}`);
				}

				return resultArray;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logger.error(`Error fetching data for ${collection._id}: ${errorMessage}`);
				throw new Error(`Failed to fetch data for ${collection._id}: ${errorMessage}`);
			}
		};
	}

	return resolvers;
}
