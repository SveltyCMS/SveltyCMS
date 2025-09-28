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
import type { SystemPreferences } from '@src/content/types';
import type { Unsubscriber } from 'svelte/store';

// Types
import type { CollectionConfig, Layout } from '@src/content/types';
import type { MediaType } from '@utils/media/mediaModels';
import type { ContentStructureNode as ContentNode } from './models/contentStructure';

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
import type { Document, FilterQuery, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

import { dateToISODateString, normalizeDateInput } from '../../utils/dateUtils';
import type {
	BaseEntity,
	CollectionModel,
	ConnectionPoolOptions,
	DatabaseAdapter,
	DatabaseError,
	DatabaseId,
	DatabaseResult,
	MediaItem,
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

export class MongoDBAdapter implements DatabaseAdapter {
	//  Core Connection Management
	private unsubscribe: Unsubscriber | undefined;
	private collectionsInitialized = false;

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

	// Helper function to normalize collection names for UUID-based collections
	private normalizeCollectionName(collection: string): string {
		if (collection.startsWith('collection_')) {
			return collection;
		}
		// Remove hyphens from UUID to match the database naming convention
		const normalizedUuid = collection.replace(/-/g, '');
		return `collection_${normalizedUuid}`;
	}

	//  Utility Methods
	public utils = {
		// Generate a unique ID using UUID
		generateId(): DatabaseId {
			return uuidv4().replace(/-/g, '') as DatabaseId;
		},
		normalizePath(path: string): string {
			return path;
		},
		validateId(id: string): boolean {
			return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
		},
		createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
			const { page = 1, pageSize = 10 } = options;
			const start = (page - 1) * pageSize;
			const end = start + pageSize;
			return {
				items: items.slice(start, end),
				total: items.length,
				page,
				pageSize
			};
		}
	};

	//  Content Structure Management
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
							const subDirFiles = await this.contentStructure.scanDirectoryForContentStructure(fullPath);
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
						const newNode = new ContentStructureModel({
							...contentData,
							_id: contentData._id, // Already validated
							type,
							parentPath: contentData.path.split('/').slice(0, -1).join('/') || null
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
						error: createDatabaseError(error instanceof Error ? error : new Error(String(error)), 'QUERY_FAILED', 'Failed to get content structure')
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
		}
	};

	//  Collection Management
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

		// Helper method to check if collection exists in MongoDB
		collectionExists: async (collectionName: string): Promise<boolean> => {
			try {
				const collections = await mongoose.connection.db?.listCollections({ name: collectionName.toLowerCase() }).toArray();
				return collections.length > 0;
			} catch (error) {
				logger.error(`Error checking if collection exists: ${error}`);
				return false;
			}
		},
		getModel: (id: string): CollectionModel => {
			return this.collection.models.get(id);
		},

		// Create or update a collection model based on the provided configuration
		createModel: async (collection: CollectionConfig): Promise<CollectionModel> => {
			try {
				// Generate UUID if not provided
				const collectionUuid = collection._id || this.utils.generateId();

				// Ensure collection name is prefixed with collection_
				const collectionName = `collection_${collectionUuid}`;

				// Return existing model if it exists
				if (mongoose.models[collectionName]) {
					logger.debug(`Model \x1b[34m${collectionName}\x1b[0m already exists in Mongoose`);
					this.collection.models.set(collectionUuid, mongoose.models[collectionName]);
					return mongoose.models[collectionName] as unknown as CollectionModel;
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
					createdBy: { type: Schema.Types.Mixed, ref: 'auth_users' },
					updatedBy: { type: Schema.Types.Mixed, ref: 'auth_users' }
				};

				// Process fields if they exist
				if (collection.fields && Array.isArray(collection.fields)) {
					for (const field of collection.fields) {
						try {
							// Generate fieldKey from label if db_fieldName is not present
							const fieldKey = field.db_fieldName || (field.label ? field.label.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null) || field.Name;

							if (!fieldKey) {
								logger.error(`Field missing required identifiers:`, JSON.stringify(field, null, 2));
								continue;
							}

							const isRequired = field.required || false;
							const isTranslated = field.translate || false;
							const isSearchable = field.searchable || false;
							const isUnique = field.unique || false;

							// Base field schema with improved type handling
							const fieldSchema: mongoose.SchemaDefinitionProperty = {
								type: Schema.Types.Mixed, // Default to Mixed type
								required: isRequired,
								translate: isTranslated,
								searchable: isSearchable,
								unique: isUnique
							};

							// Add field specific validations or transformations if needed
							if (field.type === 'string') {
								fieldSchema.type = String;
							} else if (field.type === 'number') {
								fieldSchema.type = Number;
							} else if (field.type === 'boolean') {
								fieldSchema.type = Boolean;
							} else if (field.type === 'date') {
								fieldSchema.type = Date;
							}

							schemaDefinition[fieldKey] = fieldSchema;
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
				const wrappedModel: CollectionModel = Object.assign(Object.create(model), model, {
					aggregate: async (pipeline: Record<string, unknown>[]) => {
						return await model.aggregate(pipeline as mongoose.PipelineStage[]).exec();
					}
				});
				this.collection.models.set(collectionUuid, wrappedModel);
				return wrappedModel;
			} catch (error) {
				logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
				logger.error('Collection config that caused error:', JSON.stringify(collection, null, 2));
				throw error;
			}
		}
	};

	//  CRUD Operations
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
				logger.error(`Error in findOne for collection ${collection}:`, { error });
				return {
					success: false,
					message: `Error in findOne for collection ${collection}: ${error.message}`,
					error: createDatabaseError(error, 'FIND_ONE_ERROR', `Error in findOne for collection ${collection}: ${error.message}`)
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
				logger.error(`Error in findMany for collection ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'FIND_MANY_ERROR', `Error in findMany for collection ${collection}: ${error.message}`)
				};
			}
		},
		// Implementing insertOne method
		insert: async <T extends DocumentContent = DocumentContent>(collection: string, doc: Partial<T>): Promise<DatabaseResult<T>> => {
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
						)
					};
				}

				// Generate ID if not provided and ensure it's a string
				const documentId = doc._id || this.utils.generateId();

				// Validate and normalize date fields
				const now = new Date();
				const validatedDoc = {
					...doc,
					_id: documentId,
					createdAt: doc.createdAt ? normalizeDateInput(doc.createdAt) : dateToISODateString(now),
					updatedAt: doc.updatedAt ? normalizeDateInput(doc.updatedAt) : dateToISODateString(now)
				};

				logger.debug(`Attempting to insert document into ${collectionName}`, { docId: documentId });
				const result = await model.create(validatedDoc);
				logger.info(`Successfully inserted document into ${collectionName}`, { docId: documentId });

				return {
					success: true,
					data: result
				};
			} catch (error) {
				// More detailed error handling
				if (typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === 'ValidationError') {
					const validationError = error as import('mongoose').Error.ValidationError;
					const validationErrors = validationError.errors
						? Object.keys(validationError.errors).map((key) => ({
								field: key,
								message: validationError.errors[key]?.message,
								kind: (validationError.errors[key] as { kind?: string })?.kind
							}))
						: [];

					logger.error(`Validation error inserting into ${collection}:`, {
						message: validationError.message,
						validationErrors,
						document: doc
					});
					return {
						success: false,
						error: createDatabaseError(error, 'VALIDATION_ERROR', `Validation error: ${validationError.message}`)
					};
				}

				if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000) {
					logger.error(`Duplicate key error inserting into ${collection}:`, {
						message: (error as { message?: string }).message,
						keyPattern: (error as { keyPattern?: unknown }).keyPattern,
						keyValue: (error as { keyValue?: unknown }).keyValue
					});
					return {
						success: false,
						error: createDatabaseError(error, 'DUPLICATE_KEY_ERROR', `Duplicate key error: ${(error as { message?: string }).message}`)
					};
				}

				// Log full error details
				logger.error(`Error inserting document into ${collection}:`, {
					message: error.message,
					name: error.name,
					code: error.code,
					stack: typeof error === 'object' && error !== null && 'stack' in error ? (error as { stack?: string }).stack : undefined,
					fullError: error
				});
				return {
					success: false,
					error: createDatabaseError(error, 'INSERT_ERROR', `Error inserting document into ${collection}: ${error.message}`)
				};
			}
		},

		// Implementing insertMany method
		insertMany: async <T extends DocumentContent = DocumentContent>(collection: string, docs: Partial<T>[]): Promise<DatabaseResult<T[]>> => {
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

				// Validate and normalize date fields for all docs
				const now = new Date();
				const validatedDocs = docs.map((doc) => ({
					...doc,
					_id: doc._id || this.utils.generateId(),
					createdAt: doc.createdAt ? normalizeDateInput(doc.createdAt) : dateToISODateString(now),
					updatedAt: doc.updatedAt ? normalizeDateInput(doc.updatedAt) : dateToISODateString(now)
				}));

				const results = await model.insertMany(validatedDocs);
				return {
					success: true,
					data: results
				};
			} catch (error) {
				if (error && error.name === 'ValidationError') {
					const invalidFields = error.errors ? Object.keys(error.errors) : [];
					logger.error(`insertMany ValidationError in ${collection}:`, {
						message: error.message,
						fields: invalidFields,
						errors: error.errors
					});
					return {
						success: false,
						message: `insertMany ValidationError: ${error.message}`,
						error: createDatabaseError(error, 'VALIDATION_ERROR', `insertMany ValidationError: ${error.message}`)
					};
				} else {
					logger.error(`Error inserting many documents into ${collection}:`, {
						message: error?.message,
						stack: error?.stack
					});
					return {
						success: false,
						message: `Error inserting many documents into ${collection}`,
						error: createDatabaseError(error, 'INSERT_MANY_ERROR', `Error inserting many documents into ${collection}`)
					};
				}
			}
		},

		// Implementing update method to match dbInterface signature
		update: async <T extends DocumentContent = DocumentContent>(
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
						)
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
						)
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
				logger.error(`Error updating document ${id} in ${collectionName}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'UPDATE_ERROR', `Error updating document ${id} in ${collectionName}: ${error.message}`)
				};
			}
		},

		// Implementing updateMany method
		updateMany: async <T extends DocumentContent = DocumentContent>(
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
				logger.error(`Error updating many documents in ${collection}:`, { error });
				return {
					success: false,
					message: `Error updating many documents in ${collection}: ${error.message}`,
					error: createDatabaseError(error, 'UPDATE_MANY_ERROR', `Error updating many documents in ${collection}: ${error.message}`)
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
						)
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
						)
					};
				}

				logger.info(`Successfully deleted document ${id} from ${collectionName}`);
				return {
					success: true,
					data: undefined
				};
			} catch (error) {
				logger.error(`Error deleting document ${id} from ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'DELETE_ERROR', `Error deleting document ${id} from ${collection}: ${error.message}`)
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
						)
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
				logger.error(`Error finding documents by IDs in ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'FIND_BY_IDS_ERROR', `Error finding documents by IDs in ${collection}: ${error.message}`)
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
						)
					};
				}

				const now = new Date();
				const upsertData = {
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
				const processedResult = {
					...result,
					createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
					updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
				} as T;

				logger.info(`Successfully upserted document in ${collectionName}`);
				return {
					success: true,
					data: processedResult
				};
			} catch (error) {
				logger.error(`Error upserting document in ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'UPSERT_ERROR', `Error upserting document in ${collection}: ${error.message}`)
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
						)
					};
				}

				const results: T[] = [];
				const now = new Date();

				for (const item of items) {
					const upsertData = {
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
					const processedResult = {
						...result,
						createdAt: result.createdAt ? dateToISODateString(new Date(result.createdAt)) : undefined,
						updatedAt: result.updatedAt ? dateToISODateString(new Date(result.updatedAt)) : undefined
					} as T;

					results.push(processedResult);
				}

				logger.info(`Successfully upserted ${results.length} documents in ${collectionName}`);
				return {
					success: true,
					data: results
				};
			} catch (error) {
				logger.error(`Error upserting many documents in ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'UPSERT_MANY_ERROR', `Error upserting many documents in ${collection}: ${error.message}`)
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
				logger.error(`Error deleting many documents from ${collection}:`, { error });
				return {
					success: false,
					error: createDatabaseError(error, 'DELETE_MANY_ERROR', `Error deleting many documents from ${collection}: ${error.message}`)
				};
			}
		}
	};

	//  Authentication Model Management
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
				logger.error('Failed to set up authentication models: ' + error.message);
				throw Error('Failed to set up authentication models');
			}
		}
	};

	//  Media Model Management
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
				try {
					const result = await this.modelSetup.uploadMedia(file);
					return result;
				} catch (error) {
					logger.error('Error uploading file:', error as LoggableValue);
					return {
						success: false,
						error: {
							code: 'MEDIA_UPLOAD_ERROR',
							message: 'Failed to upload media file',
							details: error
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
							error: {
								code: 'MODEL_NOT_FOUND',
								message: 'Media model not initialized'
							}
						};
					}

					// Build query - if folderId is undefined, get all files, otherwise filter by folderId
					const query = folderId ? { folderId } : {};

					// Apply additional filters if provided
					if (options?.filter) {
						Object.assign(query, options.filter);
					}

					// Apply pagination
					const page = options?.page || 1;
					const pageSize = options?.pageSize || 10;
					const skip = (page - 1) * pageSize;

					// Build sort criteria
					const sortField = options?.sortField || 'createdAt';
					const sortDirection = options?.sortDirection === 'asc' ? 1 : -1;
					const sort = { [sortField]: sortDirection };

					// Execute query with pagination
					const [items, total] = await Promise.all([
						MediaModel.find(query).sort(sort).skip(skip).limit(pageSize).lean().exec(),
						MediaModel.countDocuments(query).exec()
					]);

					// Calculate pagination metadata
					const totalPages = Math.ceil(total / pageSize);

					return {
						success: true,
						data: {
							items: items as MediaItem[],
							total,
							totalPages,
							currentPage: page,
							pageSize
						}
					};
				} catch (error) {
					logger.error('Error in getByFolder:', error as LoggableValue);
					return {
						success: false,
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
					error: {
						code: 'NOT_IMPLEMENTED',
						message: 'duplicate method not yet implemented'
					}
				};
			}
		},

		// Delete media
		deleteMedia: async (mediaId: string): Promise<boolean> => {
			try {
				const result = await mongoose.models['media_files'].deleteOne({ _id: mediaId });
				return result.deletedCount === 1;
			} catch (error) {
				logger.error(`Error deleting media ${mediaId}:`, error);
				return false;
			}
		},

		// Fetch media in a specific folder
		getMediaInFolder: async (folderId: string): Promise<MediaType[]> => {
			try {
				return await mongoose.models['media_files'].find({ folderId }).sort({ createdAt: -1 }).lean().exec();
			} catch (error) {
				logger.error(`Error getting media for folder ${folderId}:`, error);
				return [];
			}
		},

		// Move media to a virtual folder
		moveMediaToFolder: async (mediaId: string, folderId: string): Promise<boolean> => {
			try {
				const result = await mongoose.models['media_files'].updateOne({ _id: mediaId }, { $set: { folderId } });
				return result.modifiedCount === 1;
			} catch (error) {
				logger.error(`Error moving media ${mediaId} to folder ${folderId}:`, error);
				return false;
			}
		},

		//Fetch the last five media documents
		getLastFiveMedia: async (): Promise<MediaType[]> => {
			throw new Error('Method not implemented.');
		}
	};

	//  Model Setup Helper
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
					this.setupModel(collectionName, mediaSchema);
					const newModel = mongoose.models[collectionName];
					if (!newModel) {
						throw new Error(`Failed to create model for collection: ${collectionName}`);
					}
				}

				const mediaItem = {
					...file,
					_id: new mongoose.Types.ObjectId().toString(),
					createdAt: new Date(),
					updatedAt: new Date()
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
					error: {
						code: 'MEDIA_UPLOAD_ERROR',
						message: 'Failed to upload media',
						details: error
					}
				};
			}
		}
	};

	//  Draft and Revision Management
	draftsAndRevisions = {
		// Create a new draft
		createDraft: async (content: Record<string, unknown>, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> => {
			return DraftModel.createDraft(content, collectionId, original_document_id, user_id);
		},

		// Update a draft
		updateDraft: async (draft_id: string, content: Record<string, unknown>): Promise<Draft> => {
			return DraftModel.updateDraft(draft_id, content);
		},

		// Publish a draft
		publishDraft: async (draft_id: string): Promise<Draft> => {
			return DraftModel.publishDraft(draft_id);
		},

		// Get drafts by user
		getDraftsByUser: async (user_id: string): Promise<Draft[]> => {
			return DraftModel.getDraftsByUser(user_id);
		},

		// Create a new revision
		createRevision: async (collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<Revision> => {
			return RevisionModel.createRevision(collectionId, documentId, userId, data);
		},

		// Get revisions for a document
		getRevisions: async (collectionId: string, documentId: string): Promise<Revision[]> => {
			return RevisionModel.getRevisions(collectionId, documentId);
		},

		// Delete a specific revision
		deleteRevision: async (revisionId: string): Promise<void> => {
			return RevisionModel.deleteRevision(revisionId);
		},

		// Restore a specific revision to its original document
		restoreRevision: async (collectionId: string, revisionId: string): Promise<void> => {
			return RevisionModel.restoreRevision(collectionId, revisionId);
		}
	};

	//  Widget Management
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
				logger.error('Failed to set up widget models: ' + error.message);
				throw new Error('Failed to set up widget models');
			}
		},

		// Register a new widget
		register: async (widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return { success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' } };
				}

				const newWidget = new WidgetModel({
					...widget,
					_id: this.utils.generateId()
				});

				const savedWidget = await newWidget.save();
				return { success: true, data: savedWidget.toObject() as Widget };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'WIDGET_REGISTER_FAILED', 'Failed to register widget') };
			}
		},

		// Activate a widget
		activate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return { success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' } };
				}

				const result = await WidgetModel.findByIdAndUpdate(widgetId, { $set: { isActive: true } }).exec();
				if (!result) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to activate widget') };
			}
		},

		// Deactivate a widget
		deactivate: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return { success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' } };
				}

				const result = await WidgetModel.findByIdAndUpdate(widgetId, { $set: { isActive: false } }).exec();
				if (!result) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to deactivate widget') };
			}
		},

		// Update widget
		update: async (widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return { success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' } };
				}

				const updatedWidget = await WidgetModel.findByIdAndUpdate(widgetId, { $set: widget }, { new: true }).lean().exec();
				if (!updatedWidget) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: updatedWidget as Widget };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to update widget') };
			}
		},

		// Delete widget
		delete: async (widgetId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const WidgetModel = mongoose.models['Widget'] as Model<Widget>;
				if (!WidgetModel) {
					return { success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Widget model not initialized' } };
				}

				const result = await WidgetModel.findByIdAndDelete(widgetId).exec();
				if (!result) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'WIDGET_DELETE_FAILED', 'Failed to delete widget') };
			}
		}
	};

	//  Theme Management
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
					return { success: false, error: { code: 'NOT_FOUND', message: 'No active theme found' } };
				}

				return { success: true, data: activeTheme as Theme };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get active theme') };
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
					return { success: false, error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to set default theme') };
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
				return { success: false, error: createDatabaseError(error, 'THEME_INSTALL_FAILED', 'Failed to install theme') };
			}
		},

		// Uninstall a theme
		uninstall: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const result = await ThemeModel.findByIdAndDelete(themeId).exec();
				if (!result) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'THEME_UNINSTALL_FAILED', 'Failed to uninstall theme') };
			}
		},

		// Update a theme
		update: async (themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> => {
			try {
				const updatedTheme = await ThemeModel.findByIdAndUpdate(themeId, { $set: theme }, { new: true }).lean().exec();
				if (!updatedTheme) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Theme not found' } };
				}

				return { success: true, data: updatedTheme as Theme };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to update theme') };
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

	//  System Preferences Management
	systemPreferences = {
		// Set user preferences for a specific layout
		setUserPreferences: async (userId: string, layoutId: string, layout: Layout): Promise<void> => {
			try {
				await SystemPreferencesModel.setUserPreferences(userId, { [layoutId]: layout });
			} catch (error) {
				throw createDatabaseError(error, 'PREFERENCES_SAVE_ERROR', 'Failed to save user preferences');
			}
		},

		// Get system preferences for a user, specifically a single layout
		getSystemPreferences: async (userId: string, layoutId: string): Promise<Layout | null> => {
			try {
				const result = await SystemPreferencesModel.getPreferenceByLayout(userId, layoutId);
				if (result.success) {
					return result.data;
				}
				return null;
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
				throw createDatabaseError(error, 'WIDGET_STATE_LOAD_ERROR', 'Failed to load widget state');
			}
		},

		// Set the state for a single widget within a layout
		setWidgetState: async (userId: string, layoutId: string, widgetId: string, state: unknown): Promise<void> => {
			try {
				const query = {
					userId,
					layoutId,
					'layout.preferences.id': widgetId
				};
				const update = {
					$set: { 'layout.preferences.$.settings': state }
				};
				const result = await SystemPreferencesModel.updateOne(query, update);

				if (result.matchedCount === 0) {
					logger.warn(`Widget with id ${widgetId} not found in layout ${layoutId} for user ${userId}. State was not set.`);
				}
			} catch (error) {
				throw createDatabaseError(error, 'WIDGET_STATE_SAVE_ERROR', 'Failed to save widget state');
			}
		},

		// Get system-wide global preferences
		getGlobalPreferences: async (): Promise<SystemPreferences | null> => {
			try {
				const doc = await SystemPreferencesModel.findOne({ isGlobal: true }).lean().exec();
				return doc?.preferences ?? null;
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
				await SystemPreferencesModel.deletePreferencesByUser(userId);
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
							actualValue = (actualValue as { data: unknown }).data;
						}
						return { success: true, data: actualValue as T };
					}
					return {
						success: false,
						error: createDatabaseError(new Error('Setting not found'), 'SETTING_NOT_FOUND', `System setting '${key}' not found`)
					};
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					const preferences = await SystemPreferencesModel.getSystemPreferences(userId.toString());
					const value = preferences[key] as T;
					if (value !== undefined) {
						return { success: true, data: value };
					}
					return {
						success: false,
						error: createDatabaseError(new Error('Preference not found'), 'PREFERENCE_NOT_FOUND', `User preference '${key}' not found`)
					};
				}
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCE_GET_ERROR', 'Failed to get preference') };
			}
		},

		getMany: async <T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> => {
			try {
				const result: Record<string, T> = {};

				if (scope === 'system' || !scope) {
					// Handle system settings
					const { SystemSettingModel } = await import('./models/systemSetting');
					const settings = await SystemSettingModel.find({ key: { $in: keys } }).lean();

					logger.debug(`getMany: Requested ${keys.length} settings, found ${settings.length} in database`);
					logger.debug(`getMany: Requested keys: ${keys.join(', ')}`);
					logger.debug(`getMany: Found keys: ${settings.map((s) => s.key).join(', ')}`);

					settings.forEach((setting) => {
						// Extract the actual value from the metadata wrapper structure
						// If value is an object with 'data' property, extract it; otherwise use the value directly
						let actualValue = setting.value;
						if (actualValue && typeof actualValue === 'object' && 'data' in actualValue) {
							actualValue = (actualValue as { data: unknown }).data;
						}
						result[setting.key] = actualValue as T;
					});
				} else {
					// Handle user preferences
					if (!userId) {
						return {
							success: false,
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					const preferences = await SystemPreferencesModel.getSystemPreferences(userId.toString());
					keys.forEach((key) => {
						if (preferences[key] !== undefined) {
							result[key] = preferences[key] as T;
						}
					});
				}

				return { success: true, data: result };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCES_GET_MANY_ERROR', 'Failed to get preferences') };
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
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					const preferences = { [key]: value };
					await SystemPreferencesModel.setUserPreferences(userId.toString(), preferences);
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCE_SET_ERROR', 'Failed to set preference') };
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
					await SystemPreferencesModel.setUserPreferences(userId, prefsObj);
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCES_SET_MANY_ERROR', 'Failed to set preferences') };
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
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					// Note: SystemPreferencesModel doesn't have a direct delete method for individual keys
					// This would need to be implemented in the model or handled differently
					return {
						success: false,
						error: createDatabaseError(new Error('Method not implemented'), 'METHOD_NOT_IMPLEMENTED', 'User preference deletion not implemented')
					};
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCE_DELETE_ERROR', 'Failed to delete preference') };
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
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					// Note: SystemPreferencesModel doesn't have a direct delete method for individual keys
					// This would need to be implemented in the model or handled differently
					return {
						success: false,
						error: createDatabaseError(new Error('Method not implemented'), 'METHOD_NOT_IMPLEMENTED', 'User preference deletion not implemented')
					};
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCES_DELETE_MANY_ERROR', 'Failed to delete preferences') };
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
							error: createDatabaseError(new Error('User ID required'), 'USER_ID_REQUIRED', 'User ID is required for user preferences')
						};
					}
					await SystemPreferencesModel.deletePreferencesByUser(userId.toString());
				}

				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'PREFERENCES_CLEAR_ERROR', 'Failed to clear preferences') };
			}
		}
	};

	//  System Virtual Folder Management
	systemVirtualFolder = {
		create: async (folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> => {
			try {
				const folderData = {
					...folder,
					_id: this.utils.generateId(),
					type: folder.type || 'folder'
				};
				const newFolder = new SystemVirtualFolderModel(folderData);
				const savedFolder = await newFolder.save();
				return { success: true, data: savedFolder.toObject() as SystemVirtualFolder };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_CREATION_FAILED', 'Failed to create virtual folder') };
			}
		},

		getById: async (folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>> => {
			try {
				const folder = await SystemVirtualFolderModel.findById(folderId).lean().exec();
				return { success: true, data: folder as SystemVirtualFolder | null };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get virtual folder by ID') };
			}
		},

		getByParentId: async (parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
			try {
				const folders = await SystemVirtualFolderModel.find({ parentId }).sort({ order: 1 }).lean().exec();
				return { success: true, data: folders as SystemVirtualFolder[] };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get virtual folders by parent ID') };
			}
		},

		getAll: async (): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
			try {
				const folders = await SystemVirtualFolderModel.find().sort({ order: 1 }).lean().exec();
				return { success: true, data: folders as SystemVirtualFolder[] };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_FETCH_FAILED', 'Failed to get all virtual folders') };
			}
		},

		update: async (folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> => {
			try {
				const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updateData, { new: true }).lean().exec();
				if (!updatedFolder) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				return { success: true, data: updatedFolder as SystemVirtualFolder };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_UPDATE_FAILED', 'Failed to update virtual folder') };
			}
		},

		addToFolder: async (contentId: DatabaseId, folderPath: string): Promise<DatabaseResult<void>> => {
			try {
				const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).exec();
				if (!folder) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				// TODO: Implement proper media file association with folders
				// This would need to update the media collection with the folderId
				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'ADD_TO_FOLDER_FAILED', 'Failed to add content to folder') };
			}
		},

		getContents: async (folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> => {
			try {
				const folder = await SystemVirtualFolderModel.findOne({ path: folderPath }).lean().exec();
				if (!folder) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } };
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
				return { success: false, error: createDatabaseError(error, 'GET_CONTENTS_FAILED', 'Failed to get folder contents') };
			}
		},

		delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
			try {
				const result = await SystemVirtualFolderModel.findByIdAndDelete(folderId).exec();
				if (!result) {
					return { success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } };
				}
				// Optionally, handle orphaned files here.
				return { success: true, data: undefined };
			} catch (error) {
				return { success: false, error: createDatabaseError(error, 'VIRTUAL_FOLDER_DELETE_FAILED', 'Failed to delete virtual folder') };
			}
		},

		exists: async (path: string): Promise<DatabaseResult<boolean>> => {
			try {
				const count = await SystemVirtualFolderModel.countDocuments({ path }).exec();
				return { success: true, data: count > 0 };
			} catch (error) {
				return {
					success: false,
					error: createDatabaseError(error, 'VIRTUAL_FOLDER_EXISTS_CHECK_FAILED', 'Failed to check if virtual folder exists')
				};
			}
		}
	};

	//  Other Queries
	queries = {
		// Fetch the last five collections
		getLastFiveCollections: async (): Promise<Document[]> => {
			throw new Error('Method not implemented.');
		},

		// Fetch logged-in users
		getLoggedInUsers: async (): Promise<Document[]> => {
			throw new Error('Method not implemented.');
		},

		// Fetch CMS data
		getCMSData: async (): Promise<{
			collections: number;
			media: number;
			users: number;
			drafts: number;
		}> => {
			throw new Error('Method not implemented.');
		}
	};

	//  System Model Management
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
