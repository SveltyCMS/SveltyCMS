/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description Central MongoDB adapter for CMS database operations
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with a robust retry mechanism
 * - CRUD operations for collections, documents, drafts, revisions, and widgets
 * - Management of media storage, retrieval, and virtual folders
 * - User authentication and session management
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
import type { BaseEntity, ConnectionPoolOptions, DatabaseId, DatabaseResult, IDBAdapter } from '../dbInterface';

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
import { MongoContentMethods } from './methods/contentMethods';
import { MongoCrudMethods } from './methods/crudMethods';
import { MongoMediaMethods } from './methods/mediaMethods';
import * as mongoDBUtils from './methods/mongoDBUtils';
import { MongoSystemMethods } from './methods/systemMethods';
import { MongoSystemVirtualFolderMethods } from './methods/systemVirtualFolderMethods';
import { MongoThemeMethods } from './methods/themeMethods';
import { MongoWidgetMethods } from './methods/widgetMethods';
import { MongoQueryBuilder } from './MongoQueryBuilder';

import { logger } from '@utils/logger.svelte';

export class MongoDBAdapter implements IDBAdapter {
	// --- Private properties for internal, unwrapped method classes ---
	private _content!: MongoContentMethods;
	private _media!: MongoMediaMethods;
	private _themes!: MongoThemeMethods;
	private _widgets!: MongoWidgetMethods;
	private _system!: MongoSystemMethods;
	private _systemVirtualFolder!: MongoSystemVirtualFolderMethods;
	private _auth!: MongoAuthModelRegistrar;
	private _repositories = new Map<string, MongoCrudMethods<any>>();

	// --- Public properties that expose the compliant, wrapped API ---
	public content!: IDBAdapter['content'];
	public media!: IDBAdapter['media'];
	public themes!: IDBAdapter['themes'];
	public widgets!: IDBAdapter['widgets'];
	public systemPreferences!: IDBAdapter['systemPreferences'];
	public system!: IDBAdapter['system'];
	public crud!: IDBAdapter['crud'];
	public auth!: IDBAdapter['auth'];
	public readonly utils = mongoDBUtils;

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
	public queryBuilder(collection: string) {
		const repo = this._getRepository(collection);
		if (!repo) {
			throw new Error(`Collection ${collection} not found`);
		}
		const model = (repo as any).model;
		if (!model) {
			throw new Error(`Model not found for collection ${collection}`);
		}
		return new MongoQueryBuilder(model);
	}

	private async _wrapResult<T>(fn: () => Promise<T>): Promise<DatabaseResult<T>> {
		try {
			const data = await fn();
			return { success: true, data };
		} catch (error: unknown) {
			const typedError = error as any; // Kept as `any` to access dynamic properties like `code`
			const dbError = this.utils.createDatabaseError(typedError, typedError.code || 'OPERATION_FAILED', typedError.message);
			return {
				success: false,
				message: dbError.message,
				error: dbError
			};
		}
	}

	// Overload signatures to match IDBAdapter interface
	connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
	connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	connect(connectionStringOrOptions?: string | ConnectionPoolOptions, _options?: unknown): Promise<DatabaseResult<void>> {
		return this._wrapResult(async () => {
			if (this.isConnected()) {
				logger.info('MongoDB connection already established.');
				return;
			}

			let connectionString: string;
			
			// Check if it's a string connection string
			if (typeof connectionStringOrOptions === 'string' && connectionStringOrOptions) {
				connectionString = connectionStringOrOptions;
				logger.debug(`Using provided connection string: mongodb://*****@${connectionString.split('@')[1] || 'localhost'}`);
			} else if (connectionStringOrOptions && typeof connectionStringOrOptions === 'object') {
				// It's ConnectionPoolOptions
				logger.warn('ConnectionPoolOptions are not fully supported yet. Using default connection string.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
			} else {
				// No parameters provided, use environment variable
				logger.warn('No connection string provided. Using environment variable or default.');
				connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/sveltycms';
			}

			await mongoose.connect(connectionString);
			logger.info('MongoDB connection established successfully.');

			// --- 1. Register All Models ---
			this._auth = new MongoAuthModelRegistrar(mongoose);
			await this._auth.setupAuthModels();
			MongoMediaMethods.registerModels(mongoose);
			logger.info('All Mongoose models registered.');

			// --- 2. Instantiate Repositories ---
			const repositories = {
				nodes: new MongoCrudMethods(ContentNodeModel as any), // ContentStructureDocument is compatible at runtime
				drafts: new MongoCrudMethods(DraftModel),
				revisions: new MongoCrudMethods(RevisionModel)
			};
			Object.entries(repositories).forEach(([key, repo]) => this._repositories.set(key, repo));

		// --- 3. Instantiate Method Classes ---
		// Using `as any` to bypass complex branded type issues between generic MongoCrudMethods and specific method classes
		this._content = new MongoContentMethods(repositories.nodes as any, repositories.drafts as any, repositories.revisions as any);
		this._media = new MongoMediaMethods(MediaModel);
		this._themes = new MongoThemeMethods(ThemeModel);
		this._widgets = new MongoWidgetMethods(WidgetModel);
		this._system = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
		this._systemVirtualFolder = new MongoSystemVirtualFolderMethods();

		// --- 4. Build the Public-Facing Wrapped API ---
		this._initializeWrappers();			logger.info('MongoDB adapter fully initialized.');
		});
	}

	private _initializeWrappers(): void {
		// AUTH
		this.auth = {
			setupAuthModels: async () => {
				const result = await this._wrapResult(() => this._auth.setupAuthModels());
				if (!result.success) throw new Error(result.error.message);
			}
		};

		// SYSTEM
		this.system = {
			setupSystemModels: async () => {
				/* models already set up */
			}
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
				for (const theme of themes) await this._themes.install(theme);
			},
			getDefaultTheme: async () => await this._themes.getDefault()
		};

		// WIDGETS
		this.widgets = {
			setupWidgetModels: async () => {
				/* models already set up */
			},
			register: (widget) => this._wrapResult(() => this._widgets.register(widget)),
			getActiveWidgets: async () => {
				const result = await this._wrapResult(() => this._widgets.findAllActive());
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
			getMany: <T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId) =>
				this._wrapResult(async () => {
					const results: Record<string, T> = {};
					for (const key of keys) {
						const value = await this._system.get(key, scope, userId);
						if (value !== null) results[key] = value as T;
					}
					return results;
				}),
			set: <T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId) =>
				this._wrapResult(() => this._system.set(key, value, scope, userId)),
			setMany: <T>(preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId }>) =>
				this._wrapResult(async () => {
					for (const pref of preferences) {
						await this._system.set(pref.key, pref.value, pref.scope, pref.userId);
					}
				}),
			delete: (key: string, scope?: 'user' | 'system', userId?: DatabaseId) => this._wrapResult(() => this._system.delete(key, scope, userId)),
			deleteMany: (keys: string[], scope?: 'user' | 'system', userId?: DatabaseId) =>
				this._wrapResult(async () => {
					for (const key of keys) {
						await this._system.delete(key, scope, userId);
					}
				}),
			clear: (scope?: 'user' | 'system', userId?: DatabaseId) => this._wrapResult(() => this._system.clear(scope, userId))
		};

		// MEDIA
		this.media = {
			setupMediaModels: async () => {
				/* models already set up */
			},
			files: {
				upload: (file) => this._wrapResult(async () => (await this._media.uploadMany([file as any]))[0]),
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
						return files.reduce((acc: Record<string, any>, f: any) => ({ ...acc, [f._id]: f.metadata }), {});
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
						const file = await this._repositories.get('media')!.findOne({ _id: id } as any);
						if (!file) throw new Error('File not found');
						return await this._repositories.get('media')!.insert({
							...file,
							_id: this.utils.generateId(),
							filename: newName || `${(file as { filename: string }).filename}_copy`
						} as any);
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
				getStructure: (mode, filter) => this._wrapResult(() => this._content.getStructure(mode, filter)),
				upsertContentStructureNode: (node) => this._wrapResult(() => this._content.upsertNodeByPath(node)),
				create: (node) => this._wrapResult(() => this._repositories.get('nodes')!.insert(node as any)),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (path, changes) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes')!.findOne({ path } as any);
						if (!node) throw new Error('Node not found');
						return await this._repositories.get('nodes')!.update(node._id, changes as any);
					}),
				bulkUpdate: (updates) =>
					this._wrapResult(async () => {
						await this._content.bulkUpdateNodes(updates);
						const paths = updates.map((u) => u.path);
						return await this._repositories.get('nodes')!.findMany({ path: { $in: paths } } as any);
					}),
				delete: (path) =>
					this._wrapResult(async () => {
						const node = await this._repositories.get('nodes')!.findOne({ path } as any);
						if (!node) throw new Error('Node not found');
						await this._repositories.get('nodes')!.delete(node._id);
					}),
				deleteMany: (paths) => this._wrapResult(() => this._repositories.get('nodes')!.deleteMany({ path: { $in: paths } } as any)),
				reorder: (nodeUpdates) =>
					this._wrapResult(async () => {
						const updates = nodeUpdates.map(({ path, newOrder }) => ({ path, changes: { order: newOrder } as any }));
						await this._content.bulkUpdateNodes(updates);
						const paths = nodeUpdates.map((u) => u.path);
						return await this._repositories.get('nodes')!.findMany({ path: { $in: paths } } as any);
					})
			},
			drafts: {
				create: (draft) => this._wrapResult(() => this._content.createDraft(draft)),
				createMany: async () => {
					throw new Error('insertMany not implemented');
				},
				update: (id, data) => this._wrapResult(() => this._repositories.get('drafts')!.update(id, { data } as any)),
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
				deleteMany: (ids) => this._wrapResult(() => this._repositories.get('drafts')!.deleteMany({ _id: { $in: ids } } as any))
			},
			revisions: {
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
				deleteMany: (ids) => this._wrapResult(() => this._repositories.get('revisions')!.deleteMany({ _id: { $in: ids } } as any)),
				cleanup: (contentId, keepLatest) => this._wrapResult(() => this._content.cleanupRevisions(contentId, keepLatest))
			}
		};

		// CRUD - Generic CRUD operations
		this.crud = {
			findOne: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findOne(query));
			},
			findMany: <T extends BaseEntity>(coll: string, query: FilterQuery<T>, options?: { limit?: number; offset?: number }) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findMany(query, { limit: options?.limit, skip: options?.offset }));
			},
			insert: <T extends BaseEntity>(coll: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.insert(data as any));
			},
			update: <T extends BaseEntity>(coll: string, id: DatabaseId, data: Partial<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.update(id, data as any));
			},
			delete: (coll: string, id: DatabaseId) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.delete(id));
			},
			findByIds: (coll: string, ids: DatabaseId[]) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.findByIds(ids));
			},
			insertMany: async () => {
				throw new Error('insertMany not implemented in MongoCrudMethods');
			},
			updateMany: async () => {
				throw new Error('updateMany not implemented in MongoCrudMethods');
			},
			deleteMany: <T extends BaseEntity>(coll: string, query: FilterQuery<T>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.deleteMany(query));
			},
			upsert: <T extends BaseEntity>(coll: string, query: Partial<T>, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.upsert(query as FilterQuery<T>, data as any));
			},
			upsertMany: <T extends BaseEntity>(coll: string, items: Array<{ query: Partial<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(async () => {
					const results = [];
					for (const item of items) {
						results.push(await repo.upsert(item.query as FilterQuery<T>, item.data as any));
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
			aggregate: (coll: string, pipeline: any[]) => {
				const repo = this._getRepository(coll);
				if (!repo) return this._repoNotFound(coll);
				return this._wrapResult(() => repo.aggregate(pipeline));
			}
		};
	}

	private _getRepository(collection: string): MongoCrudMethods<any> | null {
		const normalized = this.utils.normalizeCollectionName(collection);

		if (this._repositories.has(normalized)) {
			return this._repositories.get(normalized)!;
		}

		// Create repository for unknown collection
		try {
			let model: any;
			if (mongoose.models[normalized]) {
				model = mongoose.models[normalized];
			} else {
				const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
				model = mongoose.model(normalized, schema);
			}
			const repo = new MongoCrudMethods(model);
			this._repositories.set(normalized, repo);
			return repo;
		} catch (error) {
			logger.error(`Failed to create repository for ${collection}`, error);
			return null;
		}
	}

	private _repoNotFound(collection: string): Promise<DatabaseResult<any>> {
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

	async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		return this._wrapResult(async () => {
			const start = performance.now();
			if (!mongoose.connection.db) {
				throw new Error('Database connection not established');
			}
			await mongoose.connection.db.admin().ping();
			const latency = performance.now() - start;
			const activeConnections = mongoose.connection.readyState === 1 ? 1 : 0;
			return { healthy: true, latency, activeConnections };
		});
	}

	// --- Required Interface Methods (Stubs/Not Yet Implemented) ---

	getCapabilities() {
		return {
			supportsTransactions: false,
			supportsIndexing: true,
			supportsFullTextSearch: true,
			supportsAggregation: true,
			supportsStreaming: false,
			supportsPartitioning: false,
			maxBatchSize: 1000,
			maxQueryComplexity: 100
		};
	}

	async transaction<T>(
		_fn: (transaction: any) => Promise<DatabaseResult<T>>,
		_options?: { timeout?: number; isolationLevel?: string }
	): Promise<DatabaseResult<T>> {
		return {
			success: false,
			message: 'Transactions not yet implemented',
			error: { code: 'NOT_IMPLEMENTED', message: 'Transactions not yet implemented' }
		};
	}

	batch = {
		execute: async <T>(_operations: any[]): Promise<DatabaseResult<any>> => {
			return {
				success: false,
				message: 'Batch operations not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Batch operations not yet implemented' }
			};
		},
		bulkInsert: async <T extends BaseEntity>(
			_collection: string,
			_items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]
		): Promise<DatabaseResult<T[]>> => {
			return {
				success: false,
				message: 'Bulk insert not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Bulk insert not yet implemented' }
			};
		},
		bulkUpdate: async <T extends BaseEntity>(
			_collection: string,
			_updates: Array<{ id: DatabaseId; data: Partial<T> }>
		): Promise<DatabaseResult<{ modifiedCount: number }>> => {
			return {
				success: false,
				message: 'Bulk update not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Bulk update not yet implemented' }
			};
		},
		bulkDelete: async (_collection: string, _ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return {
				success: false,
				message: 'Bulk delete not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Bulk delete not yet implemented' }
			};
		},
		bulkUpsert: async <T extends BaseEntity>(_collection: string, _items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> => {
			return {
				success: false,
				message: 'Bulk upsert not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Bulk upsert not yet implemented' }
			};
		}
	};

	collection = {
		getModel: async (_id: string): Promise<any> => {
			throw new Error('Collection getModel not yet implemented');
		},
		createModel: async (_schema: any): Promise<void> => {
			throw new Error('Collection createModel not yet implemented');
		},
		updateModel: async (_schema: any): Promise<void> => {
			throw new Error('Collection updateModel not yet implemented');
		},
		deleteModel: async (_id: string): Promise<void> => {
			throw new Error('Collection deleteModel not yet implemented');
		}
	};

	systemVirtualFolder!: IDBAdapter['systemVirtualFolder'];

	performance = {
		getMetrics: async (): Promise<DatabaseResult<any>> => {
			return {
				success: false,
				message: 'Performance metrics not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Performance metrics not yet implemented' }
			};
		},
		clearMetrics: async (): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Performance metrics not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Performance metrics not yet implemented' }
			};
		},
		enableProfiling: async (_enabled: boolean): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Performance profiling not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Performance profiling not yet implemented' }
			};
		},
		getSlowQueries: async (_limit?: number): Promise<DatabaseResult<any[]>> => {
			return {
				success: false,
				message: 'Slow queries not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Slow queries not yet implemented' }
			};
		}
	};

	cache = {
		get: async <T>(_key: string): Promise<DatabaseResult<T | null>> => {
			return {
				success: false,
				message: 'Cache not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Cache not yet implemented' }
			};
		},
		set: async <T>(_key: string, _value: T, _options?: any): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Cache not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Cache not yet implemented' }
			};
		},
		delete: async (_key: string): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Cache not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Cache not yet implemented' }
			};
		},
		clear: async (_tags?: string[]): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Cache not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Cache not yet implemented' }
			};
		},
		invalidateCollection: async (_collection: string): Promise<DatabaseResult<void>> => {
			return {
				success: false,
				message: 'Cache not yet implemented',
				error: { code: 'NOT_IMPLEMENTED', message: 'Cache not yet implemented' }
			};
		}
	};

	async getCollectionData(
		_collectionName: string,
		_options?: {
			limit?: number;
			offset?: number;
			fields?: string[];
			includeMetadata?: boolean;
		}
	): Promise<DatabaseResult<{ data: unknown[]; metadata?: any }>> {
		return {
			success: false,
			message: 'getCollectionData not yet implemented',
			error: { code: 'NOT_IMPLEMENTED', message: 'getCollectionData not yet implemented' }
		};
	}

	async getMultipleCollectionData(
		_collectionNames: string[],
		_options?: {
			limit?: number;
			fields?: string[];
		}
	): Promise<DatabaseResult<Record<string, unknown[]>>> {
		return {
			success: false,
			message: 'getMultipleCollectionData not yet implemented',
			error: { code: 'NOT_IMPLEMENTED', message: 'getMultipleCollectionData not yet implemented' }
		};
	}
}
