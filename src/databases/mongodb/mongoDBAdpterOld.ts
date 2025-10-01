/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description MongoDB adapter for CMS database operations, user preferences, and virtual folder management.
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

import { v4 as uuidv4 } from 'uuid';

// Stores
import type { ContentNode, SystemPreferences } from '@src/content/types';

// Types
import type { BaseEntity, DatabaseId, ISODateString, Layout } from '@src/content/types';

// Database Models
import { ContentStructureModel, registerContentStructureDiscriminators } from './models/contentStructure';
import { DraftModel } from './models/draft';
import { mediaSchema } from './models/media';
import { RevisionModel } from './models/revision';
import { SystemPreferencesModel } from './models/systemPreferences';
import { SystemVirtualFolderModel } from './models/systemVirtualFolder';
import { ThemeModel } from './models/theme';
import { MongoQueryBuilder } from './MongoQueryBuilder';

// System Logging
import { logger, type LoggableValue } from '@utils/logger.svelte';

// Widget Manager
import '@widgets/index';

// Database
import type { Document, FilterQuery, Model, PipelineStage } from 'mongoose';
import mongoose, { Schema as MongooseSchema } from 'mongoose';

import { dateToISODateString } from '../../utils/dateUtils';
import type {
	CollectionModel,
	ConnectionPoolOptions,
	ContentDraft,
	ContentRevision,
	DatabaseAdapter,
	DatabaseError,
	DatabaseResult,
	MediaFolder,
	MediaItem,
	MediaMetadata,
	PaginatedResult,
	PaginationOptions,
	QueryBuilder,
	SystemVirtualFolder,
	Theme,
	Widget
} from '../dbInterface';

// MongoDB connection options type
interface MongoConnectionOptions {
	serverSelectionTimeoutMS?: number;
	socketTimeoutMS?: number;
	maxPoolSize?: number;
	retryWrites?: boolean;
	authSource?: string;
	user?: string;
	pass?: string;
	dbName?: string;
}

// Utility function to handle DatabaseErrors consistently
const createDatabaseError = (error: unknown, code: string, message: string): DatabaseError => {
	logger.error(`${code}: ${message}`, error);
	return {
		code,
		message,
		details: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	};
};

// Utility function to convert unknown errors to a structured format
const toErrorWithExtras = (error: unknown): Error & { code?: number | string } => {
	if (error instanceof Error) {
		return error as Error & { code?: number | string };
	}
	const newError = new Error(String(error));
	(newError as Error & { code?: number | string }).code = 'UNKNOWN';
	return newError;
};

// Utility type to convert Mongoose Map to a plain object
type FlattenMaps<T> = T extends Map<string, infer V> ? { [key: string]: V } : T;

export class MongoDBAdapter implements DatabaseAdapter {
	// Overloaded connect method for setup operations with custom connection parameters
	async connect(connectionString: string, options?: MongoConnectionOptions): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	async connect(connectionStringOrPoolOptions?: string | ConnectionPoolOptions, options?: MongoConnectionOptions): Promise<DatabaseResult<void>> {
		try {
			if (typeof connectionStringOrPoolOptions === 'string') {
				// Use provided connection string and options for setup
				const connectionString = connectionStringOrPoolOptions;
				logger.info('Attempting MongoDB connection with custom parameters', {
					// Only log sanitized connection string (without password)
					connectionStringPreview: connectionString.replace(/:[^:@]+@/, ':***@'),
					hasOptions: !!options,
					serverSelectionTimeoutMS: options?.serverSelectionTimeoutMS || 15000,
					socketTimeoutMS: options?.socketTimeoutMS || 45000,
					maxPoolSize: options?.maxPoolSize || 10,
					authSource: options?.authSource,
					hasUser: !!options?.user,
					hasPass: !!options?.pass,
					dbName: options?.dbName
				});
				await mongoose.connect(connectionString, {
					serverSelectionTimeoutMS: options?.serverSelectionTimeoutMS || 15000,
					socketTimeoutMS: options?.socketTimeoutMS || 45000,
					maxPoolSize: options?.maxPoolSize || 10,
					retryWrites: options?.retryWrites !== false,
					authSource: options?.authSource,
					user: options?.user,
					pass: options?.pass,
					dbName: options?.dbName
				});
				logger.info('MongoDB connection established with custom parameters');
				return { success: true, data: undefined };
			} else {
				// Use default connection method with private config
				if (!mongoose.connection.readyState) {
					// Import private config to construct connection string
					const { privateEnv } = await import('@root/config/private');

					let connectionString;
					if (process.env.MONGODB_URI) {
						// Use environment variable if available
						connectionString = process.env.MONGODB_URI;
					} else {
						// Construct from private config
						const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = privateEnv;

						if (DB_HOST.startsWith('mongodb+srv://')) {
							if (DB_USER && DB_PASSWORD) {
								connectionString = `mongodb+srv://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST.replace('mongodb+srv://', '')}/${DB_NAME}?retryWrites=true&w=majority`;
							} else {
								connectionString = `mongodb+srv://${DB_HOST.replace('mongodb+srv://', '')}/${DB_NAME}?retryWrites=true&w=majority`;
							}
						} else {
							if (DB_USER && DB_PASSWORD) {
								connectionString = `mongodb://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST.replace('mongodb://', '')}:${DB_PORT}/${DB_NAME}?authSource=admin`;
							} else {
								connectionString = `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;
							}
						}
					}

					await mongoose.connect(connectionString, {
						serverSelectionTimeoutMS: 5000,
						socketTimeoutMS: 45000
					});
					logger.info('MongoDB connection established');
				}
				return { success: true, data: undefined };
			}
		} catch (error) {
			return {
				success: false,
				message: 'MongoDB connection failed',
				error: createDatabaseError(error, 'CONNECTION_ERROR', 'MongoDB connection failed')
			};
		}
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		try {
			await mongoose.disconnect();
			logger.info('MongoDB connection closed');
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'MongoDB disconnection failed',
				error: createDatabaseError(error, 'DISCONNECTION_ERROR', 'MongoDB disconnection failed')
			};
		}
	}

	isConnected(): boolean {
		return mongoose.connection.readyState === 1;
	}

	async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		try {
			const start = Date.now();
			if (!mongoose.connection.db) {
				throw new Error('MongoDB connection is not established.');
			}
			await mongoose.connection.db.admin().ping();
			const latency = Date.now() - start;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: mongoose.connections.length
				}
			};
		} catch (error) {
			return {
				success: false,
				message: 'Connection health check failed',
				error: createDatabaseError(error, 'HEALTH_CHECK_ERROR', 'Connection health check failed')
			};
		}
	}

	getCapabilities() {
		return {
			supportsTransactions: true,
			supportsIndexing: true,
			supportsFullTextSearch: true,
			supportsAggregation: true,
			supportsStreaming: false,
			supportsPartitioning: false,
			maxBatchSize: 1000,
			maxQueryComplexity: 10
		};
	}

	// Utility Methods
	public utils = {
		// Generate a unique ID using UUID
		generateId(): DatabaseId {
			return uuidv4().replace(/-/g, '') as DatabaseId;
		},
		normalizePath(path: string): string {
			return path;
		},
		validateId(id: string): boolean {
			return /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(id);
		},
		createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
			const { page = 1, pageSize = 10 } = options;
			const start = (page - 1) * pageSize;
			const end = start + pageSize;
			const paginatedItems = items.slice(start, end);
			return {
				items: paginatedItems,
				total: items.length,
				page,
				pageSize,
				hasNextPage: end < items.length,
				hasPreviousPage: start > 0
			};
		}
	};

	// Content Structure Management
	content = {
		nodes: {
			// Helper method to recursively scan directories for compiled content structure files
			scanDirectoryForContentStructure: async (dirPath: string): Promise<string[]> => {
				const collectionFiles: string[] = [];
				try {
					const entries = await import('fs').then((fs) => fs.promises.readdir(dirPath, { withFileTypes: true }));
					logger.debug(`Scanning directory: \x1b[34m${dirPath}\x1b[0m`);
					for (const entry of entries) {
						const fullPath = new URL(entry.name, dirPath).pathname;
						if (entry.isDirectory()) {
							// Recursively scan subdirectories
							logger.debug(`Found subdirectory: \x1b[34m${entry.name}\x1b[0m`);
							const subDirFiles = await this.content.nodes.scanDirectoryForContentStructure(fullPath);
							collectionFiles.push(...subDirFiles);
						} else if (entry.isFile() && entry.name.endsWith('.js')) {
							logger.debug(`Found compiled collection file: \x1b[34m${entry.name}\x1b[0m`);
							collectionFiles.push(fullPath);
						}
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					logger.error(`Error scanning directory ${dirPath}: ${errorMsg}`);
				}
				return collectionFiles;
			},

			// Create or update content structure
			createOrUpdateContentStructure: async (contentData: {
				_id: string;
				name: string;
				path: string;
				icon?: string;
				order?: number;
				isCategory?: boolean;
				collectionConfig?: unknown;
				translations?: { languageTag: string; translationName: string }[];
			}): Promise<void> => {
				try {
					const type = contentData.isCategory !== undefined ? (contentData.isCategory ? 'category' : 'collection') : 'category';
					const existingNode = await ContentStructureModel.findOne({
						path: contentData.path
					}).exec();
					if (existingNode) {
						// Update existing node
						existingNode._id = contentData._id;
						existingNode.name = contentData.name;
						existingNode.path = contentData.path;
						existingNode.icon = contentData.icon || 'iconoir:info-empty';
						existingNode.order = contentData.order || 999;
						existingNode.type = type;
						existingNode.isCollection = contentData.isCategory;
						existingNode.collectionConfig = contentData.collectionConfig;
						existingNode.markModified('type'); // Ensure type field is marked as modified

						// Update translations if provided
						if (contentData.translations) {
							existingNode.translations = contentData.translations.map((t) => ({
								languageTag: t.languageTag,
								translationName: t.translationName
							}));
						}

						await existingNode.save();
						logger.info(`Updated content structure: \x1b[34m${contentData.path}\x1b[0m`);
					} else {
						// Create new node with validated UUID
						const parentPath = contentData.path.split('/').slice(0, -1).join('/');
						const parentNode = parentPath ? await ContentStructureModel.findOne({ path: parentPath }).lean().exec() : null;
						const newNode = new ContentStructureModel({
							...contentData,
							_id: contentData._id, // Already validated
							type,
							parentId: parentNode?._id ?? null
						});
						await newNode.save();
						logger.info(`Created content structure: \x1b[34m${contentData.path}\x1b[0m with UUID: \x1b[34m${contentData._id}\x1b[0m`);
					}
				} catch (error) {
					logger.error(`Error creating/updating content structure: ${error instanceof Error ? error.message : String(error)}`);
					throw new Error(`Error creating/updating content structure`);
				}
			},
			upsertContentStructureNode: async (contentData: ContentNode): Promise<DatabaseResult<ContentNode>> => {
				try {
					let result: ContentNode;
					if (contentData.nodeType === 'collection') {
						// Upsert for collection node
						result = await ContentStructureModel.findOneAndUpdate({ _id: contentData._id }, { $set: contentData }, { new: true, upsert: true })
							.lean()
							.exec();
					} else {
						// Upsert for category node (since upsertCategory does not exist)
						result = await ContentStructureModel.findOneAndUpdate({ _id: contentData._id }, { $set: contentData }, { new: true, upsert: true })
							.lean()
							.exec();
					}
					return {
						success: true,
						data: result
					};
				} catch (error) {
					logger.error(`Error upserting content structure node: ${error instanceof Error ? error.message : String(error)}`);
					return {
						success: false,
						message: 'Failed to upsert content structure node',
						error: createDatabaseError(
							error instanceof Error ? error : new Error(String(error)),
							'UPSERT_FAILED',
							'Failed to upsert content structure node'
						)
					};
				}
			},

			getContentByPath: async (path: string): Promise<Document | null> => {
				return await ContentStructureModel.findOne({ path }).lean().exec();
			},

			getContentStructureById: async (id: string): Promise<Document | null> => {
				return ContentStructureModel.findById(id).lean().exec();
			},

			getStructure: async (mode: 'flat' | 'nested', filter?: Partial<ContentNode>): Promise<DatabaseResult<ContentNode[]>> => {
				try {
					// Apply filter if provided
					const query = filter ? ContentStructureModel.find(filter) : ContentStructureModel.find();
					const results = (await query.lean().exec()) as ContentNode[];

					if (mode === 'nested') {
						// TODO: Implement nested structure conversion if needed
						// For now, return flat structure
						return {
							success: true,
							data: results
						};
					} else {
						return {
							success: true,
							data: results
						};
					}
				} catch (error) {
					logger.error(`Error getting content structure: ${error instanceof Error ? error.message : String(error)}`);
					return {
						success: false,
						message: 'Failed to get content structure',
						error: createDatabaseError(error instanceof Error ? error : new Error(String(error)), 'QUERY_FAILED', 'Failed to get content structure')
					};
				}
			},

			// Required interface methods
			create: async (node: Omit<ContentNode, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentNode>> => {
				const now = new Date().toISOString();
				const fullNode: ContentNode = {
					...node,
					createdAt: dateToISODateString(new Date(now)),
					updatedAt: dateToISODateString(new Date(now))
				};
				return this.content.nodes.upsertContentStructureNode(fullNode);
			},

			createMany: async (nodes: Omit<ContentNode, 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentNode[]>> => {
				try {
					const results: ContentNode[] = [];
					for (const node of nodes) {
						const now = new Date().toISOString();
						const fullNode: ContentNode = {
							...node,
							createdAt: dateToISODateString(new Date(now)),
							updatedAt: dateToISODateString(new Date(now))
						};
						const result = await this.content.nodes.upsertContentStructureNode(fullNode);
						if (result.success && result.data) {
							results.push(result.data);
						} else {
							return {
								success: false,
								message: 'Failed to create content nodes',
								error: createDatabaseError(new Error('Failed to create node'), 'CREATE_MANY_ERROR', 'Failed to create content nodes')
							};
						}
					}
					return { success: true, data: results };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to create content nodes',
						error: createDatabaseError(error, 'CREATE_MANY_ERROR', 'Failed to create content nodes')
					};
				}
			},

			update: async (path: string, changes: Partial<ContentNode>): Promise<DatabaseResult<ContentNode>> => {
				try {
					const node = await ContentStructureModel.findOne({ path }).exec();
					if (!node) {
						return {
							success: false,
							message: `Node not found at path: ${path}`,
							error: createDatabaseError(new Error(`Node not found at path: ${path}`), 'NODE_NOT_FOUND', `Node not found at path: ${path}`)
						};
					}

					Object.assign(node, changes);
					await node.save();

					return {
						success: true,
						data: node.toObject() as ContentNode
					};
				} catch (error) {
					return {
						success: false,
						message: `Failed to update node at path: ${path}`,
						error: createDatabaseError(error, 'UPDATE_ERROR', `Failed to update node at path: ${path}`)
					};
				}
			},

			bulkUpdate: async (updates: { path: string; changes: Partial<ContentNode> }[]): Promise<DatabaseResult<ContentNode[]>> => {
				try {
					const results: ContentNode[] = [];
					for (const update of updates) {
						const result = await this.content.nodes.update(update.path, update.changes);
						if (result.success && result.data) {
							results.push(result.data);
						} else {
							return {
								success: false,
								message: 'Failed to bulk update content nodes',
								error: createDatabaseError(new Error('Failed to update node'), 'BULK_UPDATE_ERROR', 'Failed to bulk update content nodes')
							};
						}
					}
					return { success: true, data: results };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to bulk update content nodes',
						error: createDatabaseError(error, 'BULK_UPDATE_ERROR', 'Failed to bulk update content nodes')
					};
				}
			},

			delete: async (path: string): Promise<DatabaseResult<void>> => {
				try {
					const result = await ContentStructureModel.deleteOne({ path }).exec();
					if (result.deletedCount === 0) {
						return {
							success: false,
							message: `Node not found at path: ${path}`,
							error: createDatabaseError(new Error(`Node not found at path: ${path}`), 'NODE_NOT_FOUND', `Node not found at path: ${path}`)
						};
					}
					return { success: true, data: undefined };
				} catch (error) {
					return {
						success: false,
						message: `Failed to delete node at path: ${path}`,
						error: createDatabaseError(error, 'DELETE_ERROR', `Failed to delete node at path: ${path}`)
					};
				}
			},

			deleteMany: async (paths: string[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
				try {
					const result = await ContentStructureModel.deleteMany({ path: { $in: paths } }).exec();
					return {
						success: true,
						data: { deletedCount: result.deletedCount || 0 }
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to delete content nodes',
						error: createDatabaseError(error, 'DELETE_MANY_ERROR', 'Failed to delete content nodes')
					};
				}
			},

			reorder: async (nodeUpdates: Array<{ path: string; newOrder: number }>): Promise<DatabaseResult<ContentNode[]>> => {
				try {
					const results: ContentNode[] = [];
					for (const update of nodeUpdates) {
						const result = await this.content.nodes.update(update.path, { order: update.newOrder });
						if (result.success && result.data) {
							results.push(result.data);
						} else {
							return {
								success: false,
								message: 'Failed to reorder content nodes',
								error: createDatabaseError(new Error('Failed to reorder node'), 'REORDER_ERROR', 'Failed to reorder content nodes')
							};
						}
					}
					return { success: true, data: results };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to reorder content nodes',
						error: createDatabaseError(error, 'REORDER_ERROR', 'Failed to reorder content nodes')
					};
				}
			},

			getContentStructureChildren: async (parentId: string): Promise<Document[]> => {
				return ContentStructureModel.find({ parentId }).lean().exec();
			},

			updateContentStructure: async (contentId: string, updateData: Partial<ContentNode>): Promise<Document | null> => {
				return ContentStructureModel.findByIdAndUpdate(contentId, updateData, { new: true }).lean().exec();
			},

			deleteContentStructure: async (contentId: string): Promise<boolean> => {
				return ContentStructureModel.findByIdAndDelete(contentId).then((result) => !!result);
			}
		},

		drafts: {
			create: async (draft: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> => {
				try {
					const draftId = this.utils.generateId();
					const now = new Date();
					const newDraft = await DraftModel.create({
						...draft,
						_id: draftId,
						createdAt: dateToISODateString(now),
						updatedAt: dateToISODateString(now)
					});
					return { success: true, data: newDraft.toObject() as ContentDraft };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to create draft',
						error: createDatabaseError(error, 'DRAFT_CREATE_ERROR', 'Failed to create draft')
					};
				}
			},

			createMany: async (drafts: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<ContentDraft[]>> => {
				try {
					const now = new Date();
					const draftData = drafts.map((draft) => ({
						...draft,
						_id: this.utils.generateId(),
						createdAt: dateToISODateString(now),
						updatedAt: dateToISODateString(now)
					}));
					const results = await DraftModel.insertMany(draftData);
					return { success: true, data: results.map((r) => r.toObject() as ContentDraft) };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to create drafts',
						error: createDatabaseError(error, 'DRAFT_CREATE_MANY_ERROR', 'Failed to create drafts')
					};
				}
			},

			update: async (draftId: DatabaseId, data: unknown): Promise<DatabaseResult<ContentDraft>> => {
				try {
					const result = await DraftModel.findByIdAndUpdate(draftId, { data, updatedAt: dateToISODateString(new Date()) }, { new: true })
						.lean()
						.exec();
					if (!result) {
						return {
							success: false,
							message: `Draft not found: ${draftId}`,
							error: createDatabaseError(new Error(`Draft not found: ${draftId}`), 'DRAFT_NOT_FOUND', `Draft not found: ${draftId}`)
						};
					}
					return { success: true, data: result as ContentDraft };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to update draft',
						error: createDatabaseError(error, 'DRAFT_UPDATE_ERROR', 'Failed to update draft')
					};
				}
			},

			publish: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
				try {
					// Mark draft as published
					await DraftModel.findByIdAndUpdate(draftId, { status: 'published', publishedAt: new Date() });
					return { success: true, data: undefined };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to publish draft',
						error: createDatabaseError(error, 'DRAFT_PUBLISH_ERROR', 'Failed to publish draft')
					};
				}
			},

			publishMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ publishedCount: number }>> => {
				try {
					let publishedCount = 0;
					for (const draftId of draftIds) {
						try {
							// Mark draft as published
							await DraftModel.findByIdAndUpdate(draftId, { status: 'published', publishedAt: new Date() });
							publishedCount++;
						} catch (error) {
							// Continue with other drafts even if one fails
							logger.warn(`Failed to publish draft ${draftId}:`, error);
						}
					}
					return { success: true, data: { publishedCount } };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to publish drafts',
						error: createDatabaseError(error, 'DRAFT_PUBLISH_MANY_ERROR', 'Failed to publish drafts')
					};
				}
			},

			getForContent: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentDraft>>> => {
				try {
					const page = options?.page || 1;
					const pageSize = options?.pageSize || 10;
					const skip = (page - 1) * pageSize;

					const [items, total] = await Promise.all([
						DraftModel.find({ contentId }).skip(skip).limit(pageSize).lean().exec(),
						DraftModel.countDocuments({ contentId }).exec()
					]);

					return {
						success: true,
						data: {
							items: items as ContentDraft[],
							total,
							page,
							pageSize,
							hasNextPage: page * pageSize < total,
							hasPreviousPage: page > 1
						}
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to get drafts for content',
						error: createDatabaseError(error, 'DRAFT_GET_FOR_CONTENT_ERROR', 'Failed to get drafts for content')
					};
				}
			},

			delete: async (draftId: DatabaseId): Promise<DatabaseResult<void>> => {
				try {
					const result = await DraftModel.deleteOne({ _id: draftId }).exec();
					if (result.deletedCount === 0) {
						return {
							success: false,
							error: createDatabaseError(new Error(`Draft not found: ${draftId}`), 'DRAFT_NOT_FOUND', `Draft not found: ${draftId}`),
							message: `Draft not found: ${draftId}`
						};
					}
					return { success: true, data: undefined };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to delete draft',
						error: createDatabaseError(error, 'DRAFT_DELETE_ERROR', 'Failed to delete draft')
					};
				}
			},

			deleteMany: async (draftIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
				try {
					const result = await DraftModel.deleteMany({ _id: { $in: draftIds } }).exec();
					return {
						success: true,
						data: { deletedCount: result.deletedCount || 0 }
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to delete drafts',
						error: createDatabaseError(error, 'DRAFT_DELETE_MANY_ERROR', 'Failed to delete drafts')
					};
				}
			}
		},

		revisions: {
			create: async (revision: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> => {
				try {
					const revisionId = this.utils.generateId();
					const now = new Date();
					const newRevision = await RevisionModel.create({
						...revision,
						_id: revisionId,
						createdAt: dateToISODateString(now),
						updatedAt: dateToISODateString(now)
					});
					return { success: true, data: newRevision.toObject() as ContentRevision };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to create revision',
						error: createDatabaseError(error, 'REVISION_CREATE_ERROR', 'Failed to create revision')
					};
				}
			},

			getHistory: async (contentId: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<ContentRevision>>> => {
				try {
					const page = options?.page || 1;
					const pageSize = options?.pageSize || 10;
					const skip = (page - 1) * pageSize;

					const [items, total] = await Promise.all([
						RevisionModel.find({ contentId }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
						RevisionModel.countDocuments({ contentId }).exec()
					]);

					return {
						success: true,
						data: {
							items: items as ContentRevision[],
							total,
							page,
							pageSize,
							hasNextPage: page * pageSize < total,
							hasPreviousPage: page > 1
						}
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to get revision history',
						error: createDatabaseError(error, 'REVISION_GET_HISTORY_ERROR', 'Failed to get revision history')
					};
				}
			},

			restore: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
				try {
					// Restore revision by marking it as current
					await RevisionModel.findByIdAndUpdate(revisionId, { isCurrent: true });
					return { success: true, data: undefined };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to restore revision',
						error: createDatabaseError(error, 'REVISION_RESTORE_ERROR', 'Failed to restore revision')
					};
				}
			},

			delete: async (revisionId: DatabaseId): Promise<DatabaseResult<void>> => {
				try {
					await RevisionModel.findByIdAndDelete(revisionId);
					return { success: true, data: undefined };
				} catch (error) {
					return {
						success: false,
						message: 'Failed to delete revision',
						error: createDatabaseError(error, 'REVISION_DELETE_ERROR', 'Failed to delete revision')
					};
				}
			},

			deleteMany: async (revisionIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
				try {
					const result = await RevisionModel.deleteMany({ _id: { $in: revisionIds } }).exec();
					return {
						success: true,
						data: { deletedCount: result.deletedCount || 0 }
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to delete revisions',
						error: createDatabaseError(error, 'REVISION_DELETE_MANY_ERROR', 'Failed to delete revisions')
					};
				}
			},

			cleanup: async (contentId: DatabaseId, keepLatest: number): Promise<DatabaseResult<{ deletedCount: number }>> => {
				try {
					const revisionsToKeep = await RevisionModel.find({ contentId }).sort({ createdAt: -1 }).limit(keepLatest).select('_id').lean().exec();

					const keepIds = revisionsToKeep.map((r) => r._id);
					const result = await RevisionModel.deleteMany({
						contentId,
						_id: { $nin: keepIds }
					}).exec();

					return {
						success: true,
						data: { deletedCount: result.deletedCount || 0 }
					};
				} catch (error) {
					return {
						success: false,
						message: 'Failed to cleanup revisions',
						error: createDatabaseError(error, 'REVISION_CLEANUP_ERROR', 'Failed to cleanup revisions')
					};
				}
			}
		}
	};

	// Collection Management
	collection = {
		models: new Map<string, CollectionModel>(),
		// Get collection models
		getModelsMap: async (): Promise<Map<string, CollectionModel>> => {
			try {
				return this.collection.models as Map<string, CollectionModel>;
			} catch (error) {
				logger.error('Failed to get collection models: ' + (error instanceof Error ? error.message : String(error)));
				throw new Error('Failed to get collection models');
			}
		},

		// Get model by ID (required by interface)
		getModel: async (id: string): Promise<CollectionModel> => {
			const model = this.collection.models.get(id);
			if (!model) {
				throw new Error(`Collection model with id ${id} not found`);
			}
			return model;
		},

		// Create model (required by interface)
		createModel: async (schema: import('@src/content/types').Schema): Promise<void> => {
			// Implementation for creating model - convert Schema to CollectionConfig
			const collectionConfig = schema as unknown as { _id: string; fields?: unknown[]; [key: string]: unknown };
			await this.collection.createCollectionModel(collectionConfig);
		},

		// Update model (required by interface)
		updateModel: async (schema: import('@src/content/types').Schema): Promise<void> => {
			// Implementation for updating existing model - convert Schema to CollectionConfig
			const collectionConfig = schema as unknown as { _id: string; fields?: unknown[]; [key: string]: unknown };
			await this.collection.createCollectionModel(collectionConfig);
		},

		// Delete model (required by interface)
		deleteModel: async (id: string): Promise<void> => {
			this.collection.models.delete(id);
			// Also remove from mongoose models if exists
			const modelName = `collection_${id}`;
			if (mongoose.models[modelName]) {
				delete mongoose.models[modelName];
			}
		},

		// Helper method to check if collection exists in MongoDB
		collectionExists: async (collectionName: string): Promise<boolean> => {
			try {
				const collections = (await mongoose.connection.db?.listCollections({ name: collectionName.toLowerCase() }).toArray()) ?? [];
				return collections.length > 0;
			} catch (error) {
				logger.error(`Error checking if collection exists: ${error}`);
				return false;
			}
		},

		// Create or update a collection model based on the provided configuration
		createCollectionModel: async (collection: {
			_id?: string;
			fields?: unknown[];
			schema?: { strict?: boolean };
			[key: string]: unknown;
		}): Promise<CollectionModel> => {
			try {
				// Generate UUID if not provided
				const collectionUuid = collection._id || this.utils.generateId();

				// Ensure collection name is prefixed with collection_
				const collectionName = `collection_${collectionUuid}`;

				// Return existing model if it exists
				if (mongoose.models[collectionName]) {
					logger.debug(`Model \x1b[34m${collectionName}\x1b[0m already exists in Mongoose`);
					const existingModel = mongoose.models[collectionName];
					const wrappedExistingModel: CollectionModel = {
						findOne: async (query) => (await existingModel.findOne(query).lean().exec()) as Record<string, unknown> | null,
						aggregate: async (pipeline) => existingModel.aggregate(pipeline as unknown as PipelineStage[]).exec()
					};
					this.collection.models.set(collectionUuid, wrappedExistingModel);
					return wrappedExistingModel;
				}

				// Clear existing model from Mongoose's cache if it exists
				if (mongoose.modelNames().includes(collectionName)) {
					delete mongoose.models[collectionName];
					delete (mongoose as mongoose.Mongoose & { modelSchemas: { [key: string]: mongoose.Schema } }).modelSchemas[collectionName];
				} // Base schema definition for the main collection
				const schemaDefinition: Record<string, unknown> = {
					_id: { type: String },
					status: { type: String, default: 'draft' },
					createdAt: { type: Date, default: Date.now },
					updatedAt: { type: Date, default: Date.now },
					createdBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' },
					updatedBy: { type: MongooseSchema.Types.Mixed, ref: 'auth_users' }
				};

				// Process fields if they exist
				if (collection.fields && Array.isArray(collection.fields)) {
					for (const field of collection.fields) {
						try {
							// Type guard for field
							if (typeof field === 'object' && field !== null && ('db_fieldName' in field || 'label' in field || 'Name' in field)) {
								const fieldObj = field as {
									db_fieldName?: string;
									label?: string;
									Name?: string;
									required?: boolean;
									translate?: boolean;
									searchable?: boolean;
									unique?: boolean;
									type?: string;
								};
								const fieldKey =
									fieldObj.db_fieldName || (fieldObj.label ? fieldObj.label.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null) || fieldObj.Name;

								if (!fieldKey) {
									logger.error(`Field missing required identifiers:`, JSON.stringify(field, null, 2));
									continue;
								}

								const isRequired = fieldObj.required || false;
								const isTranslated = fieldObj.translate || false;
								const isSearchable = fieldObj.searchable || false;
								const isUnique = fieldObj.unique || false;

								// Base field schema with improved type handling
								const fieldSchema: mongoose.SchemaDefinitionProperty = {
									type: mongoose.Schema.Types.Mixed, // Default to Mixed type
									required: isRequired,
									translate: isTranslated,
									searchable: isSearchable,
									unique: isUnique
								};

								// Add field specific validations or transformations if needed
								if (fieldObj.type === 'string') {
									fieldSchema.type = String;
								} else if (fieldObj.type === 'number') {
									fieldSchema.type = Number;
								} else if (fieldObj.type === 'boolean') {
									fieldSchema.type = Boolean;
								} else if (fieldObj.type === 'date') {
									fieldSchema.type = Date;
								}

								schemaDefinition[fieldKey] = fieldSchema;
							} else {
								logger.error(`Field is not a valid object:`, JSON.stringify(field, null, 2));
								continue;
							}
						} catch (error) {
							logger.error(`Error processing field:`, error);
							logger.error(`Field data:`, JSON.stringify(field, null, 2));
						}
					}
				} else {
					logger.warn(`No fields defined in schema for collection: \x1b[34m${collectionName}\x1b[0m`);
				}

				// Optimized schema options for the main collection
				const schemaOptions: mongoose.SchemaOptions = {
					strict: collection.schema?.strict !== false,
					timestamps: true,
					collection: collectionName.toLowerCase(),
					autoIndex: true,
					minimize: false,
					toJSON: { virtuals: true, getters: true },
					toObject: { virtuals: true, getters: true },
					id: false,
					versionKey: false
				};

				// Create schema for the main collection
				const schema = new mongoose.Schema(schemaDefinition, schemaOptions);

				// Add indexes for the main collection
				schema.index({ createdAt: -1 }, { background: true });
				schema.index({ status: 1, createdAt: -1 }, { background: true });

				// Create and return the new model
				const model = mongoose.model(collectionName, schema);
				logger.info(
					`Collection model \x1b[34m${collectionName}\x1b[0m created successfully with \x1b[34m${collection.fields?.length || 0}\x1b[0m fields.`
				);
				const wrappedModel: CollectionModel = {
					findOne: async (query) => (await model.findOne(query).lean().exec()) as Record<string, unknown> | null,
					aggregate: async (pipeline) => model.aggregate(pipeline as unknown as PipelineStage[]).exec()
				};
				this.collection.models.set(collectionUuid, wrappedModel);
				return wrappedModel;
			} catch (error) {
				logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
				logger.error('Collection config that caused error:', JSON.stringify(collection, null, 2));
				throw error;
			}
		}
	};

	// CRUD Operations
	crud = {
		// Implementing findOne method to match dbInterface signature
		findOne: async <T extends BaseEntity>(
			collection: string,
			query: Partial<T>,
			options?: { fields?: (keyof T)[] }
		): Promise<DatabaseResult<T | null>> => {
			try {
				// Handle collection naming: media collections use direct names, others get collection_ prefix
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					// Media and auth collections use their direct names
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					// Already has prefix
					collectionName = collection;
				} else {
					// Content collections get the collection_ prefix
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`findOne failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						message: `findOne failed. Collection ${collectionName} does not exist.`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`findOne failed. Collection ${collectionName} does not exist.`
						)
					};
				}

				let mongoQuery = model.findOne(query as FilterQuery<T>);

				// Apply field selection if provided
				if (options?.fields && options.fields.length > 0) {
					const fieldsObj = options.fields.reduce(
						(acc, field) => {
							acc[field as string] = 1;
							return acc;
						},
						{} as Record<string, number>
					);
					mongoQuery = mongoQuery.select(fieldsObj);
				}

				const result = await mongoQuery.lean().exec();

				if (!result) {
					return {
						success: true,
						data: null
					};
				}

				// Convert dates to ISO strings
				const processedResult = {
					...result,
					createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
					updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
				} as T;

				return {
					success: true,
					data: processedResult
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error in findOne for collection ${collection}:`, { error: err });
				return {
					success: false,
					message: `Error in findOne for collection ${collection}: ${err.message}`,
					error: createDatabaseError(err, 'FIND_ONE_ERROR', `Error in findOne for collection ${collection}: ${err.message}`)
				};
			}
		},

		// Implementing findMany method to match dbInterface signature
		findMany: async <T extends BaseEntity>(
			collection: string,
			query: Partial<T>,
			options?: { limit?: number; offset?: number; fields?: (keyof T)[] }
		): Promise<DatabaseResult<T[]>> => {
			try {
				// Handle collection naming: media collections use direct names, others get collection_ prefix
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					// Media and auth collections use their direct names
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					// Already has prefix
					collectionName = collection;
				} else {
					// Content collections get the collection_ prefix
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`findMany failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						message: `findMany failed. Collection ${collectionName} does not exist.`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`findMany failed. Collection ${collectionName} does not exist.`
						)
					};
				}

				let mongoQuery = model.find(query as FilterQuery<T>);

				// Apply field selection if provided
				if (options?.fields && options.fields.length > 0) {
					const fieldsObj = options.fields.reduce(
						(acc, field) => {
							acc[field as string] = 1;
							return acc;
						},
						{} as Record<string, number>
					);
					mongoQuery = mongoQuery.select(fieldsObj);
				}

				// Apply pagination if provided
				if (options?.offset) {
					mongoQuery = mongoQuery.skip(options.offset);
				}
				if (options?.limit) {
					mongoQuery = mongoQuery.limit(options.limit);
				}

				const results = await mongoQuery.lean().exec();

				// Convert dates to ISO strings
				const processedResults = results.map((result) => ({
					...result,
					createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
					updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
				})) as T[];

				return {
					success: true,
					data: processedResults
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error in findMany for collection ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'FIND_MANY_ERROR', `Error in findMany for collection ${collection}: ${err.message}`),
					message: `Error in findMany for collection ${collection}: ${err.message}`
				};
			}
		},
		// Implementing insertOne method
		insert: async <T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> => {
			try {
				// Handle collection naming: media collections use direct names, others get collection_ prefix
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					// Media and auth collections use their direct names
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					// Already has prefix
					collectionName = collection;
				} else {
					// Content collections get the collection_ prefix
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`insert failed. Collection ${collectionName} does not exist in mongoose.models`);
					logger.debug(`Available models: ${Object.keys(mongoose.models).join(', ')}`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`insert failed. Collection ${collectionName} does not exist.`
						),
						message: `insert failed. Collection ${collectionName} does not exist.`
					};
				}

				// Generate ID and add timestamps
				const documentId = this.utils.generateId();

				// Validate and normalize date fields
				const now = new Date();
				const validatedDoc = {
					...data,
					_id: documentId,
					createdAt: dateToISODateString(now),
					updatedAt: dateToISODateString(now)
				} as T;
				logger.debug(`Attempting to insert document into ${collectionName}`, { docId: documentId });
				const result = await model.create(validatedDoc);
				logger.info(`Successfully inserted document into ${collectionName}`, { docId: documentId });

				return {
					success: true,
					data: result
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				// More detailed error handling
				if (err instanceof mongoose.Error.ValidationError) {
					const validationErrors = err.errors
						? Object.keys(err.errors).map((key) => ({
								field: key,
								message: err.errors[key]?.message,
								kind: (err.errors[key] as { kind?: string })?.kind
							}))
						: [];

					logger.error(`Validation error inserting into ${collection}:`, {
						message: err.message,
						validationErrors,
						document: data
					});
					return {
						success: false,
						error: createDatabaseError(err, 'VALIDATION_ERROR', `Validation error: ${err.message}`),
						message: `Validation error: ${err.message}`
					};
				}

				if (Number(err.code) === 11000) {
					logger.error(`Duplicate key error inserting into ${collection}:`, {
						message: err.message,
						keyPattern: (err as mongoose.mongo.MongoServerError)?.keyPattern,
						keyValue: (err as mongoose.mongo.MongoServerError)?.keyValue
					});
					return {
						success: false,
						error: createDatabaseError(err, 'DUPLICATE_KEY_ERROR', `Duplicate key error: ${err.message}`),
						message: `Duplicate key error: ${err.message}`
					};
				}

				// Log full error details
				logger.error(`Error inserting document into ${collection}:`, {
					message: err.message,
					name: err.name,
					code: err.code,
					stack: err.stack,
					fullError: err
				});
				return {
					success: false,
					error: createDatabaseError(err, 'INSERT_ERROR', `Error inserting document into ${collection}: ${err.message}`),
					message: `Error inserting document into ${collection}: ${err.message}`
				};
			}
		},

		// Implementing insertMany method
		insertMany: async <T extends BaseEntity>(
			collection: string,
			data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]
		): Promise<DatabaseResult<T[]>> => {
			try {
				// Handle collection naming: media collections use direct names, others get collection_ prefix
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					// Media and auth collections use their direct names
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					// Already has prefix
					collectionName = collection;
				} else {
					// Content collections get the collection_ prefix
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`insertMany failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						message: `insertMany failed. Collection ${collectionName} does not exist.`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`insertMany failed. Collection ${collectionName} does not exist.`
						)
					};
				}

				// Validate and normalize date fields for all data items
				const now = new Date();
				const validatedDocs = data.map((item) => ({
					...item,
					_id: this.utils.generateId(),
					createdAt: dateToISODateString(now),
					updatedAt: dateToISODateString(now)
				})) as T[];

				const results = await model.insertMany(validatedDocs);
				return {
					success: true,
					data: results
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				if (err instanceof mongoose.Error.ValidationError) {
					const invalidFields = err.errors ? Object.keys(err.errors) : [];
					logger.error(`insertMany ValidationError in ${collection}:`, {
						message: err.message,
						fields: invalidFields,
						errors: err.errors
					});
					return {
						success: false,
						message: `insertMany ValidationError: ${err.message}`,
						error: createDatabaseError(err, 'VALIDATION_ERROR', `insertMany ValidationError: ${err.message}`)
					};
				}

				logger.error(`Error inserting many documents into ${collection}:`, {
					message: err.message,
					stack: err.stack
				});
				return {
					success: false,
					message: `Error inserting many documents into ${collection}`,
					error: createDatabaseError(err, 'INSERT_MANY_ERROR', `Error inserting many documents into ${collection}`)
				};
			}
		},

		// Implementing update method to match dbInterface signature
		update: async <T extends BaseEntity = BaseEntity>(
			collection: string,
			id: DatabaseId,
			data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
		): Promise<DatabaseResult<T>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`update failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`update failed. Collection ${collectionName} does not exist.`
						),
						message: `update failed. Collection ${collectionName} does not exist.`
					};
				}

				// Create query and update objects
				const query = { _id: id };
				const updateData = {
					...data,
					updatedAt: dateToISODateString(new Date())
				};

				logger.debug(`Attempting to update document ${id} in ${collectionName}`, {
					query,
					updateData: Object.keys(updateData)
				});

				const result = await model.findOneAndUpdate(query, { $set: updateData }, { new: true, strict: false }).lean().exec();

				if (!result) {
					logger.warn(`No document found to update with id: ${id} in ${collectionName}`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`No document found with id: ${id}`),
							'DOCUMENT_NOT_FOUND',
							`No document found to update with id: ${id}`
						),
						message: `No document found to update with id: ${id}`
					};
				}

				// Convert dates to ISO strings
				const processedResult = {
					...result,
					createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
					updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
				} as T;

				logger.info(`Successfully updated document ${id} in ${collectionName}`);
				return {
					success: true,
					data: processedResult
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error updating document ${id} in ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'UPDATE_ERROR', `Error updating document ${id} in ${collection}: ${err.message}`),
					message: `Error updating document ${id} in ${collection}: ${err.message}`
				};
			}
		},

		// Implementing updateMany method
		updateMany: async <T extends BaseEntity = BaseEntity>(
			collection: string,
			query: Partial<T>,
			data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
		): Promise<DatabaseResult<{ modifiedCount: number }>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`updateMany failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						message: `updateMany failed. Collection ${collectionName} does not exist.`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`updateMany failed. Collection ${collectionName} does not exist.`
						)
					};
				}

				const updateData = {
					...data,
					updatedAt: dateToISODateString(new Date())
				};

				const result = await model.updateMany(query, { $set: updateData }, { strict: false }).exec();

				logger.info(`Successfully updated ${result.modifiedCount} documents in ${collectionName}`);
				return {
					success: true,
					data: { modifiedCount: result.modifiedCount }
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error updating many documents in ${collection}:`, { error: err });
				return {
					success: false,
					message: `Error updating many documents in ${collection}: ${err.message}`,
					error: createDatabaseError(err, 'UPDATE_MANY_ERROR', `Error updating many documents in ${collection}: ${err.message}`)
				};
			}
		},

		// Implementing countDocuments method
		countDocuments: async (collection: string, query: FilterQuery<Document> = {}): Promise<number> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<Document>;
				if (!model) {
					logger.error(`countDocuments failed. Collection ${collectionName} does not exist.`);
					throw new Error(`countDocuments failed. Collection ${collectionName} does not exist.`);
				}

				return await model.countDocuments(query).exec();
			} catch (error) {
				logger.error(`Error counting documents in ${collection}:`, { error });
				throw new Error(`Error counting documents in ${collection}`);
			}
		},

		// Implementing delete method to match dbInterface signature
		delete: async (collection: string, id: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<Document>;
				if (!model) {
					logger.error(`delete failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`delete failed. Collection ${collectionName} does not exist.`
						),
						message: `delete failed. Collection ${collectionName} does not exist.`
					};
				}

				const result = await model.deleteOne({ _id: id }).exec();

				if (result.deletedCount === 0) {
					logger.warn(`No document found to delete with id: ${id} in ${collectionName}`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`No document found with id: ${id}`),
							'DOCUMENT_NOT_FOUND',
							`No document found to delete with id: ${id}`
						),
						message: `No document found to delete with id: ${id}`
					};
				}

				logger.info(`Successfully deleted document ${id} from ${collectionName}`);
				return {
					success: true,
					data: undefined
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error deleting document ${id} from ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'DELETE_ERROR', `Error deleting document ${id} from ${collection}: ${err.message}`),
					message: `Error deleting document ${id} from ${collection}: ${err.message}`
				};
			}
		},

		// Implementing findByIds method for batch operations
		findByIds: async <T extends BaseEntity>(
			collection: string,
			ids: DatabaseId[],
			options?: { fields?: (keyof T)[] }
		): Promise<DatabaseResult<T[]>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`findByIds failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`findByIds failed. Collection ${collectionName} does not exist.`
						),
						message: `findByIds failed. Collection ${collectionName} does not exist.`
					};
				}

				let query = model.find({ _id: { $in: ids } });

				// Apply field selection if provided
				if (options?.fields && options.fields.length > 0) {
					const fieldsObj = options.fields.reduce(
						(acc, field) => {
							acc[field as string] = 1;
							return acc;
						},
						{} as Record<string, number>
					);
					query = query.select(fieldsObj);
				}

				const results = await query.lean().exec();

				// Convert dates to ISO strings
				const processedResults = results.map((result) => ({
					...result,
					createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
					updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
				})) as T[];

				logger.debug(`Found ${processedResults.length}/${ids.length} documents in ${collectionName}`);
				return {
					success: true,
					data: processedResults
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error finding documents by IDs in ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'FIND_BY_IDS_ERROR', `Error finding documents by IDs in ${collection}: ${err.message}`),
					message: `Error finding documents by IDs in ${collection}: ${err.message}`
				};
			}
		},

		// Implementing upsert method
		upsert: async <T extends BaseEntity>(
			collection: string,
			query: Partial<T>,
			data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>
		): Promise<DatabaseResult<T>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`upsert failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`upsert failed. Collection ${collectionName} does not exist.`
						),
						message: `upsert failed. Collection ${collectionName} does not exist.`
					};
				}

				const now = new Date();
				const upsertData: Record<string, unknown> = {
					...data,
					updatedAt: dateToISODateString(now)
				};

				// Set createdAt only if document doesn't exist
				const existingDoc = await model.findOne(query).lean().exec();
				if (!existingDoc) {
					upsertData.createdAt = dateToISODateString(now);
					if (!upsertData._id) {
						upsertData._id = this.utils.generateId();
					}
				}

				const result = await model.findOneAndUpdate(query, { $set: upsertData }, { new: true, upsert: true, strict: false }).lean().exec();

				// Convert dates to ISO strings
				const resultWithDates = result as Record<string, unknown>;
				const processedResult = {
					...result,
					createdAt: resultWithDates.createdAt ? dateToISODateString(new Date(resultWithDates.createdAt as Date)) : undefined,
					updatedAt: resultWithDates.updatedAt ? dateToISODateString(new Date(resultWithDates.updatedAt as Date)) : undefined
				} as T;

				logger.info(`Successfully upserted document in ${collectionName}`);
				return {
					success: true,
					data: processedResult
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error upserting document in ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'UPSERT_ERROR', `Error upserting document in ${collection}: ${err.message}`),
					message: `Error upserting document in ${collection}: ${err.message}`
				};
			}
		},

		// Implementing upsertMany method
		upsertMany: async <T extends BaseEntity>(
			collection: string,
			items: Array<{ query: Partial<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>
		): Promise<DatabaseResult<T[]>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<T>;
				if (!model) {
					logger.error(`upsertMany failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`upsertMany failed. Collection ${collectionName} does not exist.`
						),
						message: `upsertMany failed. Collection ${collectionName} does not exist.`
					};
				}

				const results: T[] = [];
				const now = new Date();

				for (const item of items) {
					const upsertData: Record<string, unknown> = {
						...item.data,
						updatedAt: dateToISODateString(now)
					};

					// Set createdAt only if document doesn't exist
					const existingDoc = await model.findOne(item.query).lean().exec();
					if (!existingDoc) {
						upsertData.createdAt = dateToISODateString(now);
						if (!upsertData._id) {
							upsertData._id = this.utils.generateId();
						}
					}

					const result = await model.findOneAndUpdate(item.query, { $set: upsertData }, { new: true, upsert: true, strict: false }).lean().exec();

					// Convert dates to ISO strings
					const resultWithDates = result as Record<string, unknown>;
					const processedResult = {
						...result,
						createdAt: resultWithDates.createdAt ? dateToISODateString(new Date(resultWithDates.createdAt as Date)) : undefined,
						updatedAt: resultWithDates.updatedAt ? dateToISODateString(new Date(resultWithDates.updatedAt as Date)) : undefined
					} as T;

					results.push(processedResult);
				}

				logger.info(`Successfully upserted ${results.length} documents in ${collectionName}`);
				return {
					success: true,
					data: results
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error upserting many documents in ${collection}:`, { error: err });
				return {
					success: false,
					error: createDatabaseError(err, 'UPSERT_MANY_ERROR', `Error upserting many documents in ${collection}: ${err.message}`),
					message: `Error upserting many documents in ${collection}: ${err.message}`
				};
			}
		},

		// Update deleteMany to match interface signature
		deleteMany: async (collection: string, query: Partial<BaseEntity>): Promise<DatabaseResult<{ deletedCount: number }>> => {
			try {
				// Ensure collection name is properly formatted for UUID-based collections
				const collectionName = collection.startsWith('collection_') ? collection : `collection_${collection}`;

				const model = mongoose.models[collectionName] as Model<BaseEntity>;
				if (!model) {
					logger.error(`deleteMany failed. Collection ${collectionName} does not exist.`);
					return {
						success: false,
						message: `deleteMany failed. Collection ${collectionName} does not exist.`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`deleteMany failed. Collection ${collectionName} does not exist.`
						)
					};
				}

				const result = await model.deleteMany(query).exec();

				logger.info(`Successfully deleted ${result.deletedCount} documents from ${collectionName}`);
				return {
					success: true,
					data: { deletedCount: result.deletedCount || 0 }
				};
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error(`Error deleting many documents from ${collection}:`, { error: err });
				return {
					success: false,
					message: `Error deleting many documents from ${collection}`,
					error: createDatabaseError(err, 'DELETE_MANY_ERROR', `Error deleting many documents from ${collection}: ${err.message}`)
				};
			}
		},

		// Add missing count method
		count: async (collection: string, query: Partial<BaseEntity> = {}): Promise<DatabaseResult<number>> => {
			try {
				// Handle collection naming
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					collectionName = collection;
				} else {
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<BaseEntity>;
				if (!model) {
					return {
						success: false,
						message: `Collection ${collectionName} does not exist`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`Collection ${collectionName} does not exist`
						)
					};
				}

				const count = await model.countDocuments(query as FilterQuery<BaseEntity>).exec();
				return { success: true, data: count };
			} catch (error) {
				const err = toErrorWithExtras(error);
				return {
					success: false,
					message: `Error counting documents in ${collection}`,
					error: createDatabaseError(err, 'COUNT_ERROR', `Error counting documents in ${collection}: ${err.message}`)
				};
			}
		},

		// Add missing exists method
		exists: async (collection: string, query: Partial<BaseEntity>): Promise<DatabaseResult<boolean>> => {
			try {
				// Handle collection naming
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					collectionName = collection;
				} else {
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<BaseEntity>;
				if (!model) {
					return {
						success: false,
						message: `Collection ${collectionName} does not exist`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`Collection ${collectionName} does not exist`
						)
					};
				}

				const exists = await model.exists(query as FilterQuery<BaseEntity>).exec();
				return { success: true, data: !!exists };
			} catch (error) {
				const err = toErrorWithExtras(error);
				return {
					success: false,
					message: `Error checking existence in ${collection}`,
					error: createDatabaseError(err, 'EXISTS_ERROR', `Error checking existence in ${collection}: ${err.message}`)
				};
			}
		},

		// Add missing aggregate method
		aggregate: async <R>(collection: string, pipeline: unknown[]): Promise<DatabaseResult<R[]>> => {
			try {
				// Handle collection naming
				let collectionName: string;
				if (collection.startsWith('media_') || collection.startsWith('auth_')) {
					collectionName = collection;
				} else if (collection.startsWith('collection_')) {
					collectionName = collection;
				} else {
					collectionName = `collection_${collection}`;
				}

				const model = mongoose.models[collectionName] as Model<BaseEntity>;
				if (!model) {
					return {
						success: false,
						message: `Collection ${collectionName} does not exist`,
						error: createDatabaseError(
							new Error(`Collection ${collectionName} not found`),
							'COLLECTION_NOT_FOUND',
							`Collection ${collectionName} does not exist`
						)
					};
				}

				const results = await model.aggregate(pipeline as PipelineStage[]).exec();
				return { success: true, data: results as R[] };
			} catch (error) {
				const err = toErrorWithExtras(error);
				return {
					success: false,
					message: `Error in aggregation for ${collection}`,
					error: createDatabaseError(err, 'AGGREGATION_ERROR', `Error in aggregation for ${collection}: ${err.message}`)
				};
			}
		}
	};

	// Authentication Model Management
	auth = {
		// Set up authentication models
		setupAuthModels: async (): Promise<void> => {
			try {
				// Explicitly import schemas before setting up models
				const { UserSchema } = await import('@src/auth/mongoDBAuth/userAdapter');
				const { TokenSchema } = await import('@src/auth/mongoDBAuth/tokenAdapter');
				const { SessionSchema } = await import('@src/auth/mongoDBAuth/sessionAdapter');

				this.modelSetup.setupModel('auth_users', UserSchema);
				this.modelSetup.setupModel('auth_sessions', SessionSchema);
				this.modelSetup.setupModel('auth_tokens', TokenSchema);

				logger.info('Authentication models set up successfully.');
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error('Failed to set up authentication models: ' + err.message, { error: err });
				throw new Error('Failed to set up authentication models');
			}
		}
	};

	// Media Model Management
	media = {
		// Set up media models
		setupMediaModels: async (): Promise<void> => {
			const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote', 'media_collection'];
			mediaSchemas.forEach((schemaName) => {
				this.modelSetup.setupModel(schemaName, mediaSchema);
			});
			logger.info('\x1b[34mMedia models\x1b[0m set up successfully.');
		},

		files: {
			upload: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
				return {
					success: true,
					data: {
						...file,
						_id: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString
					}
				};
			},
			uploadMany: async (files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>> => {
				return {
					success: true,
					data: files.map((f) => ({
						...f,
						_id: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString
					}))
				};
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			delete: async (_fileId: DatabaseId): Promise<DatabaseResult<void>> => {
				return { success: true, data: undefined };
			},
			deleteMany: async (_fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
				return { success: true, data: { deletedCount: _fileIds.length } };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			getByFolder: async (_folderId?: DatabaseId, _options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
				return { success: true, data: { items: [], total: 0, page: 1, pageSize: 10, hasNextPage: false, hasPreviousPage: false } };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			search: async (_query: string, _options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
				return { success: true, data: { items: [], total: 0, page: 1, pageSize: 10, hasNextPage: false, hasPreviousPage: false } };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			getMetadata: async (_fileIds: DatabaseId[]): Promise<DatabaseResult<Record<string, MediaMetadata>>> => {
				return { success: true, data: {} };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			updateMetadata: async (_fileId: DatabaseId, _metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem>> => {
				return {
					success: true,
					data: {
						_id: _fileId,
						filename: '',
						hash: '',
						path: '',
						size: 0,
						mimeType: '',
						folderId: undefined,
						thumbnails: {},
						metadata: {},
						createdBy: '' as DatabaseId,
						updatedBy: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString
					}
				};
			},
			move: async (_fileIds: DatabaseId[], _targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>> => {
				return { success: true, data: { movedCount: _fileIds.length } };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			duplicate: async (_fileId: DatabaseId, _newName?: string): Promise<DatabaseResult<MediaItem>> => {
				return {
					success: true,
					data: {
						_id: _fileId,
						filename: _newName || '',
						hash: '',
						path: '',
						size: 0,
						mimeType: '',
						folderId: undefined,
						thumbnails: {},
						metadata: {},
						createdBy: '' as DatabaseId,
						updatedBy: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString
					}
				};
			}
		},
		folders: {
			create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
				return {
					success: true,
					data: {
						...folder,
						_id: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString,
						order: 0,
						name: folder.name,
						path: folder.path
					}
				};
			},
			createMany: async (folders: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaFolder[]>> => {
				return {
					success: true,
					data: folders.map((f) => ({
						...f,
						_id: '' as DatabaseId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString,
						order: 0,
						name: f.name,
						path: f.path
					}))
				};
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			delete: async (_folderId: DatabaseId): Promise<DatabaseResult<void>> => {
				return { success: true, data: undefined };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			deleteMany: async (_folderIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
				return { success: true, data: { deletedCount: _folderIds.length } };
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			getTree: async (_maxDepth?: number): Promise<DatabaseResult<MediaFolder[]>> => {
				return { success: true, data: [] };
			},
			getFolderContents: async (
				_folderId?: DatabaseId,
				_options?: PaginationOptions
			): Promise<DatabaseResult<{ folders: MediaFolder[]; files: MediaItem[]; totalCount: number }>> => {
				return { success: true, data: { folders: [], files: [], totalCount: 0 } };
			},
			move: async (_folderId: DatabaseId, _targetParentId?: DatabaseId): Promise<DatabaseResult<MediaFolder>> => {
				return {
					success: true,
					data: {
						_id: _folderId,
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString,
						order: 0,
						name: '',
						path: '',
						parentId: _targetParentId
					}
				};
			}
		},

		getByFolder: async (folderId?: DatabaseId, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			try {
				// Use system_media collection for media files
				const MediaModel = mongoose.models['system_media'];
				if (!MediaModel) {
					return {
						success: false,
						message: 'Media model not initialized',
						error: {
							code: 'MODEL_NOT_FOUND',
							message: 'Media model not initialized'
						}
					};
				}

				// Build query - if folderId is undefined, get all files, otherwise filter by folderId
				const query = folderId ? { folderId } : {};

				// Apply pagination
				const page = options?.page || 1;
				const pageSize = options?.pageSize || 10;
				const skip = (page - 1) * pageSize;

				// Build sort criteria
				const sortField = options?.sortField || 'createdAt';
				const sortDirection = options?.sortDirection === 'asc' ? 1 : -1;
				const sort: { [key: string]: 1 | -1 } = { [sortField]: sortDirection };

				// Execute query with pagination
				const [items, total] = await Promise.all([
					MediaModel.find(query).sort(sort).skip(skip).limit(pageSize).lean().exec(),
					MediaModel.countDocuments(query).exec()
				]);

				// Calculate pagination metadata
				return {
					success: true,
					data: {
						items: items.map((item: any) => ({
							_id: item._id,
							filename: item.filename,
							hash: item.hash,
							path: item.path,
							size: item.size,
							type: item.type,
							mimeType: item.mimetype ?? item.mimeType ?? '', // ensure mimeType is present
							thumbnails: item.thumbnails ?? [], // default to empty array if missing
							createdAt: item.createdAt,
							updatedAt: item.updatedAt,
							folderId: item.folderId,
							metadata: item.metadata,
							createdBy: item.createdBy ?? null,
							updatedBy: item.updatedBy ?? null
						})) as MediaItem[],
						total,
						page,
						pageSize,
						hasNextPage: page * pageSize < total,
						hasPreviousPage: page > 1
					}
				};
			} catch (error) {
				logger.error('Error in getByFolder:', error as LoggableValue);
				return {
					success: false,
					message: 'Failed to fetch media files',
					error: {
						code: 'GET_BY_FOLDER_ERROR',
						message: 'Failed to fetch media files',
						details: error
					}
				};
			}
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		uploadMany: async (_files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'uploadMany method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'uploadMany method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		delete: async (_fileId: DatabaseId): Promise<DatabaseResult<void>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'delete method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'delete method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		deleteMany: async (_fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'deleteMany method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'deleteMany method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		search: async (_query: string, _options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'search method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'search method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		getMetadata: async (_fileIds: DatabaseId[]): Promise<DatabaseResult<Record<string, MediaMetadata>>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'getMetadata method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'getMetadata method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		updateMetadata: async (_fileId: DatabaseId, _metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem>> => {
			// Placeholder implementation - can be implemented later if need
			return {
				success: false,
				message: 'updateMetadata method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'updateMetadata method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		move: async (_fileIds: DatabaseId[], _targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'move method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'move method not yet implemented'
				}
			};
		},

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		duplicate: async (_fileId: DatabaseId, _newName?: string): Promise<DatabaseResult<MediaItem>> => {
			// Placeholder implementation - can be implemented later if needed
			return {
				success: false,
				message: 'duplicate method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'duplicate method not yet implemented'
				}
			};
		}
	};

	// Model Setup Helper
	private modelSetup = {
		// Helper method to set up models if they don't already exist
		setupModel: (name: string, schema: mongoose.Schema) => {
			// Use mongoose.Schema
			if (!mongoose.models[name]) {
				mongoose.model(name, schema);
				logger.debug(`\x1b[34m${name}\x1b[0m model created.`);

				// Register discriminators when setting up content structure model
				if (name === 'system_content_structure') {
					registerContentStructureDiscriminators();
				}
			} else {
				logger.debug(`\x1b[34m${name}\x1b[0m model already exists.`);
			}
		},

		// Upload media method
		uploadMedia: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
			try {
				// For avatars, we need to use a specific collection
				const collectionName = 'media_images';
				const model = mongoose.models[collectionName];

				if (!model) {
					// Try to setup the model if it doesn't exist
					this.modelSetup.setupModel(collectionName, mediaSchema);
					const newModel = mongoose.models[collectionName];
					if (!newModel) {
						throw new Error(`Failed to create model for collection: ${collectionName}`);
					}
				}

				const mediaItem = {
					...file,
					_id: new mongoose.Types.ObjectId().toString() as DatabaseId,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				} as MediaItem;

				const savedMedia = await mongoose.models[collectionName].create(mediaItem);

				return {
					success: true,
					data: {
						...savedMedia.toObject(),
						createdAt: savedMedia.createdAt.toISOString(),
						updatedAt: savedMedia.updatedAt.toISOString()
					} as MediaItem
				};
			} catch (error) {
				logger.error('Error in uploadMedia:', {
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined
				});
				return {
					success: false,
					message: 'Failed to upload media',
					error: {
						code: 'MEDIA_UPLOAD_ERROR',
						message: 'Failed to upload media',
						details: error
					}
				};
			}
		}
	};

	// Draft and Revision Management
	draftsAndRevisions = {
		// Create a new draft
		createDraft: async (
			content: Record<string, unknown>,
			collectionId: string,
			originalDocumentId: string,
			userId: string
		): Promise<ContentDraft> => {
			return DraftModel.create({
				content,
				collectionId,
				originalDocumentId,
				userId,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: 'draft'
			});
		},

		// Update a draft
		updateDraft: async (draftId: string, content: Record<string, unknown>): Promise<ContentDraft> => {
			const updatedDraft = await DraftModel.findByIdAndUpdate(
				draftId,
				{ $set: { content, updatedAt: new Date().toISOString() } },
				{ new: true }
			).exec();
			if (!updatedDraft) {
				throw new Error('Draft not found');
			}
			return updatedDraft as ContentDraft;
		},

		// Publish a draft
		publishDraft: async (draftId: string): Promise<ContentDraft> => {
			const updatedDraft = await DraftModel.findByIdAndUpdate(
				draftId,
				{ $set: { status: 'published', publishedAt: new Date().toISOString() } },
				{ new: true }
			).exec();
			if (!updatedDraft) {
				throw new Error('Draft not found');
			}
			return updatedDraft as ContentDraft;
		},

		// Get drafts by user
		getDraftsByUser: async (userId: string): Promise<ContentDraft[]> => {
			return DraftModel.find({ userId }).lean().exec() as Promise<ContentDraft[]>;
		},

		// Create a new revision
		createRevision: async (collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<ContentRevision> => {
			return RevisionModel.create({
				collectionId,
				documentId,
				userId,
				data,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: 'revision'
			});
		},

		// Get revisions for a document
		getRevisions: async (collectionId: string, documentId: string): Promise<ContentRevision[]> => {
			return RevisionModel.find({ collectionId, documentId }).sort({ createdAt: -1 }).lean().exec() as Promise<ContentRevision[]>;
		},

		// Delete a specific revision
		deleteRevision: async (revisionId: string): Promise<void> => {
			await RevisionModel.findByIdAndDelete(revisionId).exec();
		},

		// Restore a specific revision to its original document
		restoreRevision: async (collectionId: string, revisionId: string): Promise<void> => {
			// Find the revision to restore
			const revision = await RevisionModel.findById(revisionId).lean().exec();
			if (!revision) {
				throw new Error('Revision not found');
			}
			// Update the document in the collection with the revision data
			const collectionName = `collection_${collectionId}`;
			const model = mongoose.models[collectionName];
			if (!model) {
				throw new Error(`Collection model ${collectionName} not found`);
			}
			await model.findByIdAndUpdate(revision.contentId, { $set: revision.data }, { new: true }).exec();
			// Optionally, mark this revision as current
			await RevisionModel.findByIdAndUpdate(revisionId, { $set: { isCurrent: true } }).exec();
		}
	};

	// Widget Management
	widgets = {
		// Set up widget models
		setupWidgetModels: async (): Promise<void> => {
			try {
				// Ensure the Widget model is properly registered
				if (!mongoose.models.Widget) {
					logger.debug('Widget model not found, will be created on first use');
				} else {
					logger.debug('Widget model already exists');
				}

				logger.info('Widget models set up successfully.');
			} catch (error) {
				const err = toErrorWithExtras(error);
				logger.error('Failed to set up widget models: ' + err.message, { error: err });
				throw new Error('Failed to set up widget models');
			}
		},

		// Register a new widget
		register: async (widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return {
						success: false,
						message: 'Widget model not initialized',
						error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' }
					};
				}

				const newWidget = new WidgetModel({
					...widget,
					_id: this.utils?.generateId()
				});

				const savedWidget = await newWidget.save();
				return { success: true, data: savedWidget.toObject() as Widget };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to register widget',
					error: createDatabaseError(error, 'WIDGET_REGISTER_FAILED', 'Failed to register widget')
				};
			}
		},

		// Activate a widget
		activate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return {
						success: false,
						message: 'Widget model not initialized',
						error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' }
					};
				}

				const result = await WidgetModel.findByIdAndUpdate(widgetId, { $set: { isActive: true } }).exec();
				if (!result) {
					return { success: false, message: 'Widget not found', error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to activate widget',
					error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to activate widget')
				};
			}
		},

		// Deactivate a widget
		deactivate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return {
						success: false,
						message: 'Widget model not initialized',
						error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' }
					};
				}

				const result = await WidgetModel.findByIdAndUpdate(widgetId, { $set: { isActive: false } }).exec();
				if (!result) {
					return { success: false, message: 'Widget not found', error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to deactivate widget',
					error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to deactivate widget')
				};
			}
		},

		// Update widget
		update: async (widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return {
						success: false,
						message: 'Widget model not initialized',
						error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' }
					};
				}

				const updatedWidget = await WidgetModel.findByIdAndUpdate(widgetId, { $set: widget }, { new: true }).lean().exec();
				if (!updatedWidget) {
					return {
						success: false,
						message: 'Widget not found',
						error: createDatabaseError(new Error('Widget not found'), 'NOT_FOUND', 'Widget not found')
					};
				}

				return { success: true, data: updatedWidget as Widget };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to update widget',
					error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to update widget')
				};
			}
		},

		// Delete widget
		delete: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return {
						success: false,
						message: 'Widget model not initialized',
						error: {
							code: 'MODEL_NOT_FOUND',
							message: 'Widget model not initialized',
							details: 'Widget model is missing in mongoose.models'
						}
					};
				}

				const result = await WidgetModel.findByIdAndDelete(widgetId).exec();
				if (!result) {
					return { success: false, message: 'Widget not found', error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to delete widget',
					error: createDatabaseError(error, 'WIDGET_DELETE_FAILED', 'Failed to delete widget')
				};
			}
		},

		// Get active widgets
		getActiveWidgets: async (): Promise<DatabaseResult<string[]>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					// Return empty array if no widgets are registered yet (fresh installation)
					return { success: true, data: [] };
				}

				const activeWidgets = await WidgetModel.find({ isActive: true }).select('name').lean().exec();
				const widgetNames = activeWidgets.map((widget) => widget.name);

				return { success: true, data: widgetNames };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get active widgets',
					error: createDatabaseError(error, 'WIDGET_FETCH_FAILED', 'Failed to get active widgets')
				};
			}
		}
	};

	// Theme Management
	themes = {
		// Set up theme models
		setupThemeModels: async (): Promise<void> => {
			try {
				// Ensure the Theme model is properly registered
				if (!mongoose.models.Theme) {
					logger.debug('Theme model not found, will be created on first use');
				} else {
					logger.debug('Theme model already exists');
				}

				logger.info('Theme models set up successfully.');
			} catch (error) {
				logger.error('Failed to set up theme models: ' + (error instanceof Error ? error.message : String(error)));
				throw new Error('Failed to set up theme models');
			}
		},

		// Get active theme
		getActive: async (): Promise<DatabaseResult<Theme>> => {
			try {
				const activeTheme = await ThemeModel.findOne({ isActive: true }).lean().exec();
				if (!activeTheme) {
					return { success: false, message: 'No active theme found', error: { code: 'NOT_FOUND', message: 'No active theme found' } };
				}

				return { success: true, data: activeTheme as Theme };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get active theme',
					error: createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get active theme')
				};
			}
		},

		// Set theme as default
		setDefault: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				// First, unset all default flags
				await ThemeModel.updateMany({}, { $set: { isDefault: false } }).exec();

				// Then set the specified theme as default
				const result = await ThemeModel.findByIdAndUpdate(themeId, { $set: { isDefault: true } }).exec();

				if (!result) {
					return { success: false, message: 'Theme not found', error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to set default theme',
					error: createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to set default theme')
				};
			}
		},

		// Install a new theme
		install: async (theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>> => {
			try {
				const newTheme = new ThemeModel({
					...theme,
					_id: this.utils.generateId()
				});

				const savedTheme = await newTheme.save();
				return { success: true, data: savedTheme.toObject() as Theme };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to install theme',
					error: createDatabaseError(error, 'THEME_INSTALL_FAILED', 'Failed to install theme')
				};
			}
		},

		// Uninstall a theme
		uninstall: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const result = await ThemeModel.findByIdAndDelete(themeId).exec();
				if (!result) {
					return { success: false, message: 'Theme not found', error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to uninstall theme',
					error: createDatabaseError(error, 'THEME_UNINSTALL_FAILED', 'Failed to uninstall theme')
				};
			}
		},

		// Update a theme
		update: async (themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> => {
			try {
				const updatedTheme = await ThemeModel.findByIdAndUpdate(themeId, { $set: theme }, { new: true }).lean().exec();
				if (!updatedTheme) {
					return { success: false, message: 'Theme not found', error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: updatedTheme as Theme };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to update theme',
					error: createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to update theme')
				};
			}
		},

		// Get all themes
		getAllThemes: async (): Promise<Theme[]> => {
			try {
				const themes = await ThemeModel.find().sort({ order: 1 }).lean().exec();
				return themes as Theme[];
			} catch (error) {
				logger.error('Failed to get all themes:', error);
				return [];
			}
		},

		// Store multiple themes
		storeThemes: async (themes: Theme[]): Promise<void> => {
			try {
				await ThemeModel.insertMany(themes);
				logger.info(`Successfully stored ${themes.length} themes`);
			} catch (error) {
				logger.error('Failed to store themes:', error);
				throw error;
			}
		},

		// Get default theme for tenant
		getDefaultTheme: async (): Promise<Theme | null> => {
			try {
				// For now, ignore tenantId and just return the default theme
				const defaultTheme = await ThemeModel.findOne({ isDefault: true }).lean().exec();
				return defaultTheme as Theme | null;
			} catch (error) {
				logger.error('Failed to get default theme:', error);
				return null;
			}
		}
	};

	// System Preferences Management
	systemPreferences = {
		// Set user preferences for a specific layout
		setUserPreferences: async (userId: string, layoutId: string, layout: Layout): Promise<void> => {
			try {
				await SystemPreferencesModel.findOneAndUpdate(
					{ userId },
					{ $set: { [`preferences.${layoutId}`]: layout }, updatedAt: new Date() },
					{ upsert: true, new: true }
				);
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_SAVE_ERROR', 'Failed to save user preferences');
			}
		},

		// Get system preferences for a user, specifically a single layout
		getSystemPreferences: async (userId: string, layoutId: string): Promise<Layout | null> => {
			try {
				const doc = await SystemPreferencesModel.findOne({ userId, 'layout._id': layoutId }).lean().exec();
				const layout = doc?.layout?.id === layoutId ? doc.layout : null;
				return layout ?? null;
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_LOAD_ERROR', 'Failed to load user preferences');
			}
		},

		// Get the state for a single widget within a layout
		getWidgetState: async <T>(userId: string, layoutId: string, widgetId: string): Promise<T | null> => {
			try {
				const layout = await this.systemPreferences.getSystemPreferences(userId, layoutId);
				// The model uses `preferences` for the widget array
				return (layout?.preferences?.find((w) => w.id === widgetId)?.settings as T) ?? null;
			} catch (error) {
				throw createDatabaseError(error, 'WIDGET_STATE_GET_ERROR', 'Failed to get widget state');
			}
		},

		// Set the state for a single widget within a layout
		setWidgetState: async (userId: string, layoutId: string, widgetId: string, state: unknown): Promise<void> => {
			try {
				const doc = await SystemPreferencesModel.findOne({ userId, 'layout._id': layoutId }).exec();
				if (!doc || !doc.layout) {
					logger.warn(`Layout ${layoutId} not found for user ${userId}. State was not set.`);
					return;
				}
				// Handle preferences as array or object
				if (Array.isArray(doc.layout.preferences)) {
					const widgetPref = doc.layout.preferences.find((w) => w.id === widgetId);
					if (widgetPref) {
						widgetPref.settings = state as Record<string, unknown>;
						await doc.save();
					} else {
						logger.warn(`Widget with id ${widgetId} not found in layout ${layoutId} for user ${userId}. State was not set.`);
					}
				} else if (doc.layout.preferences && typeof doc.layout.preferences === 'object') {
					(doc.layout.preferences as Record<string, { settings: unknown }>)[widgetId] = {
						...(doc.layout.preferences as Record<string, { settings: unknown }>)[widgetId],
						settings: state
					};
					await doc.save();
				} else {
					logger.warn(`Preferences structure not recognized for user ${userId}, layout ${layoutId}.`);
				}
			} catch (error) {
				throw createDatabaseError(error, 'WIDGET_STATE_SAVE_ERROR', 'Failed to save widget state');
			}
		},

		// Get system-wide global preferences
		getGlobalPreferences: async (): Promise<SystemPreferences | null> => {
			try {
				const doc = await SystemPreferencesModel.findOne({ isGlobal: true }).lean().exec();
				return doc
					? {
							preferences: doc.layout?.preferences ?? [],
							loading: false,
							error: null
						}
					: null;
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_LOAD_ERROR', 'Failed to load global preferences');
			}
		},

		// Set system-wide global preferences
		setGlobalPreferences: async (preferences: SystemPreferences): Promise<void> => {
			try {
				await SystemPreferencesModel.updateOne({ isGlobal: true }, { $set: { preferences } }, { upsert: true });
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_SAVE_ERROR', 'Failed to save global preferences');
			}
		},

		// Clear all preferences for a user
		clearSystemPreferences: async (userId: string): Promise<void> => {
			try {
				await SystemPreferencesModel.deleteMany({ userId });
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_CLEAR_ERROR', 'Failed to clear preferences');
			}
		},

		// Interface-compliant methods for database-agnostic operations
		get: async <T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T>> => {
			try {
				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					const setting = await SystemSettingModel.findOne({ key }).lean();
					if (setting) {
						// Extract the actual value from the metadata wrapper structure
						// If value is an object with 'data' property, extract it; otherwise use the value directly
						let actualValue = setting.value;
						if (actualValue && typeof actualValue === 'object' && 'data' in actualValue) {
							actualValue = (actualValue as { data: unknown }).data as FlattenMaps<unknown>;
						}
						return { success: true, data: actualValue as T };
					}
					return {
						success: false,
						message: `System setting '${key}' not found`,
						error: createDatabaseError(new Error('Setting not found'), 'SETTING_NOT_FOUND', `System setting '${key}' not found`)
					};
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					const userPrefs = await SystemPreferencesModel.findOne({ userId: userId.toString() }).lean();
					const preferences: unknown = userPrefs?.layout?.preferences || {};
					let value: T | undefined;
					if (preferences && typeof preferences === 'object' && preferences !== null && key in preferences) {
						value = (preferences as Record<string, T>)[key];
					}
					if (value !== undefined) {
						return { success: true, data: value };
					}
					return {
						success: false,
						message: `User preference '${key}' not found`,
						error: createDatabaseError(new Error('Preference not found'), 'PREFERENCE_NOT_FOUND', `User preference '${key}' not found`)
					};
				}
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get preference',
					error: createDatabaseError(error, 'PREFERENCE_GET_ERROR', 'Failed to get preference')
				};
			}
		},

		getMany: async <T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> => {
			try {
				const result: Record<string, T> = {};

				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					const settings = await SystemSettingModel.find({ key: { $in: keys } }).lean();

					logger.debug(`getMany: Requested \x1b[32m${keys.length}\x1b[0m settings, found \x1b[32m${settings.length}\x1b[0m in database`);
					logger.debug(`getMany: Requested keys: \x1b[32m${keys.join(', ')}\x1b[0m`);
					logger.debug(`getMany: Found keys: \x1b[32m${settings.map((s) => s.key).join(', ')}\x1b[0m`);

					settings.forEach((setting) => {
						// Extract the actual value from the metadata wrapper structure
						// If value is an object with 'data' property, extract it; otherwise use the value directly
						let actualValue = setting.value;
						if (actualValue && typeof actualValue === 'object' && 'data' in actualValue) {
							actualValue = (actualValue as { data: unknown }).data as FlattenMaps<unknown>;
						}
						result[setting.key] = actualValue as T;
					});
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					const userPrefs = await SystemPreferencesModel.findOne({ userId: userId.toString() }).lean();
					const preferences = userPrefs?.layout?.preferences || {};
					const prefsDict = preferences as Record<string, unknown>;
					keys.forEach((key) => {
						if (prefsDict[key] !== undefined) {
							result[key] = prefsDict[key] as T;
						}
					});
				}

				return { success: true, data: result };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get preferences',
					error: createDatabaseError(error, 'PREFERENCES_GET_MANY_ERROR', 'Failed to get preferences')
				};
			}
		},

		set: async <T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					await SystemSettingModel.findOneAndUpdate({ key }, { key, value, scope: 'system', updatedAt: new Date() }, { upsert: true, new: true });
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					await SystemPreferencesModel.findOneAndUpdate(
						{ userId: userId.toString() },
						{ $set: { [`preferences.${key}`]: value }, updatedAt: new Date() },
						{ upsert: true, new: true }
					);
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to set preference',
					error: createDatabaseError(error, 'PREFERENCE_SET_ERROR', 'Failed to set preference')
				};
			}
		},

		setMany: async <T>(
			preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId }>
		): Promise<DatabaseResult<void>> => {
			try {
				// Group preferences by scope and user
				const systemPrefs = preferences.filter((p) => p.scope === 'system' || !p.scope);
				const userPrefsMap = new Map<string, Array<{ key: string; value: T }>>();

				preferences
					.filter((p) => p.scope === 'user')
					.forEach((p) => {
						if (!p.userId) throw new Error('User ID required for user preferences');
						const userId = p.userId.toString();
						if (!userPrefsMap.has(userId)) {
							userPrefsMap.set(userId, []);
						}
						userPrefsMap.get(userId)!.push({ key: p.key, value: p.value });
					});

				// Handle system settings
				if (systemPrefs.length > 0) {
					const { SystemSettingModel } = await import('./models/systemSetting');
					const bulkOps = systemPrefs.map((pref) => ({
						updateOne: {
							filter: { key: pref.key },
							update: { key: pref.key, value: pref.value, scope: 'system', updatedAt: new Date() },
							upsert: true
						}
					}));
					await SystemSettingModel.bulkWrite(bulkOps);
				}

				// Handle user preferences
				for (const [userId, userPrefs] of userPrefsMap) {
					const prefsObj = userPrefs.reduce(
						(acc, pref) => {
							acc[pref.key] = pref.value;
							return acc;
						},
						{} as Record<string, T>
					);
					await SystemPreferencesModel.findOneAndUpdate(
						{ userId },
						{ $set: { preferences: prefsObj }, updatedAt: new Date() },
						{ upsert: true, new: true }
					);
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to set preferences',
					error: createDatabaseError(error, 'PREFERENCES_SET_MANY_ERROR', 'Failed to set preferences')
				};
			}
		},

		delete: async (key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					await SystemSettingModel.deleteOne({ key });
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					// Limitation: SystemPreferencesModel does not support deleting individual user preference keys.
					// To delete specific keys, a custom update operation or schema change is required.
					// For now, this operation is not implemented.
					return {
						success: false,
						message: 'User preference deletion not implemented',
						error: createDatabaseError(new Error('Method not implemented'), 'METHOD_NOT_IMPLEMENTED', 'User preference deletion not implemented')
					};
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to delete preference',
					error: createDatabaseError(error, 'PREFERENCE_DELETE_ERROR', 'Failed to delete preference')
				};
			}
		},

		deleteMany: async (keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					await SystemSettingModel.deleteMany({ key: { $in: keys } });
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					// Note: SystemPreferencesModel doesn't have a direct delete method for individual keys
					// This would need to be implemented in the model or handled differently
					return {
						success: false,
						message: 'User preference deletion not implemented',
						error: createDatabaseError(new Error('Method not implemented'), 'METHOD_NOT_IMPLEMENTED', 'User preference deletion not implemented')
					};
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to delete preferences',
					error: createDatabaseError(error, 'PREFERENCES_DELETE_MANY_ERROR', 'Failed to delete preferences')
				};
			}
		},

		clear: async (scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					await SystemSettingModel.deleteMany({ scope: 'system' });
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							message: 'User ID is required for user preferences',
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					await SystemPreferencesModel.deleteMany({ userId: userId.toString() });
				}

				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to clear preferences',
					error: createDatabaseError(error, 'PREFERENCES_CLEAR_ERROR', 'Failed to clear preferences')
				};
			}
		}
	};

	// System Virtual Folder Management
	systemVirtualFolder = {
		create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
			try {
				const folderData = {
					...folder,
					_id: this.utils.generateId(),
					type: (folder as { type?: string })?.type || 'folder'
				};
				const newFolder = new SystemVirtualFolderModel(folderData);
				const savedFolder = await newFolder.save();
				return { success: true, data: savedFolder.toObject() as MediaFolder };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to create virtual folder',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_CREATION_FAILED', 'Failed to create virtual folder')
				};
			}
		},

		getById: async (folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>> => {
			try {
				const folder = await SystemVirtualFolderModel.findById(folderId).lean().exec();
				return { success: true, data: folder as SystemVirtualFolder | null };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get virtual folder by ID',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get virtual folder by ID')
				};
			}
		},

		getByParentId: async (parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
			try {
				const folders = await SystemVirtualFolderModel.find({ parentId }).sort({ order: 1 }).lean().exec();
				return { success: true, data: folders as SystemVirtualFolder[] };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get virtual folders by parent ID',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get virtual folders by parent ID')
				};
			}
		},

		getAll: async (): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
			try {
				const folders = await SystemVirtualFolderModel.find().sort({ order: 1 }).lean().exec();
				return { success: true, data: folders as SystemVirtualFolder[] };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get all virtual folders',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get all virtual folders')
				};
			}
		},

		update: async (folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> => {
			try {
				const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updateData, { new: true }).lean().exec();
				if (!updatedFolder) {
					return { success: false, message: 'Folder not found', error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				return { success: true, data: updatedFolder as SystemVirtualFolder };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to update virtual folder',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_UPDATE_FAILED', 'Failed to update virtual folder')
				};
			}
		},

		addToFolder: async (_contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>> => {
			try {
				const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).exec();
				if (!folder) {
					return { success: false, message: 'Folder not found', error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				// TODO: Implement proper media file association with folders
				// This would need to update the media collection with the folderId
				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to add content to folder',
					error: createDatabaseError(error, 'ADD_TO_FOLDER_FAILED', 'Failed to add content to folder')
				};
			}
		},

		getContents: async (folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> => {
			try {
				const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();
				if (!folder) {
					return { success: false, message: 'Folder not found', error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}

				const subFolders = await SystemVirtualFolderModel.find({ parentId: folder._id }).lean().exec();
				// TODO: Implement proper media file retrieval based on folderId
				const files: MediaItem[] = [];

				return {
					success: true,
					data: {
						folders: subFolders as SystemVirtualFolder[],
						files: files
					}
				};
			} catch (error) {
				return {
					success: false,
					message: 'Failed to get folder contents',
					error: createDatabaseError(error, 'GET_CONTENTS_FAILED', 'Failed to get folder contents')
				};
			}
		},

		delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const result = await SystemVirtualFolderModel.findByIdAndDelete(folderId).exec();
				if (!result) {
					return { success: false, message: 'Folder not found', error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				// Optionally, handle orphaned files here.
				return { success: true, data: undefined };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to delete virtual folder',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_DELETE_FAILED', 'Failed to delete virtual folder')
				};
			}
		},

		exists: async (path: string): Promise<DatabaseResult<boolean>> => {
			try {
				const count = await SystemVirtualFolderModel.countDocuments({ path }).exec();
				return { success: true, data: count > 0 };
			} catch (error) {
				return {
					success: false,
					message: 'Failed to check if virtual folder exists',
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_EXISTS_CHECK_FAILED', 'Failed to check if virtual folder exists')
				};
			}
		}
	};

	//  Other Queries
	queries = {
		// Fetch the last five collections
		getLastFiveCollections: async (): Promise<DatabaseResult<Document[]>> => {
			return {
				success: false,
				message: 'getLastFiveCollections method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'getLastFiveCollections method not yet implemented'
				}
			};
		},

		// Fetch logged-in users
		getLoggedInUsers: async (): Promise<DatabaseResult<Document[]>> => {
			return {
				success: false,
				message: 'getLoggedInUsers method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'getLoggedInUsers method not yet implemented'
				}
			};
		},

		// Fetch CMS data summary
		getCMSData: async (): Promise<DatabaseResult<{ collections: number; media: number; users: number; drafts: number }>> => {
			return {
				success: false,
				message: 'getCMSData method not yet implemented',
				error: {
					code: 'NOT_IMPLEMENTED',
					message: 'getCMSData method not yet implemented'
				}
			};
		}
	};

	//  System Model Management
	system = {
		// Set up system models
		setupSystemModels: async (): Promise<void> => {
			try {
				// Ensure the SystemSetting model is properly registered
				if (!mongoose.models.SystemSetting) {
					logger.debug('SystemSetting model not found, will be created on first use');
				} else {
					logger.debug('SystemSetting model already exists');
				}

				// Ensure the Theme model is properly registered
				if (!mongoose.models.Theme) {
					logger.debug('Theme model not found, registering it');
					// ThemeModel is already created when imported, so it should be available
					if (!mongoose.models.Theme) {
						throw new Error('Failed to register Theme model');
					}
				} else {
					logger.debug('Theme model already exists');
				}

				logger.info('System models set up successfully.');
			} catch (error) {
				logger.error('Failed to set up system models: ' + (error instanceof Error ? error.message : String(error)));
				throw new Error('Failed to set up system models');
			}
		}
	};

	// Query Builder Entry Point
	queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T> {
		try {
			// Check if model exists before creating query builder
			if (!mongoose.models[collection]) {
				logger.error(`QueryBuilder failed: Model ${collection} not found in mongoose.models`);
				logger.debug(`Available models: ${Object.keys(mongoose.models).join(', ')}`);
				throw new Error(`Model ${collection} not found`);
			}

			const model = mongoose.models[collection] as Model<T>;
			return new MongoQueryBuilder<T>(model);
		} catch (error) {
			logger.error(`Error creating QueryBuilder for collection ${collection}:`, { error });
			throw error;
		}
	}
}
