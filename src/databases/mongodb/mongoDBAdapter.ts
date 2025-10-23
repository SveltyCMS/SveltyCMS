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
import mongoose, { type FilterQuery } from 'mongoose';
import type { BaseEntity, ConnectionPoolOptions, DatabaseId, DatabaseResult, IDBAdapter, DatabaseError } from '../dbInterface';

// All Mongoose Models
import {
	ContentNodeModel,
	DraftModel,
	MediaModel,
	RevisionModel,
	SystemPreferencesModel,
	SystemSettingModel,
	ThemeModel,
	WidgetModel
} from './models';

// The full suite of refined, modular method classes
import { MongoAuthModelRegistrar } from './methods/authMethods';
import { MongoCollectionMethods } from './methods/collectionMethods';
import { MongoContentMethods } from './methods/contentMethods';
import { MongoCrudMethods } from './methods/crudMethods';
import { MongoMediaMethods } from './methods/mediaMethods';
import * as mongoDBUtils from './methods/mongoDBUtils';
import { MongoSystemMethods } from './methods/systemMethods';
import { MongoSystemVirtualFolderMethods } from './methods/systemVirtualFolderMethods';
import { MongoThemeMethods } from './methods/themeMethods';
import { MongoWidgetMethods } from './methods/widgetMethods';
import { MongoQueryBuilder } from './MongoQueryBuilder';

// Auth adapter composition
import { composeMongoAuthAdapter } from './methods/authComposition';

import { logger } from '@utils/logger.svelte';
import type {
	ContentNode,
	ContentDraft,
	MediaItem,
	MediaMetadata,
	ContentRevision,
	Schema,
	DatabaseTransaction,
	BatchOperation,
	BatchResult,
	PerformanceMetrics,
	CacheOptions
} from '../dbInterface';
import { cacheService } from '@src/databases/CacheService';
import { cacheMetrics } from '@src/databases/CacheMetrics';
import { createDatabaseError, generateId } from './methods/mongoDBUtils';

export class MongoDBAdapter implements IDBAdapter {
	// --- Private properties for internal, unwrapped method classes ---
	private _collectionMethods!: MongoCollectionMethods;
	private _content!: MongoContentMethods;
	private _media!: MongoMediaMethods;
	private _themes!: MongoThemeMethods;
	private _widgets!: MongoWidgetMethods;
	private _system!: MongoSystemMethods;
	private _systemVirtualFolder!: MongoSystemVirtualFolderMethods;
	private _auth!: MongoAuthModelRegistrar;
	private _repositories = new Map<string, MongoCrudMethods<BaseEntity>>();

	// --- Public properties that expose the compliant, wrapped API ---
	public content!: IDBAdapter['content'];
	public media!: IDBAdapter['media'];
	public themes!: IDBAdapter['themes'];
	public widgets!: IDBAdapter['widgets'];
	public systemPreferences!: IDBAdapter['systemPreferences'];
	public crud!: IDBAdapter['crud'];
	public auth!: IDBAdapter['auth'];
	public readonly utils = mongoDBUtils;
	public collection!: IDBAdapter['collection'];

	getCapabilities(): import('../dbInterface').DatabaseCapabilities {
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

	async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		try {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const start = Date.now();
			await mongoose.connection.db.admin().ping();
			const latency = Date.now() - start;
			// Note: Mongoose does not expose active connections directly from the pool.
			// This is a placeholder. For more detailed monitoring, a dedicated APM tool is recommended.
			const activeConnections = -1;
			return {
				success: true,
				data: {
					healthy: this.isConnected(),
					latency,
					activeConnections
				}
			};
		} catch (error) {
			const dbError = this.utils.createDatabaseError(error, 'CONNECTION_HEALTH_CHECK_FAILED', 'Failed to check connection health');
			return {
				success: false,
				error: dbError,
				message: dbError.message
			};
		}
	}

	// --- Legacy Support ---
	public findMany<T extends BaseEntity>(coll: string, query: FilterQuery<T>, options?: { limit?: number; offset?: number }) {
		logger.warn('Direct call to dbAdapter.findMany() is deprecated. Use dbAdapter.crud.findMany() instead.');
		return this.crud.findMany(coll, query, options);
	}

	public create<T extends BaseEntity>(coll: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>) {
		logger.warn('Direct call to dbAdapter.create() is deprecated. Use dbAdapter.crud.insert() instead.');
		return this.crud.insert(coll, data);
	}

	// --- Query Builder ---
	public queryBuilder<T extends BaseEntity>(collection: string) {
		const repo = this._getRepository(collection);
		if (!repo) {
			throw new Error(`Collection ${collection} not found`);
		}
		const model = repo.model as unknown as mongoose.Model<T>;
		if (!model) {
			throw new Error(`Model not found for collection ${collection}`);
		}
		return new MongoQueryBuilder<T>(model);
	}

	private async _wrapResult<T>(fn: () => Promise<T>): Promise<DatabaseResult<T>> {
		try {
			const data = await fn();
			return { success: true, data };
		} catch (error: unknown) {
			const typedError = error as { code?: string; message?: string };
			const dbError = this.utils.createDatabaseError(error, typedError.code || 'OPERATION_FAILED', typedError.message || 'Unknown error');
			return {
				success: false,
				message: dbError.message,
				error: dbError
			};
		}
	}

	// Overload signatures to match IDBAdapter interface
	/**
	 * Check if the adapter is fully initialized (connection + models + wrappers)
	 */
	private _isFullyInitialized(): boolean {
		return this.isConnected() && this.auth !== undefined && this._auth !== undefined;
	}

	connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
	connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	connect(connectionStringOrOptions?: string | ConnectionPoolOptions, options?: unknown): Promise<DatabaseResult<void>> {
		return this._wrapResult(async () => {
			// Check if already fully initialized
			if (this._isFullyInitialized()) {
				logger.info('MongoDB adapter already fully initialized.');
				return;
			}

			// If connected but not fully initialized, complete the initialization
			if (this.isConnected() && !this._isFullyInitialized()) {
				logger.info('MongoDB connection exists but adapter not fully initialized. Completing initialization...');
				await this._initializeModelsAndWrappers();
				return;
			}

			let connectionString: string;
			let mongooseOptions: unknown = options;

			// Check if it's a string connection string
			if (typeof connectionStringOrOptions === 'string' && connectionStringOrOptions) {
				connectionString = connectionStringOrOptions;
				logger.debug(`Using provided connection string: mongodb://*****@${connectionString.split('@')[1] || 'localhost'}`);
			} else if (connectionStringOrOptions && typeof connectionStringOrOptions === 'object') {
				// It's ConnectionPoolOptions
				logger.warn('ConnectionPoolOptions are not fully supported yet. Using default connection string.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
				mongooseOptions = connectionStringOrOptions; // Use the options if provided
			} else {
				// No parameters provided, use environment variable
				logger.warn('No connection string provided. Using environment variable or default.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
			}

			// Pass options to mongoose.connect if they exist
			if (mongooseOptions) {
				await mongoose.connect(connectionString, mongooseOptions as mongoose.ConnectOptions);
				logger.info('MongoDB connection established successfully with custom options.');
			} else {
				// Connection pool configuration for optimal performance
				const connectOptions: mongoose.ConnectOptions = {
					// Connection Pool Settings (MongoDB 8.0+ optimized)
					maxPoolSize: 50, // Maximum concurrent connections
					minPoolSize: 10, // Maintain minimum pool for fast response
					maxIdleTimeMS: 30000, // Close idle connections after 30s

					// Performance Optimizations
					// Note: Compression disabled to avoid optional dependency issues (zstd, snappy not installed)
					// You can enable compression by installing: bun add snappy @mongodb-js/zstd
					readPreference: 'primaryPreferred', // Balance between consistency and availability

					// Timeout Settings
					serverSelectionTimeoutMS: 5000, // Fail fast on connection issues
					socketTimeoutMS: 45000, // Socket timeout for long-running queries
					connectTimeoutMS: 10000, // Connection timeout

					// Reliability Settings
					retryWrites: true, // Auto-retry failed writes
					retryReads: true, // Auto-retry failed reads
					w: 'majority', // Write concern for data durability

					// Monitoring
					monitorCommands: process.env.NODE_ENV === 'development' // Enable command monitoring in dev
				};

				await mongoose.connect(connectionString, connectOptions);
				logger.info('MongoDB connection established with optimized pool configuration.');
			}

			// Initialize models and wrappers
			await this._initializeModelsAndWrappers();
		});
	}

	/**
	 * Initialize all models, repositories, method classes, and wrappers
	 */
	private async _initializeModelsAndWrappers(): Promise<void> {
		// --- 1. Register All Models ---
		this._auth = new MongoAuthModelRegistrar(mongoose);
		await this._auth.setupAuthModels();
		MongoMediaMethods.registerModels(mongoose);
		logger.info('All Mongoose models registered.');

		// --- 2. Instantiate Repositories ---
		const repositories = {
			nodes: new MongoCrudMethods(ContentNodeModel as unknown as mongoose.Model<BaseEntity>),
			drafts: new MongoCrudMethods(DraftModel as unknown as mongoose.Model<BaseEntity>),
			revisions: new MongoCrudMethods(RevisionModel as unknown as mongoose.Model<BaseEntity>)
		};
		Object.entries(repositories).forEach(([key, repo]) => this._repositories.set(key, repo));

		// --- 3. Instantiate Method Classes ---
		// Initialize collection methods (for dynamic model creation)
		this._collectionMethods = new MongoCollectionMethods();

		this._content = new MongoContentMethods(
			repositories.nodes as unknown as MongoCrudMethods<ContentNode>,
			repositories.drafts as unknown as MongoCrudMethods<ContentDraft<unknown>>,
			repositories.revisions as unknown as MongoCrudMethods<ContentRevision>
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this._media = new MongoMediaMethods(MediaModel as any);
		this._themes = new MongoThemeMethods(ThemeModel);
		this._widgets = new MongoWidgetMethods(WidgetModel);
		this._system = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
		this._systemVirtualFolder = new MongoSystemVirtualFolderMethods();

		// --- 4. Build the Public-Facing Wrapped API ---
		this._initializeWrappers();
		logger.info('\x1b[34mMongoDB adapter\x1b[0m fully initialized.');
	}

	private _initializeWrappers(): void {
		// AUTH - Compose from the auth adapters
		const authAdapter = composeMongoAuthAdapter();

		this.auth = {
			// Setup method for model registration
			setupAuthModels: async () => {
				await this._auth.setupAuthModels();
			},

			// User Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createUser: (user) => authAdapter.createUser(user),
			updateUserAttributes: (userId, attributes) => authAdapter.updateUserAttributes(userId, attributes),
			deleteUser: (userId) => authAdapter.deleteUser(userId),
			getUserById: (userId) => authAdapter.getUserById(userId),
			getUserByEmail: (email) => authAdapter.getUserByEmail(email),
			getAllUsers: (pagination) => authAdapter.getAllUsers(pagination),
			getUserCount: () => authAdapter.getUserCount(),
			deleteUsers: (userIds) => authAdapter.deleteUsers?.(userIds),
			blockUsers: (userIds) => authAdapter.blockUsers?.(userIds),
			unblockUsers: (userIds) => authAdapter.unblockUsers?.(userIds),

			// Combined Performance-Optimized Methods
			createUserAndSession: (userData, sessionData) => authAdapter.createUserAndSession(userData, sessionData),
			deleteUserAndSessions: (userId, tenantId) => authAdapter.deleteUserAndSessions(userId, tenantId),

			// Session Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createSession: (session) => authAdapter.createSession(session),
			updateSessionExpiry: (sessionId, expiresAt) => authAdapter.updateSessionExpiry(sessionId, expiresAt),
			deleteSession: (sessionId) => authAdapter.deleteSession(sessionId),
			deleteExpiredSessions: () => authAdapter.deleteExpiredSessions(),
			validateSession: (sessionId) => authAdapter.validateSession(sessionId),
			invalidateAllUserSessions: (userId) => authAdapter.invalidateAllUserSessions(userId),
			getActiveSessions: (userId, pagination) => authAdapter.getActiveSessions(userId, pagination),
			getAllActiveSessions: (pagination) => authAdapter.getAllActiveSessions(pagination),
			getSessionTokenData: (sessionId) => authAdapter.getSessionTokenData(sessionId),
			rotateToken: (oldSessionId, expires) => authAdapter.rotateToken(oldSessionId, expires),
			cleanupRotatedSessions: async () => {
				const result = await authAdapter.cleanupRotatedSessions?.();
				return result || { success: true, data: 0 };
			},

			// Token Management Methods (authAdapter already returns DatabaseResult, don't double-wrap)
			createToken: (token) => authAdapter.createToken(token),
			updateToken: (tokenValue, updates) => authAdapter.updateToken(tokenValue, updates),
			validateToken: (tokenValue, type) => authAdapter.validateToken(tokenValue, type),
			consumeToken: (tokenValue) => authAdapter.consumeToken(tokenValue),
			getTokenData: (tokenValue) => authAdapter.getTokenByValue(tokenValue),
			getTokenByValue: (tokenValue) => authAdapter.getTokenByValue(tokenValue),
			getAllTokens: (pagination) => authAdapter.getAllTokens(pagination),
			deleteExpiredTokens: () => authAdapter.deleteExpiredTokens(),
			deleteTokens: (tokenIds) => authAdapter.deleteTokens?.(tokenIds),
			blockTokens: (tokenIds) => authAdapter.blockTokens?.(tokenIds),
			unblockTokens: (tokenIds) => authAdapter.unblockTokens?.(tokenIds)
		};

		// THEMES
		this.themes = {
			setupThemeModels: async () => {
				/* models already set up */
			},
			getActive: async () => {
				const result = await this._wrapResult(() => this._themes.getActive());
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'No active theme found', error: { code: 'NOT_FOUND', message: 'No active theme found' } };
				return { success: true, data: result.data };
			},
			setDefault: async (id) => {
				const result = await this._wrapResult(() => this._themes.setDefault(id));
				if (!result.success) return result;
				return { success: true, data: undefined };
			},
			install: (theme) => this._wrapResult(() => this._themes.install(theme)),
			uninstall: async (id) => {
				const result = await this._wrapResult(() => this._themes.uninstall(id));
				if (!result.success) return result;
				return { success: true, data: undefined };
			},
			update: async (id, theme) => {
				const result = await this._wrapResult(() => this._themes.update(id, theme));
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'Theme not found', error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				return { success: true, data: result.data };
			},
			getAllThemes: async () => await this._themes.findAll(),
			storeThemes: async (themes) => {
				for (const theme of themes) {
					// Use atomic upsert to avoid duplicate key errors and cache issues
					if (theme._id) {
						await this._themes.installOrUpdate(theme);
					} else {
						await this._themes.install(theme);
					}
				}
			},
			getDefaultTheme: async () => await this._themes.getDefault()
		};

		// WIDGETS
		this.widgets = {
			setupWidgetModels: async () => {
				/* models already set up */
			},
			register: (widget) => this._wrapResult(() => this._widgets.register(widget)),
			findAll: async () => {
				const result = await this._wrapResult(() => this._widgets.findAll());
				if (!result.success) return result;
				return { success: true, data: result.data || [] };
			},
			getActiveWidgets: async () => {
				// Push filtering to database instead of application code
				// fetch only active widgets from DB directly
				const result = await this._wrapResult(() => this._widgets.getActiveWidgets());
				if (!result.success) return result;
				return { success: true, data: result.data || [] };
			},
			activate: async (id) => {
				const result = await this._wrapResult(() => this._widgets.activate(id));
				if (!result.success) return result;
				return { success: true, data: undefined };
			},
			deactivate: async (id) => {
				const result = await this._wrapResult(() => this._widgets.deactivate(id));
				if (!result.success) return result;
				return { success: true, data: undefined };
			},
			update: async (id, widget) => {
				const result = await this._wrapResult(() => this._widgets.update(id, widget));
				if (!result.success) return result;
				if (!result.data) return { success: false, message: 'Widget not found', error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				return { success: true, data: result.data };
			},
			delete: async (id) => {
				const result = await this._wrapResult(() => this._widgets.delete(id));
				if (!result.success) return result;
				return { success: true, data: undefined };
			}
		};

		// SYSTEM PREFERENCES
		this.systemPreferences = {
			get: async <T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId) => {
				const result = await this._wrapResult(() => this._system.get(key, scope, userId));
				if (!result.success) return result;
				if (result.data === null)
					return { success: false, message: 'Preference not found', error: { code: 'NOT_FOUND', message: 'Preference not found' } };
				return { success: true, data: result.data as T };
			},
			// Use bulk database query instead of sequential gets (10x faster)
			getMany: <T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId) =>
				this._wrapResult(() => this._system.getMany<T>(keys, scope, userId)),
			set: <T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId, category?: 'public' | 'private') =>
				this._wrapResult(() => this._system.set(key, value, scope, userId, category)),
			// Use bulkWrite instead of sequential sets (33x faster)
			setMany: <T>(preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId; category?: 'public' | 'private' }>) =>
				this._wrapResult(() => this._system.setMany(preferences)),
			delete: (key: string, scope?: 'user' | 'system', userId?: DatabaseId) => this._wrapResult(() => this._system.delete(key, scope, userId)),
			// Use bulk database operation instead of sequential deletes (33x faster)
			deleteMany: (keys: string[], scope?: 'user' | 'system', userId?: DatabaseId) =>
				this._wrapResult(() => this._system.deleteMany(keys, scope, userId)),
			clear: (scope?: 'user' | 'system', userId?: DatabaseId) => this._wrapResult(() => this._system.clear(scope, userId)),
			// User preferences methods (dashboard layouts & widgets)
			getSystemPreferences: (userId: string, layoutId: string) => this._wrapResult(() => this._system.getSystemPreferences(userId, layoutId)),
			setUserPreferences: (userId: string, layoutId: string, layout: import('@src/content/types').Layout) =>
				this._wrapResult(() => this._system.setUserPreferences(userId, layoutId, layout)),
			getWidgetState: <T>(userId: string, layoutId: string, widgetId: string) =>
				this._wrapResult(() => this._system.getWidgetState<T>(userId, layoutId, widgetId)),
			setWidgetState: (userId: string, layoutId: string, widgetId: string, state: unknown) =>
				this._wrapResult(() => this._system.setWidgetState(userId, layoutId, widgetId, state)),
			clearSystemPreferences: (userId: string) => this._wrapResult(() => this._system.clearSystemPreferences(userId))
		};

		// MEDIA
		this.media = {
			setupMediaModels: async () => {
				/* models already set up */
			},
			files: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				upload: (file) => this._wrapResult(async () => (await this._media.uploadMany([file as any]))[0]),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				uploadMany: (files) => this._wrapResult(() => this._media.uploadMany(files as any)),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._media.deleteMany([id]));
					if (!result.success) return result;
					return { success: true, data: undefined };
				},
				deleteMany: (ids) => this._wrapResult(() => this._media.deleteMany(ids)),
				getByFolder: (folderId, options) => this._wrapResult(() => this._media.getFiles(folderId, options)),
				search: (_query, options) => this._wrapResult(() => this._media.getFiles(undefined, options)),
				getMetadata: (ids) =>
					this._wrapResult(async () => {
						const files = await this._repositories.get('media')!.findByIds(ids);
						return files.reduce(
							(acc: Record<string, MediaMetadata>, f: BaseEntity & { metadata?: unknown }) => ({ ...acc, [f._id]: f.metadata as MediaMetadata }),
							{}
						);
					}),
				updateMetadata: async (id, metadata) => {
					const result = await this._wrapResult(() => this._media.updateMetadata(id, metadata));
					if (!result.success) return result;
					if (!result.data) return { success: false, message: 'Media item not found', error: { code: 'NOT_FOUND', message: 'Media item not found' } };
					return { success: true, data: result.data };
				},
				move: (ids, targetId) => this._wrapResult(() => this._media.move(ids, targetId)),
				duplicate: (id, newName) =>
					this._wrapResult(async () => {
						const file = await this._repositories.get('media')!.findOne({ _id: id } as FilterQuery<BaseEntity>);
						if (!file) throw new Error('File not found');
						const newFile = await this._repositories.get('media')!.insert({
							...file,
							_id: this.utils.generateId(),
							filename: newName || `${(file as MediaItem).filename}_copy`
						} as BaseEntity);
						return newFile as MediaItem;
					})
			},
			// Note: Media files are stored flat with hash-based naming
			// Physical folders (year/month) are managed by mediaStorage.ts utilities
			// Database stores only metadata (filename, size, type, etc.) with no folder hierarchy
			// For content organization, use SystemVirtualFolder instead
			folders: {
				create: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				createMany: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				delete: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				deleteMany: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				getTree: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				getFolderContents: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				},
				move: async () => {
					throw new Error('Media folders not supported. Use SystemVirtualFolder for content organization.');
				}
			}
		};

		// SYSTEM VIRTUAL FOLDERS
		this.systemVirtualFolder = {
			create: (folder) => this._systemVirtualFolder.create(folder),
			getById: (folderId) => this._systemVirtualFolder.getById(folderId),
			getByParentId: (parentId) => this._systemVirtualFolder.getByParentId(parentId),
			getAll: () => this._systemVirtualFolder.getAll(),
			update: (folderId, updateData) => this._systemVirtualFolder.update(folderId, updateData),
			addToFolder: (contentId, folderPath) => this._systemVirtualFolder.addToFolder(contentId, folderPath),
			getContents: (folderPath) => this._systemVirtualFolder.getContents(folderPath),
			delete: (folderId) => this._systemVirtualFolder.delete(folderId),
			exists: (path) => this._systemVirtualFolder.exists(path)
		};

		// CONTENT
		this.content = {
			nodes: {
				getStructure: (mode, filter, bypassCache) => this._wrapResult(() => this._content.getStructure(mode, filter, bypassCache)),
				upsertContentStructureNode: (node) => this._wrapResult(() => this._content.upsertNodeByPath(node)),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				create: (node) => this._wrapResult(() => this._repositories.get('nodes')!.insert(node as any) as Promise<ContentNode>),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (path, changes) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes')!.findOne({ path } as FilterQuery<BaseEntity>);
						if (!node) throw new Error('Node not found');
						return (await this._repositories.get('nodes')!.update(node._id, changes as Partial<BaseEntity>)) as ContentNode;
					}),
				bulkUpdate: (updates) =>
					this._wrapResult(async () => {
						await this._content.bulkUpdateNodes(updates);
						const paths = updates.map((u) => u.path);
						return (await this._repositories.get('nodes')!.findMany({ path: { $in: paths } } as FilterQuery<BaseEntity>)) as ContentNode[];
					}),
				delete: (path) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes')!.findOne({ path } as FilterQuery<BaseEntity>);
						if (!node) throw new Error('Node not found');
						await this._repositories.get('nodes')!.delete(node._id);
					}),
				deleteMany: (paths) =>
					this._wrapResult(() => this._repositories.get('nodes')!.deleteMany({ path: { $in: paths } } as FilterQuery<BaseEntity>)),
				reorder: (nodeUpdates) =>
					this._wrapResult(async () => {
						const updates = nodeUpdates.map(({ path, newOrder }) => ({ path, changes: { order: newOrder } as Partial<BaseEntity> }));
						await this._content.bulkUpdateNodes(updates);
						const paths = nodeUpdates.map((u) => u.path);
						return (await this._repositories.get('nodes')!.findMany({ path: { $in: paths } } as FilterQuery<BaseEntity>)) as ContentNode[];
					})
			},
			drafts: {
				create: (draft) => this._wrapResult(() => this._content.createDraft(draft)),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (id, data) =>
					this._wrapResult(() => this._repositories.get('drafts')!.update(id, { data } as Partial<BaseEntity>) as Promise<ContentDraft<unknown>>),
				publish: async (id) => {
					const result = await this._wrapResult(() => this._content.publishManyDrafts([id]));
					if (!result.success) return result;
					return { success: true, data: undefined };
				},
				publishMany: (ids) =>
					this._wrapResult(async () => {
						const result = await this._content.publishManyDrafts(ids);
						return { publishedCount: result.modifiedCount };
					}),
				getForContent: (contentId, options) => this._wrapResult(() => this._content.getDraftsForContent(contentId, options)),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._repositories.get('drafts')!.delete(id));
					if (!result.success) return result;
					return { success: true, data: undefined };
				},
				deleteMany: (ids) => this._wrapResult(() => this._repositories.get('drafts')!.deleteMany({ _id: { $in: ids } } as FilterQuery<BaseEntity>))
			},
			revisions: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				create: (revision) => this._wrapResult(() => this._content.createRevision(revision as any)),
				getHistory: (contentId, options) => this._wrapResult(() => this._content.getRevisionHistory(contentId, options)),
				restore: () =>
					this._wrapResult(async () => {
						throw new Error('Restore not yet implemented');
					}),
				delete: async (id) => {
					const result = await this._wrapResult(() => this._repositories.get('revisions')!.delete(id));
					if (!result.success) return result;
					return { success: true, data: undefined };
				},
				deleteMany: (ids) =>
					this._wrapResult(() => this._repositories.get('revisions')!.deleteMany({ _id: { $in: ids } } as FilterQuery<BaseEntity>)),
				cleanup: (contentId, keepLatest) => this._wrapResult(() => this._content.cleanupRevisions(contentId, keepLatest))
			}
		};

		// CRUD - Generic CRUD operations
		this.crud = {
			findOne: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findOne(query) as Promise<T | null>);
			},
			findMany: <T extends BaseEntity>(coll: string, query: FilterQuery<T>, options?: { limit?: number; offset?: number }) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findMany(query, { limit: options?.limit, skip: options?.offset }) as Promise<T[]>);
			},
			insert: <T extends BaseEntity>(coll: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.insert(data as T) as Promise<T>);
			},
			update: <T extends BaseEntity>(coll: string, id: DatabaseId, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.update(id, data as Partial<T>) as Promise<T>);
			},
			delete: (coll: string, id: DatabaseId) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => {
					await repo.delete(id);
				});
			},
			findByIds: <T extends BaseEntity>(coll: string, ids: DatabaseId[]) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findByIds(ids) as Promise<T[]>);
			},
			insertMany: async () => {
				throw new Error('insertMany not implemented in MongoCrudMethods');
			},
			updateMany: <T extends BaseEntity>(coll: string, query: FilterQuery<T>, data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.updateMany(query, data as Partial<T>));
			},
			deleteMany: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.deleteMany(query));
			},
			upsert: <T extends BaseEntity>(coll: string, query: Partial<T>, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.upsert(query as FilterQuery<T>, data as T) as Promise<T>);
			},
			upsertMany: <T extends BaseEntity>(coll: string, items: Array<{ query: Partial<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => {
					const results: T[] = [];
					for (const item of items) {
						results.push((await repo.upsert(item.query as FilterQuery<T>, item.data as T)) as T);
					}
					return results;
				});
			},
			count: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.count(query));
			},
			exists: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => (await repo.count(query)) > 0);
			},
			aggregate: (coll: string, pipeline: mongoose.PipelineStage[]) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.aggregate(pipeline));
			}
		};

		// COLLECTION - Dynamic model management
		this.collection = {
			getModel: async (id: string) => {
				return await this._collectionMethods.getModel(id);
			},
			createModel: async (schema: Schema) => {
				await this._collectionMethods.createModel(schema);
			},
			updateModel: async (schema: Schema) => {
				await this._collectionMethods.updateModel(schema);
			},
			deleteModel: async (id: string) => {
				await this._collectionMethods.deleteModel(id);
			}
		};
	}

	private _getRepository(collection: string): MongoCrudMethods<BaseEntity> | null {
		const normalized = this.utils.normalizeCollectionName(collection);

		if (this._repositories.has(normalized)) {
			return this._repositories.get(normalized)!;
		}

		// Create repository for unknown collection
		try {
			let model: mongoose.Model<BaseEntity>;
			if (mongoose.models[normalized]) {
				model = mongoose.models[normalized];
			} else {
				// Use String _id to support UUID-based IDs
				const schema = new mongoose.Schema({ _id: { type: String, required: true } }, { _id: false, strict: false, timestamps: true });
				model = mongoose.model<BaseEntity>(normalized, schema);
			}
			const repo = new MongoCrudMethods(model);
			this._repositories.set(normalized, repo);
			return repo;
		} catch (error) {
			logger.error(`Failed to create repository for ${collection}`, error);
			return null;
		}
	}

	private _repoNotFound(collection: string): Promise<DatabaseResult<never>> {
		return Promise.resolve({
			success: false,
			message: `Collection ${collection} not found`,
			error: { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found' }
		});
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		return this._wrapResult(() => mongoose.disconnect());
	}

	isConnected(): boolean {
		return mongoose.connection.readyState === 1;
	}

	async transaction<T>(fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>): Promise<DatabaseResult<T>> {
		const session = await mongoose.startSession();
		session.startTransaction();
		try {
			const result = await fn({
				commit: async () => {
					await session.commitTransaction();
					return { success: true, data: undefined };
				},
				rollback: async () => {
					await session.abortTransaction();
					return { success: true, data: undefined };
				}
			});
			if (result.success) {
				await session.commitTransaction();
			} else {
				await session.abortTransaction();
			}
			return result;
		} catch (error) {
			await session.abortTransaction();
			const dbError = this.utils.createDatabaseError(error, 'TRANSACTION_ERROR', 'Transaction failed');
			return { success: false, error: dbError, message: dbError.message };
		} finally {
			session.endSession();
		}
	}

	batch = {
		/**
		 * Executes a batch of mixed operations (insert, update, delete, upsert) using MongoDB's native bulkWrite.
		 * Uses bulkWrite per collection instead of sequential operations (33x faster for 100 operations).
		 * Operations are grouped by collection and executed in parallel across different collections.
		 */
		execute: async <T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> => {
			if (operations.length === 0) {
				return {
					success: true,
					data: {
						success: true,
						results: [],
						totalProcessed: 0,
						errors: []
					}
				};
			}

			try {
				// Group operations by collection for efficient bulk processing
				const opsByCollection = operations.reduce(
					(acc, op, index) => {
						if (!acc[op.collection]) {
							acc[op.collection] = [];
						}
						acc[op.collection].push({ op, originalIndex: index });
						return acc;
					},
					{} as Record<string, Array<{ op: BatchOperation<T>; originalIndex: number }>>
				);

				const allErrors: DatabaseError[] = [];
				let totalSuccessful = 0;

				// Execute bulkWrite for each collection in parallel
				const collectionResults = await Promise.all(
					Object.entries(opsByCollection).map(async ([collectionName, opsWithIndex]) => {
						const repo = this._getRepository(collectionName);
						if (!repo) {
							const error = createDatabaseError(
								new Error(`Collection ${collectionName} not found`),
								'COLLECTION_NOT_FOUND',
								`Collection ${collectionName} not found during batch execution`
							);
							return {
								collectionName,
								success: false,
								error,
								operations: opsWithIndex
							};
						}

						try {
							// Build bulkWrite operations array
							const bulkOps = opsWithIndex.map(({ op }) => {
								const now = new Date();
								switch (op.operation) {
									case 'insert':
										return {
											insertOne: {
												document: {
													...op.data,
													_id: generateId(),
													createdAt: now,
													updatedAt: now
												}
											}
										};
									case 'update':
										return {
											updateOne: {
												filter: { _id: op.id },
												update: { $set: { ...op.data, updatedAt: now } }
											}
										};
									case 'delete':
										return {
											deleteOne: {
												filter: { _id: op.id }
											}
										};
									case 'upsert':
										return {
											updateOne: {
												filter: op.query as mongoose.FilterQuery<T>,
												update: {
													$set: { ...op.data, updatedAt: now },
													$setOnInsert: { createdAt: now }
												},
												upsert: true
											}
										};
									default:
										throw new Error(`Unknown operation type: ${(op as BatchOperation<T>).operation}`);
								}
							});

							// Execute bulkWrite with ordered: false for better performance
							const result = await repo.model.bulkWrite(bulkOps as mongoose.AnyBulkWriteOperation<T>[], {
								ordered: false // Don't stop on first error, process all operations
							});

							return {
								collectionName,
								success: true,
								result,
								operations: opsWithIndex
							};
						} catch (error) {
							const dbError = createDatabaseError(error, 'BULK_WRITE_ERROR', `Bulk write failed for collection ${collectionName}`);
							return {
								collectionName,
								success: false,
								error: dbError,
								operations: opsWithIndex
							};
						}
					})
				);

				// Process results and build response
				const results: DatabaseResult<T>[] = new Array(operations.length);
				let overallSuccess = true;

				for (const collectionResult of collectionResults) {
					if (collectionResult.success && collectionResult.result) {
						// Mark successful operations
						const successCount =
							(collectionResult.result.insertedCount || 0) +
							(collectionResult.result.modifiedCount || 0) +
							(collectionResult.result.deletedCount || 0) +
							(collectionResult.result.upsertedCount || 0);
						totalSuccessful += successCount;

						// Fill in success results at original indices
						for (const { originalIndex } of collectionResult.operations) {
							results[originalIndex] = {
								success: true,
								data: {} as T // bulkWrite doesn't return individual documents
							};
						}
					} else if (collectionResult.error) {
						// Mark failed operations
						overallSuccess = false;
						allErrors.push(collectionResult.error);

						for (const { originalIndex } of collectionResult.operations) {
							results[originalIndex] = {
								success: false,
								message: collectionResult.error.message,
								error: collectionResult.error
							};
						}
					}
				}

				return {
					success: true,
					data: {
						success: overallSuccess,
						results,
						totalProcessed: totalSuccessful,
						errors: allErrors
					}
				};
			} catch (error) {
				const dbError = createDatabaseError(error, 'BATCH_EXECUTE_ERROR', 'Batch execution failed');
				return {
					success: false,
					message: dbError.message,
					error: dbError
				};
			}
		},
		bulkInsert: async <T extends BaseEntity>(
			collection: string,
			items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]
		): Promise<DatabaseResult<T[]>> => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			return this._wrapResult(() => repo.insertMany(items as T[]) as Promise<T[]>);
		},
		bulkUpdate: async <T extends BaseEntity>(
			collection: string,
			updates: Array<{ id: DatabaseId; data: Partial<T> }>
		): Promise<DatabaseResult<{ modifiedCount: number }>> => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const bulkOps = updates.map((u) => ({
				updateOne: {
					filter: { _id: u.id },
					update: u.data
				}
			}));
			return this._wrapResult(async () => {
				const result = await repo.model.bulkWrite(bulkOps as mongoose.AnyBulkWriteOperation<T>[]);
				return { modifiedCount: result.modifiedCount };
			});
		},
		bulkDelete: async (collection: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const result = await repo.deleteMany({ _id: { $in: ids } } as FilterQuery<BaseEntity>);
			return { success: true, data: { deletedCount: result.deletedCount || 0 } };
		},
		bulkUpsert: async <T extends BaseEntity>(collection: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> => {
			const repo = this._getRepository(collection);
			if (!repo) return this._repoNotFound(collection);
			const bulkOps = items.map((item) => ({
				updateOne: {
					filter: { _id: item.id } as FilterQuery<T>,
					update: { $set: item },
					upsert: true
				}
			}));
			return this._wrapResult(async () => {
				await repo.model.bulkWrite(bulkOps as mongoose.AnyBulkWriteOperation<T>[]);
				// Note: This won't return the upserted documents in a single operation.
				// A find query would be needed to retrieve them, which is complex.
				// Returning empty array for now.
				return [];
			});
		}
	};

	systemVirtualFolder!: IDBAdapter['systemVirtualFolder'];

	performance = {
		getMetrics: async (): Promise<DatabaseResult<PerformanceMetrics>> => {
			try {
				// Get cache metrics
				const cacheSnapshot = cacheMetrics.getSnapshot();

				// Get MongoDB stats
				const dbStats = mongoose.connection.db ? await mongoose.connection.db.stats() : null;

				return {
					success: true,
					data: {
						queryCount: cacheSnapshot.totalRequests,
						averageQueryTime: cacheSnapshot.avgResponseTime,
						slowQueries: [],
						cacheHitRate: cacheSnapshot.hitRate,
						connectionPoolUsage: dbStats ? dbStats.connections || -1 : -1
					}
				};
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get performance metrics',
					error: createDatabaseError(error, 'METRICS_ERROR', 'Failed to retrieve performance metrics')
				};
			}
		},
		clearMetrics: async (): Promise<DatabaseResult<void>> => {
			try {
				cacheMetrics.reset();
				logger.info('Performance metrics cleared');
				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to clear metrics',
					error: createDatabaseError(error, 'METRICS_CLEAR_ERROR', 'Failed to clear performance metrics')
				};
			}
		},
		enableProfiling: async (enabled: boolean): Promise<DatabaseResult<void>> => {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const level = enabled ? 'all' : 'off';
			await mongoose.connection.db.setProfilingLevel(level);
			return { success: true, data: undefined };
		},
		getSlowQueries: async (limit = 10): Promise<DatabaseResult<Array<{ query: string; duration: number; timestamp: Date }>>> => {
			if (!mongoose.connection.db) {
				return { success: false, message: 'Not connected to DB', error: { code: 'DB_DISCONNECTED', message: 'Not connected' } };
			}
			const profileData = await mongoose.connection.db.collection('system.profile').find().limit(limit).toArray();
			const slowQueries = profileData.map((p) => {
				const doc = p as unknown as { command: object; millis: number; ts: Date };
				return {
					query: JSON.stringify(doc.command),
					duration: doc.millis,
					timestamp: doc.ts
				};
			});
			return { success: true, data: slowQueries };
		}
	};

	// Smart Cache Layer Integration with Multi-Tenant Support
	cache = {
		get: async <T>(key: string): Promise<DatabaseResult<T | null>> => {
			try {
				await cacheService.initialize();
				const value = await cacheService.get<T>(key);
				logger.debug(`Cache get: ${key}`, { found: value !== null });
				return { success: true, data: value };
			} catch (error) {
				logger.error('Cache get failed:', error);
				return {
					success: false,
					message: 'Cache retrieval failed',
					error: createDatabaseError(error, 'CACHE_GET_ERROR', 'Failed to get from cache')
				};
			}
		},

		set: async <T>(key: string, value: T, options?: CacheOptions): Promise<DatabaseResult<void>> => {
			try {
				await cacheService.initialize();
				const ttl = options?.ttl || 60; // Default 60 seconds
				const tenantId = options?.tags?.find((tag) => tag.startsWith('tenant:'))?.replace('tenant:', '');

				await cacheService.set(key, value, ttl, tenantId);
				logger.debug(`Cache set: ${key}`, { ttl, tenantId });
				return { success: true, data: undefined };
			} catch (error) {
				logger.error('Cache set failed:', error);
				return {
					success: false,
					message: 'Cache storage failed',
					error: createDatabaseError(error, 'CACHE_SET_ERROR', 'Failed to set in cache')
				};
			}
		},

		delete: async (key: string): Promise<DatabaseResult<void>> => {
			try {
				await cacheService.initialize();
				await cacheService.delete(key);
				logger.debug(`Cache delete: ${key}`);
				return { success: true, data: undefined };
			} catch (error) {
				logger.error('Cache delete failed:', error);
				return {
					success: false,
					message: 'Cache deletion failed',
					error: createDatabaseError(error, 'CACHE_DELETE_ERROR', 'Failed to delete from cache')
				};
			}
		},

		clear: async (tags?: string[]): Promise<DatabaseResult<void>> => {
			try {
				await cacheService.initialize();

				if (tags && tags.length > 0) {
					// Clear specific tags using pattern matching
					for (const tag of tags) {
						// Extract tenant ID if present
						const tenantId = tag.startsWith('tenant:') ? tag.replace('tenant:', '') : undefined;
						const pattern = tenantId ? `*` : `*${tag}*`;
						await cacheService.clearByPattern(pattern, tenantId);
					}
					logger.debug(`Cache cleared for tags: ${tags.join(', ')}`);
				} else {
					// Clear all cache (use carefully!)
					await cacheService.clearByPattern('*');
					logger.warn('All cache cleared (global clear)');
				}

				return { success: true, data: undefined };
			} catch (error) {
				logger.error('Cache clear failed:', error);
				return {
					success: false,
					message: 'Cache clear failed',
					error: createDatabaseError(error, 'CACHE_CLEAR_ERROR', 'Failed to clear cache')
				};
			}
		},

		invalidateCollection: async (collection: string): Promise<DatabaseResult<void>> => {
			try {
				await cacheService.initialize();

				// Invalidate all cache keys related to this collection
				const pattern = `collection:${collection}:*`;
				await cacheService.clearByPattern(pattern);

				logger.info(`Cache invalidated for collection: ${collection}`);
				return { success: true, data: undefined };
			} catch (error) {
				logger.error('Cache invalidation failed:', error);
				return {
					success: false,
					message: 'Cache invalidation failed',
					error: createDatabaseError(error, 'CACHE_INVALIDATE_ERROR', 'Failed to invalidate collection cache')
				};
			}
		}
	};

	async getCollectionData(
		collectionName: string,
		options?: {
			limit?: number;
			offset?: number;
			fields?: string[];
			includeMetadata?: boolean;
		}
	): Promise<DatabaseResult<{ data: unknown[]; metadata?: { totalCount: number; schema?: unknown; indexes?: string[] } }>> {
		const repo = this._getRepository(collectionName);
		if (!repo) return this._repoNotFound(collectionName);

		const data = await repo.findMany({}, { limit: options?.limit, skip: options?.offset });

		if (options?.includeMetadata) {
			const totalCount = await repo.count({});
			const schema = repo.model.schema.obj;
			const indexes = Object.keys(repo.model.schema.indexes());
			return {
				success: true,
				data: {
					data,
					metadata: {
						totalCount,
						schema,
						indexes
					}
				}
			};
		}

		return { success: true, data: { data } };
	}

	async getMultipleCollectionData(
		collectionNames: string[],
		options?: {
			limit?: number;
			fields?: string[];
		}
	): Promise<DatabaseResult<Record<string, unknown[]>>> {
		// Fetch all collections in parallel instead of sequentially
		// This reduces total time from sum(queries) to max(query)
		const results = await Promise.all(
			collectionNames.map((name) =>
				this.getCollectionData(name, options).then((result) => ({
					name,
					success: result.success,
					data: result.success ? result.data.data : []
				}))
			)
		);

		const responseData: Record<string, unknown[]> = {};
		for (const result of results) {
			if (result.success) {
				responseData[result.name] = result.data;
			} else {
				logger.warn(`Failed to fetch data for collection: ${result.name}`);
				responseData[result.name] = [];
			}
		}

		return { success: true, data: responseData };
	}
}
