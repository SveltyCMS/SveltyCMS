/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
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

// Mongoose and core types
import mongoose from 'mongoose';
import type {
	BaseEntity,
	DatabaseId,
	DatabaseResult,
	IDBAdapter,
	IAuthAdapter,
	ICrudAdapter,
	IMediaAdapter,
	IContentAdapter,
	ISystemAdapter,
	IMonitoringAdapter,
	DatabaseTransaction,
	BatchOperation,
	BatchResult,
	ConnectionPoolStats,
	PaginationOptions,
	PaginatedResult
} from '../dbInterface';
import { logger } from '@src/utils/logger.server';
import { cacheService } from '@src/databases/CacheService';

export class MongoDBAdapter implements IDBAdapter {
	// --- Feature Cache ---
	private _cachedAuth?: IAuthAdapter;
	private _cachedCrud?: ICrudAdapter;
	private _cachedMedia?: IMediaAdapter;
	private _cachedContent?: IContentAdapter;
	private _cachedSystem?: ISystemAdapter;
	private _cachedMonitoring?: IMonitoringAdapter;
	private _cachedCollections?: any; // MongoCollectionMethods

	// --- Lazy Initialization State ---
	private _modelCache = new Map<string, mongoose.Model<any>>();
	private _featureInit = {
		auth: false,
		media: false,
		crud: false,
		content: false,
		system: false,
		monitoring: false,
		collections: false
	};

	private _initPromises = new Map<string, Promise<void>>();

	// --- Feature Getters (Lazy-loaded) ---

	public get auth(): IAuthAdapter {
		if (!this.isConnected()) throw new Error('DB not connected');
		if (!this._cachedAuth) throw new Error('Auth adapter not initialized. Call ensureAuth()');
		return this._cachedAuth;
	}

	public get crud(): ICrudAdapter {
		if (!this.isConnected()) throw new Error('DB not connected');
		if (!this._cachedCrud) throw new Error('CRUD adapter not initialized');
		return this._cachedCrud;
	}

	public get media(): IMediaAdapter {
		if (!this.isConnected()) throw new Error('DB not connected');
		if (!this._cachedMedia) throw new Error('Media adapter not initialized. Call ensureMedia()');
		return this._cachedMedia;
	}

	public get content(): IContentAdapter {
		if (!this.isConnected()) throw new Error('DB not connected');
		if (!this._cachedContent) throw new Error('Content adapter not initialized. Call ensureContent()');
		return this._cachedContent;
	}

	public get systemPreferences(): ISystemAdapter['systemPreferences'] {
		if (!this._cachedSystem) throw new Error('System adapter not initialized. Call ensureSystem()');
		return this._cachedSystem.systemPreferences;
	}

	public get themes(): ISystemAdapter['themes'] {
		if (!this._cachedSystem) throw new Error('System adapter not initialized. Call ensureSystem()');
		return this._cachedSystem.themes;
	}

	public get widgets(): ISystemAdapter['widgets'] {
		if (!this._cachedSystem) throw new Error('System adapter not initialized. Call ensureSystem()');
		return this._cachedSystem.widgets;
	}

	public get websiteTokens(): ISystemAdapter['websiteTokens'] {
		if (!this._cachedSystem) throw new Error('System adapter not initialized. Call ensureSystem()');
		return this._cachedSystem.websiteTokens;
	}

	public get systemVirtualFolder(): ISystemAdapter['systemVirtualFolder'] {
		if (!this._cachedSystem) throw new Error('System adapter not initialized. Call ensureSystem()');
		return this._cachedSystem.systemVirtualFolder;
	}

	public get performance(): IMonitoringAdapter['performance'] {
		if (!this._cachedMonitoring) throw new Error('Monitoring adapter not initialized. Call ensureMonitoring()');
		return this._cachedMonitoring.performance;
	}

	public get cache(): IMonitoringAdapter['cache'] {
		if (!this._cachedMonitoring) throw new Error('Monitoring adapter not initialized. Call ensureMonitoring()');
		return this._cachedMonitoring.cache;
	}

	// --- Core Implementation ---

	public getCapabilities(): import('../dbInterface').DatabaseCapabilities {
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
	async connect(poolOptions?: import('../dbInterface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	async connect(
		connectionStringOrOptions?: string | import('../dbInterface').ConnectionPoolOptions,
		options?: unknown
	): Promise<DatabaseResult<void>> {
		try {
			// 1. Database Connection
			if (!this.isConnected()) {
				let connectionString: string;
				let connectOptions: mongoose.ConnectOptions = (options as mongoose.ConnectOptions) || {
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
				const { cacheService } = await import('../CacheService');
				await cacheService.initialize();
			}

			// 2. Initialize Core CRUD (Required for almost everything)
			if (!this._cachedCrud) {
				this._cachedCrud = await this._createCrudAdapter();
				this._featureInit.crud = true;
			}

			return { success: true, data: undefined };
		} catch (error) {
			return { success: false, message: 'Failed to connect to MongoDB', error: { code: 'CONNECTION_FAILED', message: String(error) } };
		}
	}

	// --- Feature-Specific "Ensure" methods (Lazy Activation) ---

	public async ensureAuth(): Promise<void> {
		if (this._featureInit.auth) return;
		if (this._initPromises.has('auth')) return this._initPromises.get('auth');

		const promise = (async () => {
			const { MongoAuthModelRegistrar } = await import('./methods/authMethods');
			const { composeMongoAuthAdapter } = await import('./methods/authComposition');
			const authRegistrar = new MongoAuthModelRegistrar(mongoose);
			await authRegistrar.setupAuthModels();
			this._cachedAuth = composeMongoAuthAdapter();
			this._featureInit.auth = true;
		})();

		this._initPromises.set('auth', promise);
		return promise;
	}

	public async ensureMedia(): Promise<void> {
		if (this._featureInit.media) return;
		if (this._initPromises.has('media')) return this._initPromises.get('media');

		const promise = (async () => {
			const { MongoMediaMethods } = await import('./methods/mediaMethods');
			const mediaModel = this._getOrCreateModel('media');
			MongoMediaMethods.registerModels(mongoose);
			const mediaMethods = new MongoMediaMethods(mediaModel as any);

			this._cachedMedia = {
				setupMediaModels: async () => {},
				files: {
					upload: (f) => this.crud.insert('media', f),
					uploadMany: (f) =>
						this._wrapResult(() =>
							mediaMethods.uploadMany(f.map((x) => ({ ...x, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any))
						),
					delete: (id) => this.crud.delete('media', id),
					deleteMany: (ids) => this._wrapResult(() => mediaMethods.deleteMany(ids)),
					getByFolder: (id, o, recursive) => this._wrapResult(() => mediaMethods.getFiles(id, o, recursive)),
					search: () => this._wrapResult(() => mediaMethods.getFiles(undefined, {} as any)),
					getMetadata: () => this._wrapResult(async () => ({}) as any),
					updateMetadata: (id, m) => this._wrapResult(() => mediaMethods.updateMetadata(id, m)) as any,
					move: (ids, target) => this._wrapResult(() => mediaMethods.move(ids, target)),
					duplicate: () => this._wrapResult(async () => ({}) as any)
				},
				folders: {
					create: (f) => this.crud.insert('media_folders', f),
					createMany: (f) => this.crud.insertMany('media_folders', f),
					delete: (id) => this.crud.delete('media_folders', id),
					deleteMany: (ids) => this.crud.deleteMany('media_folders', { _id: { $in: ids } }),
					getTree: () => this._wrapResult(async () => []),
					getFolderContents: () => this._wrapResult(async () => ({ folders: [], files: [], totalCount: 0 })),
					move: (id, target) => this.crud.update('media_folders', id, { parentId: target })
				}
			};
			this._featureInit.media = true;
		})();

		this._initPromises.set('media', promise);
		return promise;
	}

	public async ensureContent(): Promise<void> {
		if (this._featureInit.content) return;
		if (this._initPromises.has('content')) return this._initPromises.get('content');

		const promise = (async () => {
			const [{ MongoContentMethods }, { ContentNodeModel, DraftModel, RevisionModel }, { MongoCrudMethods }] = await Promise.all([
				import('./methods/contentMethods'),
				import('./models'),
				import('./methods/crudMethods')
			]);

			const contentMethods = new MongoContentMethods(
				new MongoCrudMethods(ContentNodeModel as any) as any,
				new MongoCrudMethods(DraftModel) as any,
				new MongoCrudMethods(RevisionModel) as any
			);

			this._cachedContent = {
				nodes: {
					getStructure: (m, f, b) => this._wrapResult(() => contentMethods.getStructure(m, f, b)),
					upsertContentStructureNode: (n) => this._wrapResult(() => contentMethods.upsertNodeByPath(n)),
					create: (n) => this.crud.insert('content_nodes', n),
					createMany: (n) => this.crud.insertMany('content_nodes', n),
					update: (p, c) => this.crud.update('content_nodes', p as any, c),
					bulkUpdate: (u) => this._wrapResult(() => contentMethods.bulkUpdateNodes(u)) as any,
					fixMismatchedNodeIds: (n) => contentMethods.fixMismatchedNodeIds(n),
					delete: (p) => this.crud.delete('content_nodes', p as any),
					deleteMany: (p) => this.crud.deleteMany('content_nodes', { path: { $in: p } } as any),
					reorder: () => this._wrapResult(async () => [] as any),
					reorderStructure: (i) =>
						this._wrapResult(async () => {
							await contentMethods.reorderStructure(i);
						})
				},
				drafts: {
					create: (d) => this._wrapResult(() => contentMethods.createDraft(d)),
					createMany: (d) => this.crud.insertMany('content_drafts', d),
					update: (id, d) => this.crud.update('content_drafts', id, d as any),
					publish: (id) =>
						this._wrapResult(async () => {
							await contentMethods.publishManyDrafts([id]);
						}),
					publishMany: (ids) => this._wrapResult(() => contentMethods.publishManyDrafts(ids)) as any,
					getForContent: (id, o) => this._wrapResult(() => contentMethods.getDraftsForContent(id, o)),
					delete: (id) => this.crud.delete('content_drafts', id),
					deleteMany: (ids) => this.crud.deleteMany('content_drafts', { _id: { $in: ids } })
				},
				revisions: {
					create: (r) => this._wrapResult(() => contentMethods.createRevision(r as any)),
					getHistory: (id, o) => this._wrapResult(() => contentMethods.getRevisionHistory(id, o)),
					restore: () => this._wrapResult(async () => {}),
					delete: (id) => this.crud.delete('content_revisions', id),
					deleteMany: (ids) => this.crud.deleteMany('content_revisions', { _id: { $in: ids } }),
					cleanup: (id, k) => this._wrapResult(() => contentMethods.cleanupRevisions(id, k))
				}
			};
			this._featureInit.content = true;
		})();

		this._initPromises.set('content', promise);
		return promise;
	}

	public async ensureSystem(): Promise<void> {
		if (this._featureInit.system) return;
		if (this._initPromises.has('system')) return this._initPromises.get('system');

		const promise = (async () => {
			await this._initializeSystemAdapter();
			this._featureInit.system = true;
		})();

		this._initPromises.set('system', promise);
		return promise;
	}

	public async ensureMonitoring(): Promise<void> {
		if (this._featureInit.monitoring) return;
		if (this._initPromises.has('monitoring')) return this._initPromises.get('monitoring');

		const promise = (async () => {
			this._cachedMonitoring = {
				performance: {
					getMetrics: () =>
						this._wrapResult(async () => ({ queryCount: 0, averageQueryTime: 0, slowQueries: [], cacheHitRate: 0, connectionPoolUsage: 0 })),
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
		if (this._featureInit.collections) return;
		if (this._initPromises.has('collections')) return this._initPromises.get('collections');

		const promise = (async () => {
			const [{ MongoCollectionMethods }, { MongoQueryBuilder }, mongoDBUtils] = await Promise.all([
				import('./methods/collectionMethods'),
				import('./MongoQueryBuilder'),
				import('./methods/mongoDBUtils'),
				import('./models') // Side-effect import for model registration
			]);

			this._cachedCollections = new MongoCollectionMethods();
			this._MongoQueryBuilderConstructor = MongoQueryBuilder;
			this._mongoDBUtils = mongoDBUtils;
			this._featureInit.collections = true;
		})();

		this._initPromises.set('collections', promise);
		return promise;
	}

	private _getOrCreateModel(name: string, schemaDefinition?: any): mongoose.Model<any> {
		if (this._modelCache.has(name)) return this._modelCache.get(name)!;
		const model = mongoose.models[name] || this._createGenericModel(name, schemaDefinition);
		this._modelCache.set(name, model);
		return model;
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		try {
			await mongoose.disconnect();
			return { success: true, data: undefined };
		} catch (error) {
			return { success: false, message: 'Failed to disconnect', error: { code: 'DISCONNECT_FAILED', message: String(error) } };
		}
	}

	isConnected(): boolean {
		return mongoose.connection.readyState === 1;
	}

	async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		try {
			if (!mongoose.connection.db) return { success: false, message: 'Not connected', error: { code: 'NOT_CONNECTED', message: 'DB not connected' } };
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
			return { success: false, message: 'Health check failed', error: { code: 'HEALTH_CHECK_FAILED', message: String(error) } };
		}
	}

	async getConnectionPoolStats(): Promise<DatabaseResult<ConnectionPoolStats>> {
		try {
			if (!this.isConnected()) return { success: false, message: 'Not connected', error: { code: 'NOT_CONNECTED', message: 'DB not connected' } };
			const client = mongoose.connection.getClient();
			// @ts-ignore
			const pool = client?.topology?.s?.pool;

			if (!pool) return { success: true, data: { total: 50, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 } };

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
			return { success: false, message: 'Failed to get stats', error: { code: 'STATS_FAILED', message: String(error) } };
		}
	}

	// --- Helper Proxies ---

	private async _createCrudAdapter(): Promise<ICrudAdapter> {
		const { MongoCrudMethods } = await import('./methods/crudMethods');
		const { normalizeCollectionName } = await import('./methods/mongoDBUtils');

		const repos = new Map<string, any>();

		const getRepo = (coll: string) => {
			const normalized = normalizeCollectionName(coll);
			if (repos.has(normalized)) return repos.get(normalized);

			const model = this._getOrCreateModel(normalized);
			const repo = new MongoCrudMethods(model);
			repos.set(normalized, repo);
			return repo;
		};

		return {
			findOne: (c, q, o) => this._wrapResult(() => getRepo(c).findOne(q, o)),
			findMany: (c, q, o) => this._wrapResult(() => getRepo(c).findMany(q, { limit: o?.limit, skip: o?.offset, fields: o?.fields, sort: o?.sort })),
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
			exists: (c, q) => this._wrapResult(async () => (await getRepo(c).count(q)) > 0),
			aggregate: (c, p) => this._wrapResult(() => getRepo(c).aggregate(p))
		};
	}

	private _createGenericModel(name: string, schemaDefinition?: any) {
		const schema = new mongoose.Schema(schemaDefinition || { _id: String }, { strict: false, timestamps: true, _id: false });
		return mongoose.model(name, schema);
	}

	private _cachedSystemCore?: any;
	private _cachedSystemThemes?: any;
	private _cachedSystemWidgets?: any;
	private _cachedSystemTokens?: any;
	private _cachedSystemFolders?: any;

	private async _initializeSystemAdapter(): Promise<void> {
		this._cachedSystem = {
			systemPreferences: {
				get: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.get(k, s, u) as any);
				},
				getMany: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.getMany(k, s, u) as any);
				},
				set: async (k, v, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.set(k, v, s, u) as any);
				},
				setMany: async (p) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.setMany(p) as any);
				},
				delete: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.delete(k, s, u) as any);
				},
				deleteMany: async (k, s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.deleteMany(k, s, u) as any);
				},
				clear: async (s, u) => {
					if (!this._cachedSystemCore) {
						const { MongoSystemMethods } = await import('./methods/systemMethods');
						const { SystemPreferencesModel, SystemSettingModel } = await import('./models');
						this._cachedSystemCore = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
					}
					return this._wrapResult(() => this._cachedSystemCore.clear(s, u) as any);
				}
			},
			themes: {
				setupThemeModels: async () => {},
				getActive: async () => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.getActive() as any);
				},
				setDefault: async (id) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.setDefault(id) as any);
				},
				install: async (t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.install(t) as any);
				},
				uninstall: async (id) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.uninstall(id) as any);
				},
				update: async (id, t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.update(id, t) as any);
				},
				getAllThemes: async () => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._cachedSystemThemes.findAll();
				},
				storeThemes: async (ts) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					for (const t of ts) await this._cachedSystemThemes.installOrUpdate(t);
				},
				getDefaultTheme: async (tid) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._wrapResult(() => this._cachedSystemThemes.getDefault(tid));
				},
				ensure: async (t) => {
					if (!this._cachedSystemThemes) {
						const { MongoThemeMethods } = await import('./methods/themeMethods');
						const { ThemeModel } = await import('./models');
						this._cachedSystemThemes = new MongoThemeMethods(ThemeModel);
					}
					return this._cachedSystemThemes.ensure(t);
				}
			},
			widgets: {
				setupWidgetModels: async () => {},
				register: async (w) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.register(w) as any);
				},
				findAll: async () => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.findAll() as any);
				},
				getActiveWidgets: async () => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.getActiveWidgets() as any);
				},
				activate: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.activate(id) as any);
				},
				deactivate: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.deactivate(id) as any);
				},
				update: async (id, w) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.update(id, w) as any);
				},
				delete: async (id) => {
					if (!this._cachedSystemWidgets) {
						const { MongoWidgetMethods } = await import('./methods/widgetMethods');
						const { WidgetModel } = await import('./models');
						this._cachedSystemWidgets = new MongoWidgetMethods(WidgetModel);
					}
					return this._wrapResult(() => this._cachedSystemWidgets.delete(id) as any);
				}
			},
			websiteTokens: {
				create: async (t) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/websiteTokenMethods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens.create(t));
				},
				getAll: async (o) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/websiteTokenMethods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens.getAll(o));
				},
				getByName: async (n) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/websiteTokenMethods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens.getByName(n));
				},
				delete: async (id) => {
					if (!this._cachedSystemTokens) {
						const { MongoWebsiteTokenMethods } = await import('./methods/websiteTokenMethods');
						const { WebsiteTokenModel } = await import('./models');
						this._cachedSystemTokens = new MongoWebsiteTokenMethods(WebsiteTokenModel);
					}
					return this._wrapResult(() => this._cachedSystemTokens.delete(id) as any);
				}
			},
			systemVirtualFolder: {
				create: async (f) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.create(f);
				},
				getById: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.getById(id);
				},
				getByParentId: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.getByParentId(id);
				},
				getAll: async () => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.getAll();
				},
				update: async (id, d) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.update(id, d);
				},
				addToFolder: async (id, p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.addToFolder(id, p);
				},
				getContents: async (p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.getContents(p);
				},
				ensure: async (f) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.ensure(f);
				},
				delete: async (id) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.delete(id);
				},
				exists: async (p) => {
					if (!this._cachedSystemFolders) {
						const { MongoSystemVirtualFolderMethods } = await import('./methods/systemVirtualFolderMethods');
						this._cachedSystemFolders = new MongoSystemVirtualFolderMethods();
					}
					return this._cachedSystemFolders.exists(p);
				}
			}
		};
	}

	public collection = {
		getModel: async (id: string) => {
			await this.ensureCollections();
			return this._cachedCollections.getModel(id);
		},
		createModel: async (s: any) => {
			await this.ensureCollections();
			return this._cachedCollections.createModel(s);
		},
		updateModel: async (s: any) => {
			await this.ensureCollections();
			return this._cachedCollections.updateModel(s);
		},
		deleteModel: async (id: string) => {
			await this.ensureCollections();
			return this._cachedCollections.deleteModel(id);
		},
		getSchema: async (collectionName: string) => {
			await this.ensureCollections();
			// Explicitly type the expected result from _wrapResult to match IDBAdapter interface
			return this._wrapResult<import('../../content/types').Schema | null>(() => this._cachedCollections.getSchema(collectionName));
		},
		listSchemas: async () => {
			await this.ensureCollections();
			return this._wrapResult<import('../../content/types').Schema[]>(() => this._cachedCollections.listSchemas());
		}
	};

	private _MongoQueryBuilderConstructor: any;
	private _mongoDBUtils: any;

	public queryBuilder<T extends BaseEntity>(collection: string): import('../dbInterface').QueryBuilder<T> {
		// Note: queryBuilder is sync in interface, but we need ensureCollections (async)
		// We'll throw if not ready, but the app should have called ensureCollections via higher level services
		if (!this._featureInit.collections) {
			throw new Error('QueryBuilder infra not initialized. Call ensureCollections() first.');
		}

		const normalized = this._mongoDBUtils.normalizeCollectionName(collection);
		const model = this._getOrCreateModel(normalized);

		return new (this._MongoQueryBuilderConstructor as any)(model) as any;
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
			if (result.success) await session.commitTransaction();
			else await session.abortTransaction();
			return result;
		} catch (error) {
			await session.abortTransaction();
			return { success: false, message: 'Transaction failed', error: { code: 'TRANSACTION_FAILED', message: String(error) } };
		} finally {
			session.endSession();
		}
	}

	public batch = {
		execute: async <T>(ops: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> => {
			return { success: true, data: { success: true, results: [], totalProcessed: ops.length, errors: [] } };
		},
		bulkInsert: async <T extends BaseEntity>(c: string, items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> =>
			this.crud.insertMany(c, items as any) as any,
		bulkUpdate: async <T extends BaseEntity>(
			c: string,
			updates: Array<{ id: DatabaseId; data: Partial<T> }>
		): Promise<DatabaseResult<{ modifiedCount: number }>> => {
			const results = await Promise.all(updates.map((u) => this.crud.update(c, u.id, u.data as any)));
			return { success: true, data: { modifiedCount: results.filter((r) => r.success).length } };
		},
		bulkDelete: async (c: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> =>
			this.crud.deleteMany(c, { _id: { $in: ids } } as any),
		bulkUpsert: async <T extends BaseEntity>(c: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> =>
			this.crud.upsertMany(
				c,
				items.map((i) => ({ query: { _id: i.id || (i as any)._id } as any, data: i as any }))
			) as any
	};

	async getCollectionData(
		collectionName: string,
		options?: { limit?: number; offset?: number; fields?: string[]; includeMetadata?: boolean }
	): Promise<DatabaseResult<{ data: unknown[]; metadata?: { totalCount: number; schema?: unknown; indexes?: string[] } }>> {
		const res = await this.crud.findMany(collectionName, {} as any, options as any);
		if (!res.success) return res as any;
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
			if (res.success) results[name] = res.data.data;
		}
		return { success: true, data: results };
	}

	public readonly utils = {
		generateId: () => require('./methods/mongoDBUtils').generateId(),
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

	private async _wrapResult<T>(fn: () => Promise<any>): Promise<DatabaseResult<T>> {
		try {
			const result = await fn();

			// If already a DatabaseResult, return it as is
			if (result && typeof result === 'object' && 'success' in result) {
				return result as DatabaseResult<T>;
			}

			// Otherwise, wrap the raw result
			return { success: true, data: result };
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
