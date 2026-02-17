/**
 * @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the CMS configuration
 * - Generate GraphQL type definitions and resolvers for each collection
 * - Handle complex field types and nested structures
 * - Integrate with Redis for caching (via CacheService, tenent-aware)
 * - Apply token replacement for string fields
 *
 * Features:
 * - Dynamic schema generation based on widget configurations
 * - Support for extracted fields and nested structures
 * - Integration with custom widget schemas
 * - Redis caching for improved performance (following Architecture Standard)
 * - Error handling and logging
 *
 * Usage:
 * Used by the main GraphQL setup to generate collection-specific schemas and resolvers
 */

// Collection Manager
import { modifyRequest } from '@api/collections/modifyRequest';
import { contentManager } from '@src/content/ContentManager';
import type { FieldInstance, Schema } from '@src/content/types';
// Types
import type { User } from '@src/databases/auth/types';
import type { CollectionModel, DatabaseAdapter } from '@src/databases/dbInterface';
import { getPrivateSettingSync } from '@src/services/settingsService';
// Token Engine
import { replaceTokens } from '@src/services/token/engine';
import type { TokenContext } from '@src/services/token/types';
import { widgets } from '@stores/widgetStore.svelte.ts';

// System Logger
import { logger } from '@utils/logger.server';
import { getFieldName } from '@utils/utils';
// deepmerge import removed
import type { GraphQLFieldResolver } from 'graphql';

// Helper to extract localized value
function getLocalizedValue(value: unknown, locale = 'en'): unknown {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		// Check if it looks like a localized object (keys are language codes)
		const valObj = value as Record<string, unknown>;
		if (locale in valObj) {
			return valObj[locale];
		}
		// Fallback to 'en' or first key
		if ('en' in valObj) {
			return valObj.en;
		}
		const keys = Object.keys(valObj);
		if (keys.length > 0) {
			return valObj[keys[0]];
		}
	}
	return value;
}

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
	resolver?: Record<string, GraphQLFieldResolver<unknown, unknown>>;
	typeID: string;
	typeName: string;
}

interface DocumentBase {
	_id: string;
	createdAt: string;
	updatedAt: string;
	[key: string]: unknown;
}

interface ResolverContext {
	Query: Record<string, GraphQLFieldResolver<unknown, unknown>>;
	[key: string]: Record<string, GraphQLFieldResolver<unknown, unknown>>;
}

// Interface compatible with CacheService wrapper
interface CacheClient {
	get(key: string, tenantId?: string): Promise<string | null>;
	set(key: string, value: string, ex: string, duration: number, tenantId?: string): Promise<unknown>;
}

// Registers collection schemas dynamically, now tenant-aware
export async function registerCollections(tenantId?: string) {
	await contentManager.initialize(tenantId);
	const collections: Schema[] = await contentManager.getCollections(tenantId);

	// Use lightweight metadata instead of full schemas where possible
	const collectionStats = await Promise.all(
		(await contentManager.getCollections(tenantId)).map(async (col) => ({
			...col,
			stats: contentManager.getCollectionStats(col._id!, tenantId)
		}))
	);

	logger.debug(
		'Collections loaded for GraphQL:',
		collectionStats.map((c) => ({
			name: typeof c.name === 'string' ? c.name : '',
			id: c._id,
			cleanTypeName: createCleanTypeName({ _id: c._id, name: typeof c.name === 'string' ? c.name : '' }),
			fieldCount: c.stats?.fieldCount
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
				continue; // Skip fields with missing widget names silently
			}

			// Get widget functions map - Correctly accessed from store
			const widgetFunctionsMap = widgets.widgetFunctions;

			// Try exact match first, then try camelCase conversion, then lowercase fallback
			let widget = widgetFunctionsMap[widgetNameRaw];

			if (!widget) {
				const camelName = widgetNameRaw.charAt(0).toLowerCase() + widgetNameRaw.slice(1);
				widget = widgetFunctionsMap[camelName];
			}

			if (!widget) {
				const lowerName = widgetNameRaw.toLowerCase();
				widget = widgetFunctionsMap[lowerName];
			}

			if (!widget) {
				// Log warning but continue, missing widget shouldn't break entire API
				const availableWidgets = Object.keys(widgetFunctionsMap).length;
				logger.warn(`Widget not found: ${widgetNameRaw} (Available: ${availableWidgets})`);
				continue;
			}

			if (typeof widget.GraphqlSchema !== 'function') {
				continue;
			}
			const schema = widget.GraphqlSchema({
				field,
				label: `${cleanTypeName}_${getFieldName(field)}`,
				collection,
				collectionNameMapping
			}) as WidgetSchema | undefined;

			if (!schema) {
				continue;
			}

			if (schema.resolver) {
				Object.assign(resolvers[cleanTypeName], schema.resolver);
			}

			// Only add to typeDefsSet if there's actual GraphQL schema content
			if (schema.graphql?.trim() && !typeIDs.has(schema.typeID)) {
				typeIDs.add(schema.typeID);
				typeDefsSet.add(schema.graphql);
			} else if (!schema.graphql?.trim()) {
				typeIDs.add(schema.typeID);
			} else if (typeIDs.has(schema.typeID)) {
				// Duplicate type ID warning suppressed
			}

			// Nested Fields Logic
			if (
				'extract' in field &&
				Array.isArray((field as FieldInstance & { fields?: FieldInstance[] }).fields) &&
				(field as FieldInstance & { fields?: FieldInstance[] }).fields?.length > 0
			) {
				for (const _field of (field as FieldInstance & { fields?: FieldInstance[] }).fields!) {
					const nestedWidgetNameRaw = _field.widget?.Name;
					if (!nestedWidgetNameRaw || typeof nestedWidgetNameRaw !== 'string') {
						continue;
					}

					const widgetFunctionsMap = widgets.widgetFunctions;
					let nestedWidget = widgetFunctionsMap[nestedWidgetNameRaw];

					if (!nestedWidget) {
						const camelName = nestedWidgetNameRaw.charAt(0).toLowerCase() + nestedWidgetNameRaw.slice(1);
						nestedWidget = widgetFunctionsMap[camelName];
					}

					if (!nestedWidget) {
						const lowerName = nestedWidgetNameRaw.toLowerCase();
						nestedWidget = widgetFunctionsMap[lowerName];
					}

					if (!nestedWidget || typeof nestedWidget.GraphqlSchema !== 'function') {
						continue;
					}

					const nestedSchema = nestedWidget.GraphqlSchema({
						field: _field,
						label: `${cleanTypeName}_${getFieldName(_field)}`,
						collection,
						collectionNameMapping
					});

					if (nestedSchema?.typeID) {
						if (nestedSchema.graphql?.trim() && !typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
						} else if (!nestedSchema.graphql?.trim()) {
							typeIDs.add(nestedSchema.typeID);
						}
						collectionSchema += `                ${getFieldName(_field)}: ${nestedSchema.typeID}\n`;

						// Robustly handle potentially localized data even if not marked translated
						const nestedResolverFn = (parent: Record<string, unknown>, _args: unknown, ctx: { locale: string }) =>
							getLocalizedValue(parent[getFieldName(_field)], ctx.locale);

						if (nestedResolverFn) {
							resolvers[cleanTypeName][getFieldName(_field)] = nestedResolverFn as GraphQLFieldResolver<unknown, unknown>;
						}
					}
				}
			} else {
				collectionSchema += `                ${getFieldName(field)}: ${schema.typeID}\n`;

				// Robustly handle potentially localized data even if not marked translated
				const resolverFn = (parent: Record<string, unknown>, _args: unknown, ctx: { locale: string }) =>
					getLocalizedValue(parent[getFieldName(field)], ctx.locale);

				if (resolverFn) {
					resolvers[cleanTypeName][getFieldName(field)] = resolverFn as GraphQLFieldResolver<unknown, unknown>;
				}
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

		collectionSchemas.push(`${collectionSchema}\n`);
	}

	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');

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
			const ctx = context as { user?: User; tenantId?: string; locale?: string };
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
			const locale = ctx.locale || 'en';

			try {
				const collectionStats = contentManager.getCollectionStats(collection._id!, ctx.tenantId);
				if (!collectionStats) {
					throw new Error(`Collection not found: ${collection._id}`);
				}

				// CACHE: Conforming to Cache Architecture (Category: Query)
				// Key: query:collections:{id}:{page}:{limit}:{locale}:{version}
				const contentVersion = contentManager.getContentVersion();
				const cacheKey = `query:collections:${collection._id}:${page}:${limit}:${locale}:${contentVersion}`;

				if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
					const cachedResult = await cacheClient.get(cacheKey, ctx.tenantId);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				// Query execution
				const query: Record<string, unknown> = {};
				if (getPrivateSettingSync('MULTI_TENANT') && ctx.tenantId) {
					query.tenantId = ctx.tenantId;
				}

				const collectionName = `collection_${collection._id}`;
				const queryBuilder = dbAdapter
					.queryBuilder(collectionName)
					.where(Object.keys(query).length ? query : {})
					.paginate({ page, pageSize: limit });
				const result = await queryBuilder.execute();

				if (!result.success) {
					throw new Error(`Database query failed: ${result.error?.message || 'Unknown error'}`);
				}

				const resultArray = (Array.isArray(result.data) ? result.data : []) as unknown as DocumentBase[];

				// Modify Request (Permissions & Computed Fields)
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
						logger.warn('GraphQL modifyRequest failed', {
							error: modifyError instanceof Error ? modifyError.message : 'Unknown error'
						});
					}
				}

				// Token Replacement
				const processedResults = await Promise.all(
					resultArray.map(async (doc) => {
						const tokenContext: TokenContext = {
							entry: doc,
							user: ctx.user
						};

						const processedDoc = { ...doc };
						for (const key in processedDoc) {
							if (!Object.hasOwn(processedDoc, key)) continue;
							const value = processedDoc[key];
							if (typeof value === 'string' && value.includes('{{')) {
								try {
									processedDoc[key] = await replaceTokens(value, tokenContext);
								} catch (err) {
									logger.warn(`Token replacement failed for field ${key}`, err);
								}
							}
						}
						return processedDoc;
					})
				);

				// Date Normalization
				for (const doc of processedResults) {
					doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
					doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
				}

				// CACHE SET: Category 'query' (Default TTL: 30m = 1800s)
				if (getPrivateSettingSync('USE_REDIS') && cacheClient) {
					await cacheClient.set(cacheKey, JSON.stringify(processedResults), 'EX', 1800, ctx.tenantId);
				}

				return processedResults;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logger.error(`Error fetching data for ${collection._id}: ${errorMessage}`);
				throw new Error(`Failed to fetch data for ${collection._id}: ${errorMessage}`);
			}
		};
	}

	return resolvers;
}
