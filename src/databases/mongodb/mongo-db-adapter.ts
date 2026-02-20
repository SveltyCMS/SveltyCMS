/**
 * @file src/databases/mongodb/mongo-db-adapter.ts
 * @description Central MongoDB adapter for CMS database operations
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with a robust retry mechanism
 * - CRUD operations for collections, documents, drafts, revisions, and widgets
 * - Management of media storage, retrieval, and virtual folders
 * - User authentication and revisions
 * - Management of system preferences including user screen sizes and widget layouts
 * - Theme management
 * - Content Structure Management
 *
 * Key Features:
 * - Automatic reconnection with exponential backoff for MongoDB
 * - Schema definitions and model creation for various collections (e.g., Drafts, Revisions, Widgets, Media)
 * - Robust handling of media files with specific schemas for different media types
 * - Management of authentication-related models (e.g., User, Token, Session)
 * - Default and custom theme management with database storage
 * - User preferences storage and retrieval, including layout and screen size information
 * - Virtual folder management for organizing media
 * - Flexible Content Structure management for pages and collections
 *
 * Usage:
 * This adapter is utilized when the CMS is configured to use MongoDB, providing a
 * database-agnostic interface for various database operations within the CMS.
 * The adapter supports complex queries, schema management, and handles error logging
 * and connection retries. It integrates fully with the CMS for all data management needs.
 */

import { cacheService } from '@src/databases/cache-service';
import { logger } from '@src/utils/logger.server';
// Mongoose and core types
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type {
	BaseEntity,
	BatchOperation,
	BatchResult,
	ConnectionPoolStats,
	DatabaseId,
	DatabaseResult,
	DatabaseTransaction,
	IAuthAdapter,
	IContentAdapter,
	ICrudAdapter,
	IDBAdapter,
	IMediaAdapter,
	IMonitoringAdapter,
	ISystemAdapter,
	PaginatedResult,
	PaginationOptions,
	Schema
} from '../db-interface';

export class MongoDBAdapter implements IDBAdapter {
	// --- Feature Cache (Real Instances) ---
	private _realAuth?: IAuthAdapter;
	private _realCrud?: ICrudAdapter;
	private _realMedia?: IMediaAdapter;
	private _realContent?: IContentAdapter;
	private _realSystem?: ISystemAdapter;
	private _realMonitoring?: IMonitoringAdapter;
	private _realCollections?: import('./methods/collection-methods').MongoCollectionMethods;

	// --- Feature Shells (Proxies) ---
	private _shellAuth?: IAuthAdapter;
	private _shellCrud?: ICrudAdapter;
	private _shellMedia?: IMediaAdapter;
	private _shellContent?: IContentAdapter;
	private _shellSystem?: ISystemAdapter;
	private _shellMonitoring?: IMonitoringAdapter;

	// --- Lazy Initialization State ---
	private readonly _modelCache = new Map<string, mongoose.Model<Record<string, unknown>>>();
	private readonly _featureInit = {
		auth: false,
		media: false,
		crud: false,
		content: false,
		system: false,
		monitoring: false,
		collections: false
	};

	private readonly _initPromises = new Map<string, Promise<void>>();

	// --- Feature Getters (Lazy-loaded) ---

	// --- Feature Getters (Smart Lazy-loaded) ---

	public get auth(): IAuthAdapter {
		if (!this._shellAuth) {
			this._shellAuth = this._createLazyProxy<IAuthAdapter>(
				'auth',
				() => this.ensureAuth(),
				() => this._realAuth
			);
		}
		return this._shellAuth;
	}

	public get crud(): ICrudAdapter {
		if (!this._shellCrud) {
			this._shellCrud = this._createLazyProxy<ICrudAdapter>(
				'crud',
				() => Promise.resolve(),
				() => this._realCrud
			);
		}
		return this._shellCrud;
	}

	public get media(): IMediaAdapter {
		if (!this._shellMedia) {
			this._shellMedia = this._createLazyProxy<IMediaAdapter>(
				'media',
				() => this.ensureMedia(),
				() => this._realMedia
			);
		}
		return this._shellMedia;
	}

	public get content(): IContentAdapter {
		if (!this._shellContent) {
			this._shellContent = this._createLazyProxy<IContentAdapter>(
				'content',
				() => this.ensureContent(),
				() => this._realContent
			);
		}
		return this._shellContent;
	}

	public get systemPreferences(): ISystemAdapter['systemPreferences'] {
		return this._getSystemShell().systemPreferences;
	}

	public get themes(): ISystemAdapter['themes'] {
		return this._getSystemShell().themes;
	}

	public get widgets(): ISystemAdapter['widgets'] {
		return this._getSystemShell().widgets;
	}

	public get websiteTokens(): ISystemAdapter['websiteTokens'] {
		return this._getSystemShell().websiteTokens;
	}

	public get systemVirtualFolder(): ISystemAdapter['systemVirtualFolder'] {
		return this._getSystemShell().systemVirtualFolder;
	}

	public get tenants(): ISystemAdapter['tenants'] {
		return this._getSystemShell().tenants;
	}

	public get performance(): IMonitoringAdapter['performance'] {
		return this._getMonitoringShell().performance;
	}

	public get cache(): IMonitoringAdapter['cache'] {
		return this._getMonitoringShell().cache;
	}

	private _getSystemShell(): ISystemAdapter {
		if (!this._shellSystem) {
			this._shellSystem = this._createLazyProxy<ISystemAdapter>(
				'system',
				() => this.ensureSystem(),
				() => this._realSystem
			);
		}
		return this._shellSystem;
	}

	private _getMonitoringShell(): IMonitoringAdapter {
		if (!this._shellMonitoring) {
			this._shellMonitoring = this._createLazyProxy<IMonitoringAdapter>(
				'monitoring',
				() => this.ensureMonitoring(),
				() => this._realMonitoring
			);
		}
		return this._shellMonitoring;
	}

	private _createLazyProxy<T extends object>(name: string, ensureFn: () => Promise<void>, getReal: () => T | undefined): T {
		return new Proxy({} as T, {
			get: (_target, prop) => {
				if (prop === 'then' || prop === 'catch' || prop === 'finally' || typeof prop === 'symbol') {
					return undefined;
				}

				const real = getReal();
				if (real && (real as Record<string | symbol, unknown>)[prop]) {
					const value = (real as Record<string | symbol, unknown>)[prop];
					return typeof value === 'function' ? value.bind(real) : value;
				}

				// If it's one of the known sub-objects, return another lazy proxy
				if (
					[
						'systemPreferences',
						'themes',
						'widgets',
						'websiteTokens',
						'systemVirtualFolder',
						'performance',
						'cache',
						'files',
						'folders',
						'nodes',
						'drafts',
						'revisions'
					].includes(prop as string)
				) {
					return this._createLazyProxy(`${name}.${String(prop)}`, ensureFn, () => (getReal() as Record<string | symbol, Record<string, unknown>>)?.[prop] as object);
				}

				// Otherwise, assume it's a method and return a wrapper
				return async (...args: unknown[]) => {
					if (!this.isConnected()) {
						throw new Error('Database not connected');
					}
					await ensureFn();
					const instance = getReal();
					if (!instance) {
						throw new Error(`Feature "${name}" failed to initialize`);
					}
					const method = (instance as Record<string | symbol, unknown>)[prop];
					if (typeof method !== 'function') {
						throw new Error(`Method "${String(prop)}" not found on "${name}"`);
					}
					return method.apply(instance, args);
				};
			}
		});
	}

	// --- Core Implementation ---

	public getCapabilities(): import('../db-interface').DatabaseCapabilities {
		return {
			supportsTransactions: true,
			supportsIndexing: true,
			supportsFullTextSearch: true,
			supportsAggregation: true,
			supportsStreaming: true,
			supportsPartitioning: false,
			maxBatchSize: 1000,
			maxQueryComplexity: 10
		};
	}

	async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: import('../db-interface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	async connect(
		connectionStringOrOptions?: string | import('../db-interface').ConnectionPoolOptions,
		options?: unknown
	): Promise<DatabaseResult<void>> {
		try {
			// 1. Database Connection
			if (!this.isConnected()) {
				let connectionString: string;
				const connectOptions: mongoose.ConnectOptions = (options as mongoose.ConnectOptions) || {
					maxPoolSize: 10, // Optimized pool size
					minPoolSize: 2,
					serverSelectionTimeoutMS: 5000,
					connectTimeoutMS: 5000,
					retryWrites: true,
					w: 'majority'
				};

				if (typeof connectionStringOrOptions === 'string') {
					connectionString = connectionStringOrOptions;
				} else {
					connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
				}

				await mongoose.connect(connectionString, connectOptions);
				logger.info('Connected to MongoDB');

				// 1.1 Cache Service Initialization (Essential for performance)
				const { cacheService } = await import('../cache-service');
				await cacheService.initialize();
			}

			// 2. Initialize Core CRUD (Required for almost everything)
			if (!this._realCrud) {
				this._realCrud = await this._createCrudAdapter();
				this._featureInit.crud = true;
			}

			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to connect to MongoDB',
				error: { code: 'CONNECTION_FAILED', message: String(error) }
			};
		}
	}

	// --- Feature-Specific "Ensure" methods (Lazy Activation) ---

	public async ensureAuth(): Promise<void> {
		if (this._featureInit.auth) {
			return;
		}
		if (this._initPromises.has('auth')) {
			return this._initPromises.get('auth');
		}

		const promise = (async () => {
			const { MongoAuthModelRegistrar } = await import('./methods/auth-methods');
			const { composeMongoAuthAdapter } = await import('./methods/auth-composition');
			const authRegistrar = new MongoAuthModelRegistrar(mongoose);
			await authRegistrar.setupAuthModels();
			this._realAuth = composeMongoAuthAdapter();
			this._featureInit.auth = true;
		})();

		this._initPromises.set('auth', promise);
		return promise;
	}

	public async ensureMedia(): Promise<void> {
		if (this._featureInit.media) {
			return;
		}
		if (this._initPromises.has('media')) {
			return this._initPromises.get('media');
		}

		const promise = (async () => {
			const { MongoMediaMethods } = await import('./methods/media-methods');
			const mediaModel = this._getOrCreateModel('media');
			MongoMediaMethods.registerModels(mongoose);
			const mediaMethods = new MongoMediaMethods(mediaModel as any as mongoose.Model<import('./models/media').IMedia>);

			this._realMedia = {
				setupMediaModels: async () => {},
				files: {
					upload: (f) => this.crud.insert('media', f),
					uploadMany: (f) =>
						this._wrapResult(() =>
							mediaMethods.uploadMany(
								f.map(
									(x) =>
										({
											...x,
											createdAt: new Date().toISOString(),
											updatedAt: new Date().toISOString()
										}) as import('../db-interface').MediaItem
								)
							)
						),
					delete: (id) => this.crud.delete('media', id),
					deleteMany: (ids) => this._wrapResult(() => mediaMethods.deleteMany(ids)),
					getByFolder: (id, o, recursive, tenantId) => this._wrapResult(() => mediaMethods.getFiles(id, o, recursive, tenantId)),
					search: (_q, o, tenantId) => this._wrapResult(() => mediaMethods.getFiles(undefined, { ...o, user: o?.user }, true, tenantId)),
					getMetadata: () => this._wrapResult(async () => ({}) as Record<string, import('../db-interface').MediaMetadata>),
					updateMetadata: (id, m) =>
						this._wrapResult(() => mediaMethods.updateMetadata(id, m)) as Promise<DatabaseResult<import('../db-interface').MediaItem>>,
					move: (ids, target) => this._wrapResult(() => mediaMethods.move(ids, target)),
					duplicate: () => this._wrapResult(async () => ({}) as import('../db-interface').MediaItem)
				},
				folders: {
					create: (f) => this.crud.insert('media_folders', f),
					createMany: (f) => this.crud.insertMany('media_folders', f),
					delete: (id) => this.crud.delete('media_folders', id),
					deleteMany: (ids) => this.crud.deleteMany('media_folders', { _id: { $in: ids } } as unknown as import('../db-interface').QueryFilter<import('../db-interface').BaseEntity>),
					getTree: () => this._wrapResult(async () => []),
					getFolderContents: () =>
						this._wrapResult(async () => ({
							folders: [],
							files: [],
							totalCount: 0
						})),
					move: (id, target) => this.crud.update('media_folders', id, { parentId: target })
				}
			};
			this._featureInit.media = true;
		})();

		this._initPromises.set('media', promise);
		return promise;
	}

	public async ensureContent(): Promise<void> {
		if (this._featureInit.content) {
			return;
		}
		if (this._initPromises.has('content')) {
			return this._initPromises.get('content');
		}

		const promise = (async () => {
			const [{ MongoContentMethods }, { ContentNodeModel, DraftModel, RevisionModel }, { MongoCrudMethods }] = await Promise.all([
				import('./methods/content-methods'),
				import('./models'),
				import('./methods/crud-methods')
			]);

			const contentMethods = new MongoContentMethods(
				new MongoCrudMethods(ContentNodeModel as unknown as mongoose.Model<import('../db-interface').ContentNode>),
				new MongoCrudMethods(DraftModel as unknown as mongoose.Model<import('../db-interface').ContentDraft>),
				new MongoCrudMethods(RevisionModel as unknown as mongoose.Model<import('../db-interface').ContentRevision>)
			);

			this._realContent = {
				nodes: {
					getStructure: (m, f, b) => this._wrapResult(() => contentMethods.getStructure(m, f, b)),
					upsertContentStructureNode: (n) => this._wrapResult(() => contentMethods.upsertNodeByPath(n)),
					create: (n) => this.crud.insert('system_content_structure', n),
					createMany: (n) => this.crud.insertMany('system_content_structure', n),
					update: (p, c) => this.crud.update('system_content_structure', p as DatabaseId, c),
					bulkUpdate: (u) =>
						this._wrapResult(() => contentMethods.bulkUpdateNodes(u)) as Promise<DatabaseResult<import('../db-interface').ContentNode[]>>,
					fixMismatchedNodeIds: (n) => contentMethods.fixMismatchedNodeIds(n),
					delete: (p) => this.crud.delete('system_content_structure', p as DatabaseId),
					deleteMany: (p, o) => {
						const query: Record<string, unknown> = { path: { $in: p } };
						if (o?.tenantId) {
							query.tenantId = o.tenantId;
						}
						return this.crud.deleteMany('system_content_structure', query as unknown as import('../db-interface').QueryFilter<import('../db-interface').BaseEntity>);
					},
					reorder: () => this._wrapResult(async () => [] as import('../db-interface').ContentNode[]),
					reorderStructure: (i) =>
						this._wrapResult(async () => {
							await contentMethods.reorderStructure(i);
						})
				},
				drafts: {
					create: (d) => this._wrapResult(() => contentMethods.createDraft(d)),
					createMany: (d) => this.crud.insertMany('content_drafts', d),
					update: (id, d) => this.crud.update('content_drafts', id, d as Record<string, unknown>),
					publish: (id) =>
						this._wrapResult(async () => {
							await contentMethods.publishManyDrafts([id]);
						}),
					publishMany: (ids) => this._wrapResult(() => contentMethods.publishManyDrafts(ids)) as Promise<DatabaseResult<{ publishedCount: number }>>,
					getForContent: (id, o) => this._wrapResult(() => contentMethods.getDraftsForContent(id, o)),
					delete: (id) => this.crud.delete('content_drafts', id),
					deleteMany: (ids) => this.crud.deleteMany('content_drafts', { _id: { $in: ids } } as unknown as import('../db-interface').QueryFilter<import('../db-interface').BaseEntity>)
				},
				revisions: {
					create: (r) => this._wrapResult(() => contentMethods.createRevision(r as unknown as Omit<import('../db-interface').ContentRevision, "_id" | "createdAt">)),
					getHistory: (id, o) => this._wrapResult(() => contentMethods.getRevisionHistory(id, o)),
					restore: () => this._wrapResult(async () => {}),
					delete: (id) => this.crud.delete('content_revisions', id),
					deleteMany: (ids) => this.crud.deleteMany('content_revisions', { _id: { $in: ids } } as unknown as import('../db-interface').QueryFilter<import('../db-interface').BaseEntity>),
					cleanup: (id, k) => this._wrapResult(() => contentMethods.cleanupRevisions(id, k))
				}
			};
			this._featureInit.content = true;
		})();

		this._initPromises.set('content', promise);
		return promise;
	}

	public async ensureSystem(): Promise<void> {
		if (this._featureInit.system) {
			return;
		}
		if (this._initPromises.has('system')) {
			return this._initPromises.get('system');
		}

		const promise = (async () => {
			await this._initializeSystemAdapter();
			this._featureInit.system = true;
		})();

		this._initPromises.set('system', promise);
		return promise;
	}

	public async ensureMonitoring(): Promise<void> {
		if (this._featureInit.monitoring) {
			return;
		}
		if (this._initPromises.has('monitoring')) {
			return this._initPromises.get('monitoring');
		}

		const promise = (async () => {
			this._realMonitoring = {
				performance: {
					getMetrics: () =>
						this._wrapResult(async () => ({
							queryCount: 0,
							averageQueryTime: 0,
							slowQueries: [],
							cacheHitRate: 0,
							connectionPoolUsage: 0
						})),
					clearMetrics: () => this._wrapResult(async () => {}),
					enableProfiling: () => this._wrapResult(async () => {}),
					getSlowQueries: () => this._wrapResult(async () => [])
				},
				cache: {
					get: (k) => this._wrapResult(() => cacheService.get(k)),
					set: (k, v, o) => this._wrapResult(() => cacheService.set(k, v, o?.ttl || 0)),
					delete: (k) => this._wrapResult(() => cacheService.delete(k)),
					clear: () => this._wrapResult(() => cacheService.invalidateAll()),
					invalidateCollection: (c) => this._wrapResult(() => cacheService.clearByPattern(`*${c}:*`))
				},
				getConnectionPoolStats: () => this.getConnectionPoolStats()
			};
			this._featureInit.monitoring = true;
		})();

		this._initPromises.set('monitoring', promise);
		return promise;
	}

	public async ensureCollections(): Promise<void> {
		if (this._featureInit.collections) {
			return;
		}
		if (this._initPromises.has('collections')) {
			return this._initPromises.get('collections');
		}

		const promise = (async () => {
			const [{ MongoCollectionMethods }, { MongoQueryBuilder }, mongoDBUtils] = await Promise.all([
				import('./methods/collection-methods'),
				import('./mongo-query-builder'),
				import('./methods/mongodb-utils'),
				import('./models') // Side-effect import for model registration
			]);

			this._realCollections = new MongoCollectionMethods();
			this._MongoQueryBuilderConstructor = MongoQueryBuilder as unknown as new (model: mongoose.Model<Record<string, unknown>>) => import('../db-interface').QueryBuilder<Record<string, unknown>>;
			this._mongoDBUtils = mongoDBUtils;
			this._featureInit.collections = true;
		})();

		this._initPromises.set('collections', promise);
		return promise;
	}

	private _getOrCreateModel(name: string, schemaDefinition?: mongoose.SchemaDefinition): mongoose.Model<Record<string, unknown>> {
		if (this._modelCache.has(name)) {
			return this._modelCache.get(name)!;
		}
		const model = mongoose.models[name] as mongoose.Model<Record<string, unknown>> || this._createGenericModel(name, schemaDefinition);
		this._modelCache.set(name, model);
		return model;
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		try {
			await mongoose.disconnect();
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to disconnect',
				error: { code: 'DISCONNECT_FAILED', message: String(error) }
			};
		}
	}

	isConnected(): boolean {
		return mongoose.connection.readyState === 1;
	}

	async getConnectionHealth(): Promise<
		DatabaseResult<{
			healthy: boolean;
			latency: number;
			activeConnections: number;
		}>
	> {
		try {
			if (!mongoose.connection.db) {
				return {
					success: false,
					message: 'Not connected',
					error: { code: 'NOT_CONNECTED', message: 'DB not connected' }
				};
			}
			const start = Date.now();
			await mongoose.connection.db.admin().ping();
			const latency = Date.now() - start;

			const statsResult = await this.getConnectionPoolStats();
			const activeConnections = statsResult.success ? statsResult.data.active : -1;

			return {
				success: true,
				data: { healthy: true, latency, activeConnections }
			};
		} catch (error) {
			return {
				success: false,
				message: 'Health check failed',
				error: { code: 'HEALTH_CHECK_FAILED', message: String(error) }
			};
		}
	}

	async clearDatabase(): Promise<DatabaseResult<void>> {
		try {
			if (!mongoose.connection.db) {
				return {
					success: false,
					message: 'Not connected',
					error: { code: 'NOT_CONNECTED', message: 'DB not connected' }
				};
			}
			await mongoose.connection.db.dropDatabase();
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to clear database',
				error: { code: 'CLEAR_FAILED', message: String(error) }
			};
		}
	}

	async getConnectionPoolStats(): Promise<DatabaseResult<ConnectionPoolStats>> {
		try {
			if (!this.isConnected()) {
				return {
					success: false,
					message: 'Not connected',
					error: { code: 'NOT_CONNECTED', message: 'DB not connected' }
				};
			}
			const client = mongoose.connection.getClient();
			// @ts-expect-error - Topology is internal
			const pool = client?.topology?.s?.pool;

			if (!pool) {
				return {
					success: true,
					data: {
						total: 50,
						active: 0,
						idle: 0,
						waiting: 0,
						avgConnectionTime: 0
					}
				};
			}

			return {
				success: true,
				data: {
					total: pool.totalConnectionCount || 50,
					active: (pool.totalConnectionCount || 0) - (pool.availableConnectionCount || 0),
					idle: pool.availableConnectionCount || 0,
					waiting: pool.waitQueueSize || 0,
					avgConnectionTime: 0
				}
			};
		} catch (error) {
			return {
				success: false,
				message: 'Failed to get stats',
				error: { code: 'STATS_FAILED', message: String(error) }
			};
		}
	}

	// --- Helper Proxies ---

	private async _createCrudAdapter(): Promise<ICrudAdapter> {
		const { MongoCrudMethods } = await import('./methods/crud-methods');
		const { normalizeCollectionName } = await import('./methods/mongodb-utils');

		const repos = new Map<string, import('./methods/crud-methods').MongoCrudMethods<import('../db-interface').BaseEntity>>();

		const getRepo = (coll: string) => {
			const normalized = normalizeCollectionName(coll);
			if (repos.has(normalized)) {
				return repos.get(normalized)!;
			}

			const model = this._getOrCreateModel(normalized);
			const repo = new MongoCrudMethods(model as unknown as mongoose.Model<import('../db-interface').BaseEntity>);
			repos.set(normalized, repo);
			return repo;
		};

		return {
			findOne: (c, q, o) => this._wrapResult(() => getRepo(c).findOne(q, { fields: o?.fields as (keyof BaseEntity)[], tenantId: o?.tenantId })),
			findMany: (c, q, o) =>
				this._wrapResult(() => {
					let sort: Record<string, 1 | -1> | undefined = undefined;
					if (o?.sort) {
						if (Array.isArray(o.sort)) {
							sort = {};
							for (const [key, dir] of o.sort) {
								sort[key] = dir === 'asc' ? 1 : -1;
							}
						} else {
							sort = o.sort as unknown as Record<string, 1 | -1>;
						}
					}
					return getRepo(c).findMany(q, {
						limit: o?.limit,
						skip: o?.offset,
						fields: o?.fields as (keyof BaseEntity)[],
						sort
					});
				}),
			insert: (c, d) => this._wrapResult(() => getRepo(c).insert(d)),
			update: (c, id, d) => this._wrapResult(() => getRepo(c).update(id, d)),
			delete: (c, id) => this._wrapResult(() => getRepo(c).delete(id)),
			findByIds: (c, ids) => this._wrapResult(() => getRepo(c).findByIds(ids)),
			insertMany: (c, d) => this._wrapResult(() => getRepo(c).insertMany(d)),
			updateMany: (c, q, d) => this._wrapResult(() => getRepo(c).updateMany(q, d)),
			deleteMany: (c, q) => this._wrapResult(() => getRepo(c).deleteMany(q)),
			upsert: (c, q, d) => this._wrapResult(() => getRepo(c).upsert(q, d)),
			upsertMany: (c, items) => this._wrapResult(() => getRepo(c).upsertMany(items)),
			count: (c, q) => this._wrapResult(() => getRepo(c).count(q)),
			exists: (c, q) => this._wrapResult(async () => {
				const res = await getRepo(c).count(q);
				return res.success ? res.data > 0 : false;
			}),
			aggregate: (c, p) => this._wrapResult(() => getRepo(c).aggregate(p as mongoose.PipelineStage[]))
		};
	}

	private _createGenericModel(name: string, schemaDefinition?: mongoose.SchemaDefinition) {
		const schema = new mongoose.Schema(schemaDefinition || { _id: String }, {
			strict: false,
			timestamps: true,
			_id: false
		});
		return mongoose.model(name, schema) as any as mongoose.Model<Record<string, unknown>>;
	}

	private _cachedSystemCore?: import('./methods/system-methods').MongoSystemMethods;
	private _cachedSystemThemes?: import('./methods/theme-methods').MongoThemeMethods;
	private _cachedSystemWidgets?: import('./methods/widget-methods').MongoWidgetMethods;
	private _cachedSystemTokens?: import('./methods/website-token-methods').MongoWebsiteTokenMethods;
	private _cachedSystemFolders?: import('./methods/system-virtual-folder-methods').MongoSystemVirtualFolderMethods;
	private _cachedSystemTenants?: import('./methods/tenant-methods').MongoTenantMethods;

	private async _initializeSystemAdapter(): Promise<void> {
		this._realSystem = {
			systemPreferences: {
				get: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.get(k, s, u));
				},
				getMany: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.getMany(k, s, u));
				},
				getByCategory: async (c, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.getByCategory(c, s, u));
				},
				set: async (k, v, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.set(k, v, s, u));
				},
				setMany: async (p) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.setMany(p as { key: string; value: unknown; scope?: "user" | "system"; userId?: DatabaseId; category?: string }[]));
				},
				delete: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.delete(k, s, u));
				},
				deleteMany: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.deleteMany(k, s, u));
				},
				clear: async (s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/system-methods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore!.clear(s, u));
				}
			},
			themes: {
				setupThemeModels: async () => {},
				getActive: async () => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes!.getActive() as unknown as Promise<import('../db-interface').Theme>);
				},
				setDefault: async (id) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes!.setDefault(id) as unknown as Promise<void>);
				},
				install: async (t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes!.install(t) as unknown as Promise<import('../db-interface').Theme>);
				},
				uninstall: async (id) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes!.uninstall(id) as unknown as Promise<void>);
				},
				update: async (id, t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes!.update(id, t) as unknown as Promise<import('../db-interface').Theme>);
				},
				getAllThemes: async () => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._cachedSystemThemes!.findAll();
				},
				storeThemes: async (ts) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					for (const t of ts) {
						await this._cachedSystemThemes!.installOrUpdate(t);
					}
				},
				getDefaultTheme: async (tid) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					// @ts-expect-error - Method might not exist on all implementations
					return this._wrapResult(() => this._cachedSystemThemes!.getDefault(tid));
				},
				ensure: async (t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/theme-methods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._cachedSystemThemes!.ensure(t);
				}
			},
			widgets: {
				setupWidgetModels: async () => {},
				register: async (w) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.register(w));
				},
				findAll: async () => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.findAll());
				},
				getActiveWidgets: async () => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.getActiveWidgets());
				},
				activate: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.activate(id));
				},
				deactivate: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.deactivate(id));
				},
				update: async (id, w) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.update(id, w));
				},
				delete: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widget-methods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets!.delete(id));
				}
			},
			websiteTokens: {
				create: async (t) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/website-token-methods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens!.create(t));
				},
				getAll: async (o) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/website-token-methods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens!.getAll(o));
				},
				getByName: async (n) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/website-token-methods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens!.getByName(n));
				},
				delete: async (id) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/website-token-methods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens!.delete(id));
				}
			},
			systemVirtualFolder: {
				create: async (f) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.create(f);
				},
				getById: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.getById(id);
				},
				getByParentId: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.getByParentId(id);
				},
				getAll: async () => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.getAll();
				},
				update: async (id, d) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.update(id, d);
				},
				addToFolder: async (id, p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.addToFolder(id, p);
				},
				getContents: async (p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.getContents(p);
				},
				ensure: async (f) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.ensure(f);
				},
				delete: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.delete(id);
				},
				exists: async (p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/system-virtual-folder-methods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders!.exists(p);
				}
			},
			tenants: {
				create: async (t) => {
					if (!this._cachedSystemTenants) {
						const { MongoTenantMethods } = await import('./methods/tenant-methods');
						const { TenantModel } = await import('./models');
						this._cachedSystemTenants = new MongoTenantMethods(TenantModel);
					}
					return this._wrapResult(() => this._cachedSystemTenants!.create(t));
				},
				getById: async (id) => {
					if (!this._cachedSystemTenants) {
						const { MongoTenantMethods } = await import('./methods/tenant-methods');
						const { TenantModel } = await import('./models');
						this._cachedSystemTenants = new MongoTenantMethods(TenantModel);
					}
					return this._wrapResult(() => this._cachedSystemTenants!.getById(id));
				},
				update: async (id, d) => {
					if (!this._cachedSystemTenants) {
						const { MongoTenantMethods } = await import('./methods/tenant-methods');
						const { TenantModel } = await import('./models');
						this._cachedSystemTenants = new MongoTenantMethods(TenantModel);
					}
					return this._wrapResult(() => this._cachedSystemTenants!.update(id, d));
				},
				delete: async (id) => {
					if (!this._cachedSystemTenants) {
						const { MongoTenantMethods } = await import('./methods/tenant-methods');
						const { TenantModel } = await import('./models');
						this._cachedSystemTenants = new MongoTenantMethods(TenantModel);
					}
					return this._wrapResult(() => this._cachedSystemTenants!.delete(id));
				},
				list: async (o) => {
					if (!this._cachedSystemTenants) {
						const { MongoTenantMethods } = await import('./methods/tenant-methods');
						const { TenantModel } = await import('./models');
						this._cachedSystemTenants = new MongoTenantMethods(TenantModel);
					}
					return this._wrapResult(() => this._cachedSystemTenants!.list(o));
				}
			}
		};
	}

	public collection = {
		getModel: async (id: string) => {
			await this.ensureCollections();
			return this._realCollections!.getModel(id);
		},
		createModel: async (s: Schema) => {
			await this.ensureCollections();
			return this._realCollections!.createModel(s);
		},
		updateModel: async (s: Schema) => {
			await this.ensureCollections();
			return this._realCollections!.updateModel(s);
		},
		deleteModel: async (id: string) => {
			await this.ensureCollections();
			return this._realCollections!.deleteModel(id);
		},
		getSchema: async (collectionName: string) => {
			await this.ensureCollections();
			// Explicitly type the expected result from _wrapResult to match IDBAdapter interface
			return this._wrapResult<import('../../content/types').Schema | null>(() => this._realCollections!.getSchema(collectionName));
		},
		listSchemas: async () => {
			await this.ensureCollections();
			return this._wrapResult<import('../../content/types').Schema[]>(() => this._realCollections!.listSchemas());
		}
	};

	private _MongoQueryBuilderConstructor?: new (model: mongoose.Model<Record<string, unknown>>) => import('../db-interface').QueryBuilder<Record<string, unknown>>;
	private _mongoDBUtils?: { normalizeCollectionName(name: string): string };

	public queryBuilder<T extends BaseEntity>(collection: string): import('../db-interface').QueryBuilder<T> {
		// Note: queryBuilder is sync in interface, but we need ensureCollections (async)
		// We'll throw if not ready, but the app should have called ensureCollections via higher level services
		if (!this._featureInit.collections || !this._mongoDBUtils || !this._MongoQueryBuilderConstructor) {
			throw new Error('QueryBuilder infra not initialized. Call ensureCollections() first.');
		}

		const normalized = this._mongoDBUtils.normalizeCollectionName(collection);
		const model = this._getOrCreateModel(normalized);

		return new this._MongoQueryBuilderConstructor(model) as unknown as import('../db-interface').QueryBuilder<T>;
	}

	async transaction<T>(fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>): Promise<DatabaseResult<T>> {
		const session = await mongoose.startSession();
		session.startTransaction();
		try {
			const tx: DatabaseTransaction = {
				commit: async () => {
					await session.commitTransaction();
					return { success: true, data: undefined };
				},
				rollback: async () => {
					await session.abortTransaction();
					return { success: true, data: undefined };
				}
			};
			const result = await fn(tx);
			if (result.success) {
				await session.commitTransaction();
			} else {
				await session.abortTransaction();
			}
			return result;
		} catch (error) {
			await session.abortTransaction();
			return {
				success: false,
				message: 'Transaction failed',
				error: { code: 'TRANSACTION_FAILED', message: String(error) }
			};
		} finally {
			session.endSession();
		}
	}

	public batch = {
		execute: async <T>(ops: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> => {
			return {
				success: true,
				data: {
					success: true,
					results: [],
					totalProcessed: ops.length,
					errors: []
				}
			};
		},
		bulkInsert: async <T extends BaseEntity>(c: string, items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> =>
			this.crud.insertMany<T>(c, items),
		bulkUpdate: async <T extends BaseEntity>(
			c: string,
			updates: Array<{ id: DatabaseId; data: Partial<T> }>
		): Promise<DatabaseResult<{ modifiedCount: number }>> => {
			const results = await Promise.all(updates.map((u) => this.crud.update<T>(c, u.id, u.data as unknown as import('mongoose').UpdateQuery<T>)));
			return {
				success: true,
				data: { modifiedCount: results.filter((r) => r.success).length }
			};
		},
		bulkDelete: async (c: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> =>
			this.crud.deleteMany(c, { _id: { $in: ids } } as unknown as import('../db-interface').QueryFilter<import('../db-interface').BaseEntity>),
		bulkUpsert: async <T extends BaseEntity>(c: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> =>
			this.crud.upsertMany<T>(
				c,
				items.map((i) => ({
					query: { _id: (i.id || (i as unknown as Record<string, unknown>)._id) as unknown as DatabaseId } as unknown as import('../db-interface').QueryFilter<T>,
					data: i as unknown as Omit<T, '_id' | 'createdAt' | 'updatedAt'>
				}))
			) as unknown as Promise<DatabaseResult<T[]>>
	};

	async getCollectionData(
		collectionName: string,
		options?: {
			limit?: number;
			offset?: number;
			fields?: string[];
			includeMetadata?: boolean;
		}
	): Promise<
		DatabaseResult<{
			data: unknown[];
			metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
		}>
	> {
		const res = await this.crud.findMany<BaseEntity>(collectionName, {} as unknown as import('../db-interface').QueryFilter<BaseEntity>, options as { limit?: number; offset?: number; fields?: never[] });
		if (!res.success) {
			return res as unknown as DatabaseResult<{
				data: unknown[];
				metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
			}>;
		}
		return {
			success: true,
			data: {
				data: res.data,
				metadata: options?.includeMetadata ? { totalCount: res.data.length } : undefined
			}
		};
	}

	async getMultipleCollectionData(
		names: string[],
		options?: { limit?: number; fields?: string[] }
	): Promise<DatabaseResult<Record<string, unknown[]>>> {
		const results: Record<string, unknown[]> = {};
		for (const name of names) {
			const res = await this.getCollectionData(name, options);
			if (res.success) {
				results[name] = res.data.data;
			}
		}
		return { success: true, data: results };
	}

	public readonly utils = {
		generateId: () => {
			// Compact, dash-less UUID for DB identifiers
			return uuidv4().replace(/-/g, '') as DatabaseId;
		},

		normalizePath: (path: string) => path.replace(/\\/g, '/'),
		validateId: (id: string) => mongoose.Types.ObjectId.isValid(id),
		createPagination: <T>(items: T[], options: PaginationOptions): PaginatedResult<T> => {
			const page = options.page || 1;
			const pageSize = options.pageSize || 10;
			return {
				items: items.slice((page - 1) * pageSize, page * pageSize),
				total: items.length,
				page,
				pageSize,
				hasNextPage: items.length > page * pageSize,
				hasPreviousPage: page > 1
			};
		}
	};

	private async _wrapResult<T>(fn: () => Promise<unknown>): Promise<DatabaseResult<T>> {
		try {
			const result = await fn();

			// If already a DatabaseResult, return it as is
			if (result && typeof result === 'object' && 'success' in result) {
				return result as DatabaseResult<T>;
			}

			// Otherwise, wrap the raw result
			return { success: true, data: result as T };
		} catch (error) {
			return {
				success: false,
				message: String(error),
				error: {
					code: 'OPERATION_FAILED',
					message: String(error)
				}
			};
		}
	}
}


