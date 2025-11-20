/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the 	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');
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

import { getPrivateSettingSync } from '@src/services/settingsService';
import type { DatabaseAdapter, CollectionModel } from '@src/databases/dbInterface';
import { getFieldName } from '@utils/utils';
import { widgetFunctions } from '@stores/widgetStore.svelte';
import { get } from 'svelte/store';
import deepmerge from 'deepmerge';
import type { GraphQLFieldResolver } from 'graphql';

// Collection Manager
import { modifyRequest } from '@api/collections/modifyRequest';
import { contentManager } from '@src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.server';

// Permissions

// Types
import type { User } from '@src/databases/auth/types';
import type { Schema, FieldInstance } from '@src/content/types';

/**
 * Creates a clean GraphQL type name from collection info
 * Uses collection name + short UUID suffix for uniqueness and readability
 */
export function createCleanTypeName(collection: { _id?: string; name?: string | unknown }): string {
	const rawName = typeof collection.name === 'string' ? collection.name : '';
	const baseName = rawName.split('/').pop() || rawName;
	const cleanName = baseName
		.replace(/[^a-zA-Z0-9]/g, '')
		.replace(/^[0-9]/, 'Collection$&')
		.replace(/^[a-z]/, (c) => c.toUpperCase());
	const shortId = (collection._id ?? '').substring(0, 8);
	return `${cleanName}_${shortId}`;
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
	get(key: string, tenantId?: string): Promise<string | null>;
	set(key: string, value: string, ex: string, duration: number, tenantId?: string): Promise<unknown>;
}

// Registers collection schemas dynamically, now tenant-aware
export async function registerCollections(tenantId?: string) {
	await contentManager.initialize(tenantId);
	const collections: Schema[] = await contentManager.getCollections(tenantId);

	logger.debug(
		`Collections loaded for GraphQL:`,
		collections.map((c) => ({
			name: typeof c.name === 'string' ? c.name : '',
			id: c._id,
			cleanTypeName: createCleanTypeName({ _id: c._id, name: typeof c.name === 'string' ? c.name : '' })
		}))
	);

	const typeIDs = new Set<string>();
	const typeDefsSet = new Set<string>();
	const resolvers: ResolverContext = { Query: {} };
	const collectionSchemas: string[] = [];
	const collectionNameMapping = new Map<string, string>();
	for (const collection of collections) {
		const name = typeof collection.name === 'string' ? collection.name : '';
		const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
		collectionNameMapping.set(name, cleanTypeName);
	}

	for (const collection of collections) {
		const name = typeof collection.name === 'string' ? collection.name : '';
		const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
		resolvers[cleanTypeName] = {};
		let collectionSchema = `
			type ${cleanTypeName} {
		`;

		for (const field of collection.fields as FieldInstance[]) {
			const widgetNameRaw = field.widget?.Name;
			if (!widgetNameRaw || typeof widgetNameRaw !== 'string') {
				logger.warn('Widget name missing or not a string for field', field);
				continue;
			}

			// Get widget functions map
			const widgetFunctionsMap = get(widgetFunctions);

			// Try exact match first, then try camelCase conversion, then lowercase fallback
			let widget = widgetFunctionsMap[widgetNameRaw];
			let widgetName = widgetNameRaw;

			if (!widget) {
				// Try camelCase conversion (RemoteVideo → remoteVideo, PhoneNumber → phoneNumber)
				const camelName = widgetNameRaw.charAt(0).toLowerCase() + widgetNameRaw.slice(1);
				widget = widgetFunctionsMap[camelName];
				widgetName = camelName;
			}

			if (!widget) {
				// Try lowercase match as final fallback
				const lowerName = widgetNameRaw.toLowerCase();
				widget = widgetFunctionsMap[lowerName];
				widgetName = lowerName;
			}

			// Debug: Log available widget names if lookup fails
			if (!widget) {
				const availableWidgets = Object.keys(widgetFunctionsMap);
				const camelName = widgetNameRaw.charAt(0).toLowerCase() + widgetNameRaw.slice(1);
				logger.warn(`Widget not found: ${widgetNameRaw}`, {
					triedNames: [widgetNameRaw, camelName, widgetNameRaw.toLowerCase()],
					availableWidgets,
					availableCount: availableWidgets.length
				});
				continue;
			}

			if (typeof widget.GraphqlSchema !== 'function') {
				logger.warn(`Widget found but GraphqlSchema is missing for: ${widgetNameRaw} (key: ${widgetName})`);
				continue;
			}
			const schema = widget.GraphqlSchema({
				field,
				label: `${cleanTypeName}_${getFieldName(field)}`,
				collection,
				collectionNameMapping
			}) as WidgetSchema | undefined;

			if (!schema) {
				logger.error(`No schema returned for widget: ${widgetName}`);
				continue;
			}

			if (schema.resolver) {
				deepmerge(resolvers, { [cleanTypeName]: schema.resolver });
			}

			// Only add to typeDefsSet if there's actual GraphQL schema content
			// Skip empty strings and primitive types that don't need definitions
			if (schema.graphql && schema.graphql.trim() && !typeIDs.has(schema.typeID)) {
				typeIDs.add(schema.typeID);
				typeDefsSet.add(schema.graphql);
			} else if (!schema.graphql || !schema.graphql.trim()) {
				// Primitive types like Boolean, String, Int, Float don't need type definitions
				// Just track the typeID so we don't warn about duplicates
				typeIDs.add(schema.typeID);
			} else if (typeIDs.has(schema.typeID)) {
				logger.warn(`Duplicate type ID: ${schema.typeID}`);
			}

			if (
				'extract' in field &&
				Array.isArray((field as FieldInstance & { fields?: FieldInstance[] }).fields) &&
				(field as FieldInstance & { fields?: FieldInstance[] }).fields!.length > 0
			) {
				for (const _field of (field as FieldInstance & { fields?: FieldInstance[] }).fields!) {
					const nestedWidgetNameRaw = _field.widget?.Name;
					if (!nestedWidgetNameRaw || typeof nestedWidgetNameRaw !== 'string') {
						logger.warn('Nested widget name missing or not a string for field', _field);
						continue;
					}

					// Get widget functions map
					const widgetFunctionsMap = get(widgetFunctions);

					// Try exact match first, then try camelCase conversion, then lowercase fallback
					let nestedWidget = widgetFunctionsMap[nestedWidgetNameRaw];
					let nestedWidgetName = nestedWidgetNameRaw;

					if (!nestedWidget) {
						// Try camelCase conversion (RemoteVideo → remoteVideo, PhoneNumber → phoneNumber)
						const camelName = nestedWidgetNameRaw.charAt(0).toLowerCase() + nestedWidgetNameRaw.slice(1);
						nestedWidget = widgetFunctionsMap[camelName];
						nestedWidgetName = camelName;
					}

					if (!nestedWidget) {
						// Try lowercase match as final fallback
						const lowerName = nestedWidgetNameRaw.toLowerCase();
						nestedWidget = widgetFunctionsMap[lowerName];
						nestedWidgetName = lowerName;
					}

					if (!nestedWidget || typeof nestedWidget.GraphqlSchema !== 'function') {
						logger.warn(`Nested widget schema not found for: ${nestedWidgetNameRaw} (tried: ${nestedWidgetName})`);
						continue;
					}
					const nestedSchema = nestedWidget.GraphqlSchema({
						field: _field,
						label: `${cleanTypeName}_${getFieldName(_field)}`,
						collection,
						collectionNameMapping
					});

					if (nestedSchema) {
						// Only add to typeDefsSet if there's actual GraphQL schema content
						if (nestedSchema.graphql && nestedSchema.graphql.trim() && !typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
						} else if (!nestedSchema.graphql || !nestedSchema.graphql.trim()) {
							// Primitive types don't need definitions
							typeIDs.add(nestedSchema.typeID);
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

	logger.debug('GraphQL schema generation complete', {
		typeDefsCount: typeDefsSet.size,
		collectionSchemasCount: collectionSchemas.length,
		collectionsWithFields: collections.filter((c) => (c.fields as FieldInstance[])?.length > 0).length,
		sampleTypeDefs: finalTypeDefs.substring(0, 1000) // First 1000 chars for debugging
	});

	return {
		typeDefs: finalTypeDefs,
		resolvers,
		collections
	};
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(dbAdapter: DatabaseAdapter, cacheClient: CacheClient | null, tenantId?: string) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const { resolvers, collections } = await registerCollections(tenantId);

	for (const collection of collections) {
		if (!collection._id) {
			logger.error('Collection ID is undefined:', collection);
			continue;
		}

		const name = typeof collection.name === 'string' ? collection.name : '';
		const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
		resolvers.Query[cleanTypeName] = async function resolver(
			_parent: unknown,
			args: { pagination?: { page?: number; limit?: number } },
			context: unknown
		): Promise<DocumentBase[]> {
			// Type guard for context
			const ctx = context as { user?: User; tenantId?: string };
			if (!ctx.user) {
				throw new Error('Authentication required');
			}

			if (getPrivateSettingSync('MULTI_TENANT') && ctx.tenantId !== tenantId) {
				logger.error(`Resolver tenantId mismatch. Expected ${tenantId}, got ${ctx.tenantId}`);
				throw new Error('Internal server error: Tenant context mismatch.');
			}

			if (!dbAdapter) {
				throw new Error('Database adapter is not initialized');
			}

			const { page = 1, limit = 50 } = args.pagination || {};

			try {
				const cacheKey = `collections:${collection._id}:${page}:${limit}`;
				if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
					const cachedResult = await cacheClient.get(cacheKey, ctx.tenantId);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				// Query builder expects a filter object, but only known fields
				const query: Record<string, unknown> = {};
				if (getPrivateSettingSync('MULTI_TENANT') && ctx.tenantId) {
					query.tenantId = ctx.tenantId;
				}

				const collectionName = `collection_${collection._id}`;
				// Use empty filter if query is empty
				const queryBuilder = dbAdapter
					.queryBuilder(collectionName)
					.where(Object.keys(query).length ? query : {})
					.paginate({ page, pageSize: limit });
				const result = await queryBuilder.execute();

				if (!result.success) {
					throw new Error(`Database query failed: ${result.error?.message || 'Unknown error'}`);
				}

				// Use unknown first, then cast
				const resultArray = (Array.isArray(result.data) ? result.data : []) as unknown as DocumentBase[];

				if (resultArray.length > 0) {
					try {
						await modifyRequest({
							data: resultArray,
							fields: collection.fields as FieldInstance[],
							collection: collection as unknown as CollectionModel,
							user: ctx.user!,
							type: 'GET'
						});
					} catch (modifyError) {
						logger.warn(`GraphQL modifyRequest failed for collection ${collection._id}`, {
							error: modifyError instanceof Error ? modifyError.message : 'Unknown error',
							userId: ctx.user?._id,
							itemCount: resultArray.length
						});
					}
				}

				resultArray.forEach((doc: DocumentBase) => {
					doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
					doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
				});

				if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
					await cacheClient.set(cacheKey, JSON.stringify(resultArray), 'EX', 60 * 60, ctx.tenantId);
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
