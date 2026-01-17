import { C as CacheCategory } from '../../../../chunks/CacheCategory.js';
import { b as building } from '../../../../chunks/environment.js';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { createYoga, createSchema } from 'graphql-yoga';
import { g as getFieldName } from '../../../../chunks/utils.js';
import { widgets } from '../../../../chunks/widgetStore.svelte.js';
import deepmerge from 'deepmerge';
import { m as modifyRequest } from '../../../../chunks/modifyRequest.js';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { r as replaceTokens } from '../../../../chunks/engine.js';
import { l as logger } from '../../../../chunks/logger.server.js';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { cacheService } from '../../../../chunks/CacheService.js';
import { r as registerPermission, h as hasPermissionWithRoles } from '../../../../chunks/permissions.js';
import { P as PermissionType, a as PermissionAction } from '../../../../chunks/types.js';
import { pubSub } from '../../../../chunks/pubSub.js';
function getLocalizedValue(value, locale = 'en') {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const valObj = value;
		if (locale in valObj) {
			return valObj[locale];
		}
		if ('en' in valObj) {
			return valObj['en'];
		}
		const keys = Object.keys(valObj);
		if (keys.length > 0) {
			return valObj[keys[0]];
		}
	}
	return value;
}
function createCleanTypeName(collection) {
	const rawName = typeof collection.name === 'string' ? collection.name : '';
	const baseName = rawName.split('/').pop() || rawName;
	const cleanName = baseName
		.replace(/[^a-zA-Z0-9]/g, '')
		.replace(/^[0-9]/, 'Collection$&')
		.replace(/^[a-z]/, (c) => c.toUpperCase());
	const shortId = (collection._id ?? '').substring(0, 8);
	return `${cleanName}_${shortId}`;
}
async function registerCollections(tenantId) {
	await contentManager.initialize(tenantId);
	const collections = await contentManager.getCollections(tenantId);
	const collectionStats = await Promise.all(
		(await contentManager.getCollections(tenantId)).map(async (col) => ({
			...col,
			stats: contentManager.getCollectionStats(col._id, tenantId)
		}))
	);
	logger.debug(
		`Collections loaded for GraphQL:`,
		collectionStats.map((c) => ({
			name: typeof c.name === 'string' ? c.name : '',
			id: c._id,
			cleanTypeName: createCleanTypeName({ _id: c._id, name: typeof c.name === 'string' ? c.name : '' }),
			fieldCount: c.stats?.fieldCount
		}))
	);
	const typeIDs = /* @__PURE__ */ new Set();
	const typeDefsSet = /* @__PURE__ */ new Set();
	const resolvers = { Query: {} };
	const collectionSchemas = [];
	const collectionNameMapping = /* @__PURE__ */ new Map();
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
		for (const field of collection.fields) {
			const widgetNameRaw = field.widget?.Name;
			if (!widgetNameRaw || typeof widgetNameRaw !== 'string') {
				continue;
			}
			const widgetFunctionsMap = widgets.widgetFunctions;
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
			});
			if (!schema) {
				continue;
			}
			if (schema.resolver) {
				deepmerge(resolvers, { [cleanTypeName]: schema.resolver });
			}
			if (schema.graphql && schema.graphql.trim() && !typeIDs.has(schema.typeID)) {
				typeIDs.add(schema.typeID);
				typeDefsSet.add(schema.graphql);
			} else if (!schema.graphql || !schema.graphql.trim()) {
				typeIDs.add(schema.typeID);
			} else if (typeIDs.has(schema.typeID));
			if ('extract' in field && Array.isArray(field.fields) && field.fields.length > 0) {
				for (const _field of field.fields) {
					const nestedWidgetNameRaw = _field.widget?.Name;
					if (!nestedWidgetNameRaw || typeof nestedWidgetNameRaw !== 'string') continue;
					const widgetFunctionsMap2 = widgets.widgetFunctions;
					let nestedWidget = widgetFunctionsMap2[nestedWidgetNameRaw];
					if (!nestedWidget) {
						const camelName = nestedWidgetNameRaw.charAt(0).toLowerCase() + nestedWidgetNameRaw.slice(1);
						nestedWidget = widgetFunctionsMap2[camelName];
					}
					if (!nestedWidget) {
						const lowerName = nestedWidgetNameRaw.toLowerCase();
						nestedWidget = widgetFunctionsMap2[lowerName];
					}
					if (!nestedWidget || typeof nestedWidget.GraphqlSchema !== 'function') continue;
					const nestedSchema = nestedWidget.GraphqlSchema({
						field: _field,
						label: `${cleanTypeName}_${getFieldName(_field)}`,
						collection,
						collectionNameMapping
					});
					if (nestedSchema && nestedSchema.typeID) {
						if (nestedSchema.graphql && nestedSchema.graphql.trim() && !typeIDs.has(nestedSchema.typeID)) {
							typeIDs.add(nestedSchema.typeID);
							typeDefsSet.add(nestedSchema.graphql);
						} else if (!nestedSchema.graphql || !nestedSchema.graphql.trim()) {
							typeIDs.add(nestedSchema.typeID);
						}
						collectionSchema += `                ${getFieldName(_field)}: ${nestedSchema.typeID}
`;
						const nestedResolverFn = _field.translated ? (parent, _args, ctx) => getLocalizedValue(parent[getFieldName(_field)], ctx.locale) : void 0;
						if (nestedResolverFn) {
							deepmerge(resolvers[cleanTypeName], {
								[getFieldName(_field)]: nestedResolverFn
							});
						}
					}
				}
			} else {
				collectionSchema += `                ${getFieldName(field)}: ${schema.typeID}
`;
				const resolverFn = field.translated ? (parent, _args, ctx) => getLocalizedValue(parent[getFieldName(field)], ctx.locale) : void 0;
				if (resolverFn) {
					deepmerge(resolvers[cleanTypeName], {
						[getFieldName(field)]: resolverFn
					});
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
		collectionSchemas.push(collectionSchema + '\n');
	}
	const finalTypeDefs = Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n');
	return {
		typeDefs: finalTypeDefs,
		resolvers,
		collections
	};
}
async function collectionsResolvers(dbAdapter, cacheClient2, tenantId) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const { resolvers, collections } = await registerCollections(tenantId);
	for (const collection of collections) {
		if (!collection._id) continue;
		const name = typeof collection.name === 'string' ? collection.name : '';
		const cleanTypeName = createCleanTypeName({ _id: collection._id, name });
		resolvers.Query[cleanTypeName] = async function resolver(_parent, args, context) {
			const ctx = context;
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
				const collectionStats = contentManager.getCollectionStats(collection._id, ctx.tenantId);
				if (!collectionStats) {
					throw new Error(`Collection not found: ${collection._id}`);
				}
				const contentVersion = contentManager.getContentVersion();
				const cacheKey = `query:collections:${collection._id}:${page}:${limit}:${locale}:${contentVersion}`;
				if (getPrivateSettingSync('USE_REDIS') && cacheClient2) {
					const cachedResult = await cacheClient2.get(cacheKey, ctx.tenantId);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}
				const query = {};
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
				const resultArray = Array.isArray(result.data) ? result.data : [];
				if (resultArray.length > 0) {
					try {
						await modifyRequest({
							data: resultArray,
							fields: collection.fields,
							collection,
							user: ctx.user,
							type: 'GET'
						});
					} catch (modifyError) {
						logger.warn(`GraphQL modifyRequest failed`, {
							error: modifyError instanceof Error ? modifyError.message : 'Unknown error'
						});
					}
				}
				const processedResults = await Promise.all(
					resultArray.map(async (doc) => {
						const tokenContext = {
							entry: doc,
							user: ctx.user
						};
						const processedDoc = { ...doc };
						for (const key in processedDoc) {
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
				processedResults.forEach((doc) => {
					doc.createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : /* @__PURE__ */ new Date().toISOString();
					doc.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : doc.createdAt;
				});
				if (getPrivateSettingSync('USE_REDIS') && cacheClient2) {
					await cacheClient2.set(cacheKey, JSON.stringify(processedResults), 'EX', 1800, ctx.tenantId);
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
function mediaTypeDefs() {
	return `
        type MediaImage {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaDocument {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaAudio {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaVideo {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaRemote {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }
    `;
}
function mediaResolvers(dbAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const fetchWithPagination = async (contentTypes, pagination, context) => {
		if (!context.user) throw new Error('Authentication required');
		if (getPrivateSettingSync('MULTI_TENANT') && !context.tenantId) {
			throw new Error('Internal Server Error: Tenant context is missing.');
		}
		const { page = 1, limit = 50 } = pagination || {};
		try {
			const query = {};
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = context.tenantId;
			}
			const result = await dbAdapter.queryBuilder(contentTypes).where(query).sort('createdAt', 'desc').paginate({ page, pageSize: limit }).execute();
			if (!result.success) throw new Error(result.error?.message || 'Query failed');
			return result.data;
		} catch (error) {
			logger.error(`Error fetching data for ${contentTypes}:`, {
				error: error instanceof Error ? error.message : String(error),
				tenantId: context.tenantId
			});
			throw Error(`Failed to fetch data for ${contentTypes}`);
		}
	};
	return {
		mediaImages: async (_, args, context) => await fetchWithPagination('media_images', args.pagination, context),
		mediaDocuments: async (_, args, context) => await fetchWithPagination('media_documents', args.pagination, context),
		mediaAudio: async (_, args, context) => await fetchWithPagination('media_audio', args.pagination, context),
		mediaVideos: async (_, args, context) => await fetchWithPagination('media_videos', args.pagination, context),
		mediaRemote: async (_, args, context) => await fetchWithPagination('media_remote', args.pagination, context)
	};
}
function mapTypeToGraphQLType(value) {
	if (Array.isArray(value)) {
		return `[${mapTypeToGraphQLType(value[0])}]`;
	}
	switch (typeof value) {
		case 'string':
			return 'String';
		case 'boolean':
			return 'Boolean';
		case 'number':
			return Number.isInteger(value) ? 'Int' : 'Float';
		case 'object':
			return value instanceof Date ? 'String' : 'JSON';
		default:
			return 'String';
	}
}
function generateGraphQLTypeDefsFromType(type, typeID) {
	const fields = Object.entries(type)
		.map(([key, value]) => `${key}: ${mapTypeToGraphQLType(value)}`)
		.join('\n');
	return `
        type ${typeID} {
            ${fields}
        }
    `;
}
const userTypeSample = {
	_id: '',
	email: '',
	tenantId: '',
	password: '',
	role: '',
	username: '',
	avatar: '',
	lastAuthMethod: '',
	lastActiveAt: /* @__PURE__ */ new Date().toISOString(),
	expiresAt: /* @__PURE__ */ new Date().toISOString(),
	isRegistered: false,
	blocked: false,
	resetRequestedAt: /* @__PURE__ */ new Date().toISOString(),
	resetToken: '',
	failedAttempts: 0,
	lockoutUntil: /* @__PURE__ */ new Date().toISOString(),
	is2FAEnabled: false,
	permissions: []
};
function userTypeDefs() {
	return generateGraphQLTypeDefsFromType(userTypeSample, 'User');
}
function userResolvers(dbAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const fetchWithPagination = async (contentTypes, pagination, context) => {
		if (!context.user) throw new Error('Authentication required');
		if (getPrivateSettingSync('MULTI_TENANT') && !context.tenantId) {
			throw new Error('Internal Server Error: Tenant context is missing.');
		}
		const { page = 1, limit = 10 } = pagination || {};
		try {
			const query = {};
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = context.tenantId;
			}
			const result = await dbAdapter.queryBuilder(contentTypes).where(query).sort('updatedAt', 'desc').paginate({ page, pageSize: limit }).execute();
			if (!result.success) throw new Error(result.error?.message || 'Query failed');
			return result.data;
		} catch (error) {
			logger.error(`Error fetching data for ${contentTypes}:`, {
				error: error instanceof Error ? error.message : String(error),
				tenantId: context.tenantId
			});
			throw Error(`Failed to fetch data for ${contentTypes}`);
		}
	};
	return {
		users: async (_, args, context) => await fetchWithPagination('auth_users', args.pagination, context),
		me: async (_, __, context) => {
			if (!context.user) throw new Error('Authentication required');
			return context.user;
		}
	};
}
const systemTypeDefs = `
	input NavigationOptions {
		maxDepth: Int = 1
		expandedIds: [String!]
	}

	type CollectionStats {
		_id: String!
		name: String!
		icon: String
		path: String
		fieldCount: Int!
		hasRevisions: Boolean!
		hasLivePreview: Boolean!
		status: String
	}

	type NavigationNode {
		_id: String!
		name: String!
		path: String
		icon: String
		nodeType: String!
		order: Int
		parentId: String
		children: [NavigationNode!]
		hasChildren: Boolean
	}

	type BreadcrumbItem {
		name: String!
		path: String!
	}

	type ContentManagerHealth {
		state: String!
		nodeCount: Int!
		collectionCount: Int!
		cacheAge: Int
		version: Int!
	}

	type HealthMaps {
		contentNodes: Int!
		pathLookup: Int!
	}

	type HealthCache {
		hasFirstCollection: Boolean!
		cacheAge: Int
		tenantId: String
	}

	type ContentManagerDiagnostics {
		maps: HealthMaps!
		cache: HealthCache!
		state: String!
		version: Int!
	}

	type OperationCounts {
		create: Int!
		update: Int!
		delete: Int!
		move: Int!
	}

	type ContentManagerMetrics {
		initializationTime: Float!
		cacheHits: Int!
		cacheMisses: Int!
		lastRefresh: Float!
		operationCounts: OperationCounts!
		uptime: Float!
		cacheHitRate: Float!
	}

	type StructureValidation {
		valid: Boolean!
		errors: [String!]!
		warnings: [String!]!
	}
`;
const systemResolvers = {
	Query: {
		// --- Collection Metadata ---
		collectionStats: async (_, args, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				return await contentManager.getCollectionStats(args.collectionId, context.tenantId);
			} catch (error) {
				logger.error(`Error in collectionStats:`, { error, collectionId: args.collectionId, tenantId: context.tenantId });
				throw new Error('Failed to fetch collection stats');
			}
		},
		allCollectionStats: async (_, __, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				const collections = await contentManager.getCollections(context.tenantId);
				return collections.map((col) => contentManager.getCollectionStats(col._id, context.tenantId)).filter(Boolean);
			} catch (error) {
				logger.error(`Error in allCollectionStats:`, { error, tenantId: context.tenantId });
				throw new Error('Failed to fetch all collection stats');
			}
		},
		// --- Navigation ---
		navigationStructure: async (_, args, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				const expandedIds = new Set(args.options?.expandedIds || []);
				return await contentManager.getNavigationStructureProgressive({
					maxDepth: args.options?.maxDepth ?? 1,
					expandedIds,
					tenantId: context.tenantId
				});
			} catch (error) {
				logger.error(`Error in navigationStructure:`, { error, tenantId: context.tenantId });
				throw new Error('Failed to fetch navigation structure');
			}
		},
		nodeChildren: async (_, args, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				return await contentManager.getNodeChildren(args.nodeId, context.tenantId);
			} catch (error) {
				logger.error(`Error in nodeChildren:`, { error, nodeId: args.nodeId, tenantId: context.tenantId });
				throw new Error('Failed to fetch node children');
			}
		},
		breadcrumb: async (_, args, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				return await contentManager.getBreadcrumb(args.path);
			} catch (error) {
				logger.error(`Error in breadcrumb:`, { error, path: args.path, tenantId: context.tenantId });
				throw new Error('Failed to fetch breadcrumb');
			}
		},
		// --- Health & Diagnostics ---
		contentManagerHealth: async (_, __, context) => {
			if (!context.user) throw new Error('Authentication required');
			try {
				return await contentManager.getHealthStatus();
			} catch (error) {
				logger.error(`Error in contentManagerHealth:`, { error });
				throw new Error('Failed to fetch health status');
			}
		},
		contentManagerDiagnostics: async (_, __, context) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			try {
				return await contentManager.getDiagnostics();
			} catch (error) {
				logger.error(`Error in contentManagerDiagnostics:`, { error });
				throw new Error('Failed to fetch diagnostics');
			}
		},
		contentManagerMetrics: async (_, __, context) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			try {
				return await contentManager.getMetrics();
			} catch (error) {
				logger.error(`Error in contentManagerMetrics:`, { error });
				throw new Error('Failed to fetch metrics');
			}
		},
		validateContentStructure: async (_, __, context) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			try {
				return await contentManager.validateStructure();
			} catch (error) {
				logger.error(`Error in validateContentStructure:`, { error });
				throw new Error('Failed to validate structure');
			}
		}
	}
};
const cacheClient = getPrivateSettingSync('USE_REDIS')
	? {
			get: async (key, tenantId) => {
				try {
					return await cacheService.get(`graphql:${key}`, tenantId);
				} catch (err) {
					logger.debug('GraphQL cache get failed, continuing without cache', err);
					return null;
				}
			},
			set: async (key, value, _ex, duration, tenantId) => {
				try {
					await cacheService.set(`graphql:${key}`, value, duration, tenantId, CacheCategory.API);
				} catch (err) {
					logger.debug('GraphQL cache set failed, continuing without cache', err);
				}
			}
		}
	: null;
const accessManagementPermission = {
	_id: 'config:accessManagement',
	contextId: 'config/accessManagement',
	name: 'Access Management',
	action: PermissionAction.MANAGE,
	contextType: PermissionType.CONFIGURATION,
	type: PermissionType.CONFIGURATION,
	description: 'Allows management of user access and permissions'
};
if (!building) {
	registerPermission(accessManagementPermission);
}
async function createGraphQLSchema(dbAdapter, tenantId) {
	if (!widgets.isLoaded) {
		logger.debug('Widgets not loaded yet, initializing...');
		await widgets.initialize(tenantId, dbAdapter);
	}
	const { typeDefs: collectionsTypeDefs, collections } = await registerCollections(tenantId);
	const collectionsArray = Array.isArray(collections) ? collections : Object.values(collections || {});
	const typeDefs = `
		input PaginationInput {
			page: Int = 1
			limit: Int = 50
		}

		scalar JSON

		${collectionsTypeDefs}
		${userTypeDefs()}
		${mediaTypeDefs()}
		${systemTypeDefs}



		type ContentUpdateEvent {
			version: Int!
			timestamp: String!
			affectedCollections: [String!]!
			changeType: String!
		}

		type EntryUpdateEvent {
			collection: String!
			id: String!
			action: String!
			data: JSON
			timestamp: String!
		}

		type Subscription {
			contentStructureUpdated: ContentUpdateEvent!
			entryUpdated(collection: String, id: String): EntryUpdateEvent!
		}

		type AccessManagementPermission {
			contextId: String!
			name: String!
			action: String!
			contextType: String!
			description: String
		}

		type Query {
			${collectionsArray
				.filter((collection) => collection && collection.name && collection._id)
				.map((collection) => `${createCleanTypeName(collection)}(pagination: PaginationInput): [${createCleanTypeName(collection)}]`)
				.join('\n')}
			users(pagination: PaginationInput): [User]
			me: User
			mediaImages(pagination: PaginationInput): [MediaImage]
			mediaDocuments(pagination: PaginationInput): [MediaDocument]
			mediaAudio(pagination: PaginationInput): [MediaAudio]
			mediaVideos(pagination: PaginationInput): [MediaVideo]
			mediaRemote(pagination: PaginationInput): [MediaRemote]
			accessManagementPermission: AccessManagementPermission

			# System Queries
			collectionStats(collectionId: String!): CollectionStats
			allCollectionStats: [CollectionStats!]
			navigationStructure(options: NavigationOptions): [NavigationNode]
			nodeChildren(nodeId: String!): [NavigationNode]
			breadcrumb(path: String!): [BreadcrumbItem]
			contentManagerHealth: ContentManagerHealth
			contentManagerDiagnostics: ContentManagerDiagnostics
			contentManagerMetrics: ContentManagerMetrics
			validateContentStructure: StructureValidation
		}
	`;
	const collectionsResolversObj = await collectionsResolvers(dbAdapter, cacheClient, tenantId);
	const resolvers = {
		Query: {
			...collectionsResolversObj.Query,
			...userResolvers(dbAdapter),
			...mediaResolvers(dbAdapter),
			...systemResolvers.Query,
			accessManagementPermission: async (_, __, context) => {
				const { user } = context;
				if (!user) {
					throw new Error('Unauthorized: No user in context');
				}
				const userHasPermission = hasPermissionWithRoles(user, 'config:accessManagement', context.locals?.roles || []);
				if (!userHasPermission) {
					throw new Error('Forbidden: Insufficient permissions');
				}
				return accessManagementPermission;
			}
		},
		...Object.keys(collectionsResolversObj)
			.filter((key) => key !== 'Query')
			.reduce((acc, key) => {
				acc[key] = collectionsResolversObj[key];
				return acc;
			}, {}),
		Subscription: {
			contentStructureUpdated: {
				subscribe: (_, __, context) => {
					return context.pubSub.subscribe('contentStructureUpdated');
				},
				resolve: (payload) => payload
			},
			entryUpdated: {
				subscribe: (_, _args, context) => {
					const iterator = context.pubSub.subscribe('entryUpdated');
					return iterator;
				},
				resolve: (payload) => payload
			}
		}
	};
	return { typeDefs, resolvers };
}
async function setupGraphQL(dbAdapter, tenantId) {
	try {
		const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
		const yogaApp = createYoga({
			graphqlEndpoint: '/api/graphql',
			landingPage: true,
			plugins: [],
			cors: false,
			graphiql: {
				subscriptionsProtocol: 'WS'
			},
			// @ts-expect-error Yoga schema type mismatch due to context generics
			schema: createSchema({ typeDefs, resolvers }),
			context: async ({ request }) => {
				const contextData = request.contextData;
				return {
					user: contextData?.user,
					tenantId: contextData?.tenantId,
					locale: request.headers.get('accept-language')?.split(',')[0]?.trim().slice(0, 2) || 'en',
					// Simple locale extraction
					pubSub
				};
			}
		});
		logger.info('GraphQL setup completed successfully');
		return yogaApp;
	} catch (error) {
		logger.error('Error setting up GraphQL:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			tenantId
		});
		throw error;
	}
}
let yogaAppPromise = null;
let wsServerInitialized = false;
async function initializeWebSocketServer(dbAdapter, tenantId) {
	if (wsServerInitialized || building) {
		return;
	}
	try {
		const { typeDefs, resolvers } = await createGraphQLSchema(dbAdapter, tenantId);
		const schema = createSchema({ typeDefs, resolvers });
		const wsServer = new WebSocketServer({
			port: 3001,
			path: '/api/graphql'
		});
		useServer(
			{
				schema,
				context: async (ctx) => {
					const connectionParams = ctx.connectionParams;
					let user = null;
					if (connectionParams) {
						try {
							if (connectionParams.authorization) {
								const token = connectionParams.authorization.replace(/^Bearer\s+/i, '');
								const tokenValidation = await dbAdapter.auth.validateToken(token, void 0, 'access', tenantId);
								if (tokenValidation?.success) {
									const tokenData = await dbAdapter.auth.getTokenByValue(token, tenantId);
									if (tokenData?.success && tokenData.data) {
										const userResult = await dbAdapter.auth.getUserById(tokenData.data.user_id, tenantId);
										if (userResult?.success) {
											user = userResult.data;
											logger.info('WebSocket: User authenticated via token', { userId: user?._id });
										}
									}
								}
							}
						} catch (error) {
							logger.error('WebSocket authentication error:', {
								error: error instanceof Error ? error.message : 'Unknown error'
							});
						}
					}
					return {
						user,
						pubSub,
						tenantId
					};
				}
			},
			wsServer
		);
		wsServerInitialized = true;
		logger.info('GraphQL WebSocket Server initialized on port 3001');
	} catch (error) {
		logger.error('Failed to initialize WebSocket server:', {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}
const handler = async (event) => {
	const { locals, request } = event;
	if (!locals.user) {
		return new Response(
			JSON.stringify({
				error: 'Unauthorized',
				message: 'You must be logged in to access the GraphQL endpoint.'
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
	if (!locals.dbAdapter) {
		return new Response(
			JSON.stringify({
				error: 'Service Unavailable',
				message: 'Database service is not available.'
			}),
			{
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
	try {
		if (!yogaAppPromise) {
			logger.debug('Initializing GraphQL Yoga app', { tenantId: locals.tenantId });
			yogaAppPromise = setupGraphQL(locals.dbAdapter, locals.tenantId);
		}
		const yogaApp = await yogaAppPromise;
		if (!yogaApp) {
			throw new Error('GraphQL Yoga app failed to initialize');
		}
		if (!wsServerInitialized) {
			logger.debug('Initializing WebSocket server', { tenantId: locals.tenantId });
			void initializeWebSocketServer(locals.dbAdapter, locals.tenantId);
		}
		const requestInit = {
			method: request.method,
			headers: request.headers
		};
		if (request.method !== 'GET' && request.body) {
			requestInit.body = request.body;
			requestInit.duplex = 'half';
		}
		const compatibleRequest = new Request(request.url.toString(), requestInit);
		compatibleRequest.contextData = {
			user: locals.user,
			tenantId: locals.tenantId
		};
		const yogaResponse = await yogaApp.handleRequest(compatibleRequest, {
			user: locals.user,
			tenantId: locals.tenantId
		});
		logger.debug('GraphQL Yoga response:', {
			status: yogaResponse?.status,
			statusText: yogaResponse?.statusText,
			headers: yogaResponse ? Object.fromEntries(yogaResponse.headers.entries()) : 'N/A',
			isResponse: yogaResponse instanceof Response
		});
		if (!yogaResponse) {
			logger.error('GraphQL Yoga returned undefined or null response');
			throw new Error('GraphQL Yoga returned no response');
		}
		const bodyBuffer = await yogaResponse.arrayBuffer();
		return new Response(bodyBuffer, {
			status: yogaResponse.status,
			statusText: yogaResponse.statusText,
			headers: yogaResponse.headers
		});
	} catch (error) {
		logger.error('Error handling GraphQL request:', {
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			tenantId: locals.tenantId
		});
		return new Response(
			JSON.stringify({
				error: 'Internal Server Error',
				message: 'An error occurred while processing your GraphQL request.'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
export { handler as GET, handler as POST };
//# sourceMappingURL=_server.ts.js.map
