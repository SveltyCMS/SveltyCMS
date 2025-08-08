/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the CMS configuration for a specific tenant
 * - Generate GraphQL type definitions and resolvers for each collection
 * - Handle complex field types and nested structures
 * - Integrate with Redis for caching (if enabled), now tenant-aware
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
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { GraphQLFieldResolver } from 'graphql';
import { privateEnv } from '@root/config/private';

// Collection Manager
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';

// Permissions

// Types
import type { User } from '@src/auth/types';

/**
 * Creates a clean GraphQL type name from collection info
 * Uses collection name + short UUID suffix for uniqueness and readability
 */
export function createCleanTypeName(collection: Collection): string {
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

// Registers collection schemas dynamically, now tenant-aware
export async function registerCollections(tenantId?: string) {
	await contentManager.initialize(tenantId);
	const collectionData = await contentManager.getCollectionData(tenantId);

	// Ensure collections exist and is an array
	const collections = collectionData?.collections || [];

	logger.debug(
		`Collections loaded for GraphQL:`,
		collections.map((c: Collection) => ({
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
		const cleanTypeName = createCleanTypeName(collection);
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
				label: `${cleanTypeName}_${getFieldName(field)}`,
				collection,
				collectionNameMapping
			}) as WidgetSchema | undefined;

			if (!schema) {
				logger.error(`No schema returned for widget: ${field.widget.Name}`);
				continue;
			}

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
						label: `${cleanTypeName}_${getFieldName(_field)}`,
						collection,
						collectionNameMapping
					});

					if (nestedSchema) {
						if (!typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
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

		collectionSchemas.push(collectionSchema + '\n');
	}

	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');

	return {
		typeDefs: finalTypeDefs,
		resolvers,
		collections
	};
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(
	dbAdapter: DatabaseAdapter,
	cacheClient: CacheClient | null,
	_privateEnv: { USE_REDIS?: boolean },
	tenantId?: string
) {
	const { resolvers, collections } = await registerCollections(tenantId);

	for (const collection of collections as Collection[]) {
		if (!collection._id) {
			logger.error('Collection ID is undefined:', collection);
			continue;
		}

		const cleanTypeName = createCleanTypeName(collection);
		resolvers.Query[cleanTypeName] = async (
			_: unknown,
			args: { pagination: { page: number; limit: number } },
			context: { user?: User; tenantId?: string }
		) => {
			if (!context.user) {
				throw new Error('Authentication required');
			}

			if (privateEnv.MULTI_TENANT && context.tenantId !== tenantId) {
				logger.error(`Resolver tenantId mismatch. Expected ${tenantId}, got ${context.tenantId}`);
				throw new Error('Internal server error: Tenant context mismatch.');
			}

			// Access validation is handled by hooks
			// The dbAdapter is now passed as an argument, so the check is for its presence.
			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}

			const { page = 1, limit = 50 } = args.pagination || {};

			try {
				const cacheKey = `${context.tenantId || 'global'}:${collection._id}:${page}:${limit}`;
				if (privateEnv.USE_REDIS && cacheClient) {
					const cachedResult = await cacheClient.get(cacheKey);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				const query: { tenantId?: string } = {};
				if (privateEnv.MULTI_TENANT && context.tenantId) {
					query.tenantId = context.tenantId;
				}

				// Use query builder pattern consistent with REST API
				const collectionName = `collection_${collection._id}`;
				const queryBuilder = dbAdapter.queryBuilder(collectionName).where(query).paginate({ page, pageSize: limit });

				const result = await queryBuilder.execute();

				if (!result.success) {
					throw new Error(`Database query failed: ${result.error?.message || 'Unknown error'}`);
				}

				const resultArray = (Array.isArray(result.data) ? result.data : []) as DocumentBase[];

				// Apply modifyRequest processing for consistency with REST API
				if (resultArray.length > 0) {
					try {
						await modifyRequest({
							data: resultArray,
							fields: collection.fields,
							collection: collection,
							user: context.user!,
							type: 'GET'
						});
					} catch (modifyError) {
						logger.warn(`GraphQL modifyRequest failed for collection ${collection._id}`, {
							error: modifyError instanceof Error ? modifyError.message : 'Unknown error',
							userId: context.user?._id,
							itemCount: resultArray.length
						});
					}
				}

				resultArray.forEach((doc: DocumentBase) => {
					doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
					doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
				});

				// Cache the result
				if (privateEnv.USE_REDIS && cacheClient) {
					await cacheClient.set(cacheKey, JSON.stringify(resultArray), 'EX', 60 * 60);
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
