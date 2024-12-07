/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description MongoDB adapter for CMS database operations and user preferences.
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with retry mechanism
 * - CRUD operations for collections, drafts, revisions, and widgets
 * - Management of media storage and retrieval
 * - User, role, and permission management
 * - Management of system preferences including user screen sizes and layout preferences
 *
 * Key Features:
 * - Automatic reconnection with retry logic for MongoDB
 * - Schema definitions and model creation for various collections (e.g., Drafts, Revisions, Widgets)
 * - Handling of media files with a schema for different media types
 * - Management of authentication-related models (e.g., User, Token, Session)
 * - Default and custom theme management with database operations
 * - User preferences storage and retrieval, including layout and screen size information
 *
 * Usage:
 * This adapter is utilized when the CMS is configured to use MongoDB, providing a
 * database-agnostic interface for various database operations within the CMS.
 * The adapter supports complex queries, schema management, and handles error logging
 * and connection retries.
 */

import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';
import path from 'path';
import type { Unsubscriber } from 'svelte/store';
import type { ScreenSize } from '@root/src/stores/screenSizeStore.svelte';
import type { UserPreferences, WidgetPreference } from '@root/src/stores/userPreferences.svelte';
import type { VirtualFolderUpdateData } from '@src/types/virtualFolder';

// Database
import mongoose, { Schema } from 'mongoose';
import type { Document, Model, FilterQuery, UpdateQuery } from 'mongoose';
import type { dbInterface, Draft, Revision, Theme, Widget, SystemPreferences, SystemVirtualFolder } from '../dbInterface';

import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';

// Media
import type { MediaBase, MediaType } from '@utils/media/mediaModels';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logging
import { logger } from '@utils/logger.svelte';

// Define the media schema for different media types
const mediaSchema = new Schema(
	{
		hash: { type: String, required: true }, // The hash of the media
		thumbnail: {
			url: { type: String, required: true }, // The URL of the media
			altText: { type: String }, // The alt text for the media
			name: { type: String }, // The name for the media
			type: { type: String }, // The type for the media
			size: { type: Number }, // The size for the media
			width: { type: Number }, // The width for the media
			height: { type: Number } // The height for the media
		} // The thumbnails of media
		// url: { type: String, required: true }, // The URL of the media
		// altText: { type: String, required: true }, // The alt text for the media
	},
	{ timestamps: false, collection: 'media' } // Explicitly set the collection name
);

// Define the Draft model if it doesn't exist already
const DraftModel =
	mongoose.models?.Draft ||
	mongoose.model<Draft>(
		'Draft',
		new Schema(
			{
				originalDocumentId: { type: Schema.Types.Mixed, required: true }, // Or Schema.Types.String
				collectionId: { type: Schema.Types.Mixed, required: true }, // The ID of the collection
				content: { type: Schema.Types.Mixed, required: true }, // The content of the draft
				status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // Status of the draft
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true } // The user who created the draft
			},
			{ timestamps: false, collection: 'collection_drafts' }
		)
	);

// Define the Revision model if it doesn't exist already
const RevisionModel =
	mongoose.models?.Revision ||
	mongoose.model<Revision>(
		'Revision',
		new Schema(
			{
				collectionId: { type: Schema.Types.Mixed, required: true, ref: 'collections' }, // ID of the collection
				documentId: { type: Schema.Types.Mixed, required: true }, // ID of the document
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true }, // ID of the user who created the revision
				content: { type: Schema.Types.Mixed, required: true }, // Content of the revision
				version: { type: Number, required: true } // Version number of the revision
			},
			{ timestamps: false, collection: 'collection_revisions' }
		)
	);

// Create the Theme model if it doesn't exist already
const ThemeModel =
	mongoose.models?.Theme ||
	mongoose.model<Theme>(
		'Theme',
		new Schema(
			{
				name: { type: String, required: true, unique: true }, // Name of the theme
				path: { type: String, required: true }, // Path to the theme file
				isDefault: { type: Boolean, default: false } // Whether the theme is the default theme
			},
			{ timestamps: true, collection: 'system_themes' }
		)
	);

// Create the Widget model if it doesn't exist already
const WidgetModel =
	mongoose.models?.Widget ||
	mongoose.model<Widget>(
		'Widget',
		new Schema(
			{
				name: { type: String, required: true, unique: true }, // Name of the widget
				isActive: { type: Boolean, default: true } // Whether the widget is active
			},
			{ timestamps: false, collection: 'system_widgets' }
		)
	);

// Define the System Preferences schema for user layout and screen size
const SystemPreferencesModel =
	mongoose.models?.SystemPreferences ||
	mongoose.model<SystemPreferences>(
		'SystemPreferences',
		new Schema(
			{
				_id: { type: String, required: true }, // The ID of the SystemPreferences
				name: { type: String, required: true }, // The name of the SystemPreferences
				isActive: { type: Boolean, default: true } // Whether the SystemPreferences is active
			},
			{ timestamps: false, collection: 'system_preferences' } // Explicitly set the collection name
		)
	);

// Define the SystemVirtualFolder model only if it doesn't already exist
const SystemVirtualFolderModel =
	mongoose.models?.SystemVirtualFolder ||
	mongoose.model<SystemVirtualFolder>(
		'SystemVirtualFolder',
		new Schema(
			{
				name: { type: String, required: true },
				parent: { type: Schema.Types.ObjectId, ref: 'SystemVirtualFolder', default: null }, // Allow null for root folders
				path: { type: String, required: true }
			},
			{ collection: 'system_virtualfolders' } // Explicitly set the collection name to system_virtualfolders
		)
	);

import type { CollectionConfig } from '@src/collections/types';

import { widgets, initializeWidgets } from '@src/components/widgets';

export class MongoDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private collectionsInitialized = false;

	// Helper method to recursively scan directories for collection files
	private async scanDirectoryForCollections(dirPath: string): Promise<string[]> {
		const collectionFiles: string[] = [];
		try {
			const entries = await import('fs').then((fs) => fs.promises.readdir(dirPath, { withFileTypes: true }));

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				if (entry.isDirectory()) {
					// Recursively scan subdirectories
					const subDirFiles = await this.scanDirectoryForCollections(fullPath);
					collectionFiles.push(...subDirFiles);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					collectionFiles.push(fullPath);
				}
			}
		} catch (error) {
			logger.error(`Error scanning directory ${dirPath}: ${error.message}`);
		}
		return collectionFiles;
	}

	// Sync collections with database
	async syncCollections(): Promise<void> {
		if (browser) {
			logger.debug('Skipping collection sync in browser environment');
			return;
		}

		try {
			logger.debug('Starting collection sync...');

			// Initialize widgets globally
			if (!globalThis.widgets) {
				logger.debug('Initializing widgets globally...');
				globalThis.widgets = widgets;
				initializeWidgets();
			}

			// Only import fs on server side
			const { promises: fs } = await import('fs');

			// Get path to collections directory
			const collectionsPath = path.resolve(process.cwd(), 'collections');

			logger.debug('Collections path:', collectionsPath);

			// Check if collections directory exists
			try {
				await fs.access(collectionsPath);
			} catch (error: unknown) {
				logger.error(`Collections directory not found at ${collectionsPath}:`, { error });
				return;
			}

			// Known collection directories
			const collectionDirs = ['Collections', 'Menu'];

			for (const dir of collectionDirs) {
				const dirPath = path.join(collectionsPath, dir);
				try {
					// Recursively scan for collection files
					const collectionFiles = await this.scanDirectoryForCollections(dirPath);
					logger.debug(`Found \x1b[34m${collectionFiles.length}\x1b[0m collection files in \x1b[34m${dir}\x1b[0m directory and subdirectories`);

					for (const filePath of collectionFiles) {
						try {
							logger.debug(`Processing collection file: \x1b[34m${filePath}\x1b[0m`);

							const collection = await import(/* @vite-ignore */ filePath);
							const collectionConfig = collection.default || collection.schema;

							if (collectionConfig) {
								// Get collection name from the file path
								const parsedPath = path.parse(filePath);
								const collectionName = parsedPath.name;

								// Add name to config if not present
								if (!collectionConfig.name) {
									collectionConfig.name = collectionName;
								}

								logger.debug(`Collection config for \x1b[34m${collectionName}:\x1b[0m`, {
									name: collectionConfig.name,
									fields: collectionConfig.fields?.length || 0,
									strict: collectionConfig.strict
								});

								await this.createCollectionModel(collectionConfig);
								logger.debug(`Successfully created/synced collection model for \x1b[34m${collectionName}\x1b[0m`);
							} else {
								logger.error(`Collection file ${filePath} does not export a valid schema or default export`);
							}
						} catch (error) {
							logger.error(`Error importing collection ${filePath}: ${error.message}`);
						}
					}
				} catch (error) {
					logger.error(`Error processing directory ${dir}: ${error.message}`);
				}
			}

			logger.debug('Collection sync completed successfully');
		} catch (error) {
			logger.error('Error syncing collections: ' + error.message);
			throw new Error('Failed to sync collections');
		}
	}

	// Connect to MongoDB
	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		logger.debug('Attempting to connect to MongoDB...');
		const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv://');

		// Construct the connection string
		let connectionString: string;
		if (isAtlas) {
			connectionString = `${privateEnv.DB_HOST}/${privateEnv.DB_NAME}`;
		} else {
			connectionString = `${privateEnv.DB_HOST}${privateEnv.DB_PORT ? `:${privateEnv.DB_PORT}` : ''}/${privateEnv.DB_NAME}`;
		}

		// Set connection options
		const options: mongoose.ConnectOptions = {
			authSource: isAtlas ? undefined : 'admin', // Only use authSource for local connection
			user: privateEnv.DB_USER,
			pass: privateEnv.DB_PASSWORD,
			dbName: privateEnv.DB_NAME,
			maxPoolSize: privateEnv.DB_POOL_SIZE || 5,
			retryWrites: true,
			serverSelectionTimeoutMS: 5000 // 5 seconds timeout for server selection
		};

		// Use Mongoose's built-in retry logic
		mongoose.connection.on('connected', () => {
			logger.info('MongoDB connection established successfully.');
		});

		mongoose.connection.on('disconnected', () => {
			logger.warn('MongoDB connection lost. Attempting to reconnect...');
		});

		mongoose.connection.on('error', (err) => {
			logger.error(`MongoDB connection error: ${err.message}`);
		});

		let lastError: unknown;
		for (let i = 1; i <= attempts; i++) {
			try {
				await mongoose.connect(connectionString, options);
				logger.info(`Successfully connected to MongoDB database: ${privateEnv.DB_NAME}`);
				await this.syncCollections();
				return;
			} catch (error: unknown) {
				lastError = error;
				if (i === attempts) {
					logger.error(`Failed to connect to MongoDB after ${attempts} attempts: ${lastError}`);
					throw new Error('MongoDB connection failed');
				}
				logger.warn(`Connection attempt ${i}/${attempts} failed, retrying...`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * i)); // Exponential backoff
			}
		}
	}

	// Update generateId to always return string
	generateId(): string {
		return new mongoose.Types.ObjectId().toString(); //required for MongoDB id as ObjectId
	}

	// Convert a string ID to a MongoDB ObjectId
	convertId(id: string): mongoose.Types.ObjectId {
		return new mongoose.Types.ObjectId(id);
	}

	// Get collection models
	async getCollectionModels(): Promise<Record<string, Model<Document>>> {
		logger.debug('getCollectionModels called');

		if (this.collectionsInitialized) {
			logger.debug('Collections already initialized, returning existing models.');
			return mongoose.models as Record<string, Model<Document>>;
		}

		try {
			// Initialize base models without waiting for collections
			const baseModels: Record<string, Model<Document>> = {};

			// Mark collections as initialized to prevent circular dependency
			this.collectionsInitialized = true;

			// Return base models - collections will be added later as needed
			return baseModels;
		} catch (error) {
			logger.error('Failed to get collection models: ' + error.message);
			return {};
		}
	}

	// Helper method to map field types with improved type safety
	private mapFieldType(type: string): mongoose.SchemaDefinitionProperty {
		// First check for widget types
		const widgetTypeMap: Record<string, mongoose.SchemaDefinitionProperty> = {
			Text: String,
			RichText: String,
			Number: Number,
			Checkbox: Boolean,
			Date: Date,
			DateTime: Date,
			DateRange: Object,
			Email: String,
			PhoneNumber: String,
			Currency: Number,
			Rating: Number,
			Radio: String,
			MediaUpload: mongoose.Schema.Types.Mixed,
			MegaMenu: Array,
			Relation: mongoose.Schema.Types.ObjectId,
			RemoteVideo: String,
			ColorPicker: String,
			Seo: Object,
			Address: Object
		};

		// Then check for basic types
		const basicTypeMap: Record<string, mongoose.SchemaDefinitionProperty> = {
			string: String,
			number: Number,
			boolean: Boolean,
			date: Date,
			object: mongoose.Schema.Types.Mixed,
			array: Array,
			text: String,
			richtext: String,
			media: mongoose.Schema.Types.Mixed
		};

		// Try widget type first, then basic type, default to Mixed
		return widgetTypeMap[type] || basicTypeMap[type.toLowerCase()] || mongoose.Schema.Types.Mixed;
	}

	// Set up authentication models
	setupAuthModels(): void {
		try {
			this.setupModel('auth_tokens', TokenSchema);
			this.setupModel('auth_users', UserSchema);
			this.setupModel('auth_sessions', SessionSchema);
			logger.info('Authentication models set up successfully.');
		} catch (error) {
			logger.error('Failed to set up authentication models: ' + error.message);
			throw Error('Failed to set up authentication models');
		}
	}

	// Helper method to set up models if they don't already exist
	private setupModel(name: string, schema: Schema) {
		if (!mongoose.models[name]) {
			mongoose.model(name, schema);
			logger.debug(`${name} model created.`);
		} else {
			logger.debug(`\x1b[34m${name}\x1b[0m model already exists.`);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote', 'media_collection'];
		mediaSchemas.forEach((schemaName) => {
			this.setupModel(schemaName, mediaSchema);
		});
		logger.info('Media models set up successfully.');
	}

	// Set up widget models
	setupWidgetModels(): void {
		// This will ensure that the Widget model is created or reused
		if (!mongoose.models.Widget) {
			mongoose.model('Widget', WidgetModel.schema);
			logger.info('Widget model created.');
		} else {
			logger.info('Widget model already exists.');
		}
		logger.info('Widget models set up successfully.');
	}

	// Implementing findOne method
	async findOne<T extends Document>(collection: string, query: FilterQuery<T>): Promise<T | null> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`Collection ${collection} does not exist.`);
				throw Error(`Collection ${collection} does not exist.`);
			}
			const result = await model.findOne(query).lean().exec();
			return result as T | null; // Explicitly cast to T
		} catch (error: unknown) {
			logger.error(`Error in findOne for collection ${collection}:`, { error });
			throw new Error(`Error in findOne for collection ${collection}`);
		}
	}

	// Implementing findMany method
	async findMany<T extends Document>(collection: string, query: FilterQuery<T>): Promise<T[]> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`findMany failed. Collection ${collection} does not exist.`);
			throw Error(`findMany failed. Collection ${collection} does not exist.`);
		}
		const results = await model.find(query).lean().exec();
		return results as T[]; // Explicitly cast to T[]
	}

	// Implementing insertOne method
	async insertOne<T extends Document>(collection: string, doc: Partial<T>): Promise<T> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`insertOne failed. Collection ${collection} does not exist.`);
			throw Error(`insertOne failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.create(doc);
			return result as T; // Explicitly cast to T
		} catch (error) {
			logger.error(`Error inserting document into ${collection}: ${error.message}`);
			throw Error(`Error inserting document into ${collection}`);
		}
	}

	// Implementing insertMany method
	async insertMany<T extends Document>(collection: string, docs: Partial<T>[]): Promise<T[]> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`insertMany failed. Collection ${collection} does not exist.`);
			throw Error(`insertMany failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.insertMany(docs);
			return result as T[];
		} catch (error) {
			logger.error(`Error inserting many documents into ${collection}: ${error.message}`);
			throw Error(`Error inserting many documents into ${collection}`);
		}
	}

	// Implementing updateOne method
	async updateOne<T extends Document>(
		collection: string,
		query: FilterQuery<T>,
		update: UpdateQuery<T>
	): Promise<{
		acknowledged: boolean;
		modifiedCount: number;
		upsertedId: mongoose.Types.ObjectId | null;
		upsertedCount: number;
		matchedCount: number;
	}> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`updateOne failed. Collection ${collection} does not exist.`);
			throw Error(`updateOne failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.updateOne(query, update, { strict: false }); // strict: false for now to avoid schema errors
			return result;
		} catch (error) {
			logger.error(`Error updating document in ${collection}: ${error.message}`);
			throw Error(`Error updating document in ${collection}`);
		}
	}

	// Implementing updateMany method
	async updateMany<T extends Document>(
		collection: string,
		query: FilterQuery<T>,
		update: UpdateQuery<T>
	): Promise<{
		acknowledged: boolean;
		modifiedCount: number;
		upsertedId: mongoose.Types.ObjectId | null;
		upsertedCount: number;
		matchedCount: number;
	}> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`updateMany failed. Collection ${collection} does not exist.`);
			throw Error(`updateMany failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.updateMany(query, update).exec();
			return result;
		} catch (error) {
			logger.error(`Error updating many documents in ${collection}: ${error.message}`);
			throw Error(`Error updating many documents in ${collection}`);
		}
	}

	// Implementing deleteOne method
	async deleteOne<T extends Document>(collection: string, query: FilterQuery<T>): Promise<number> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			throw Error(`Collection ${collection} not found`);
		}
		try {
			const result = await model.deleteOne(query).exec();
			return result.deletedCount ?? 0;
		} catch (error) {
			logger.error(`Error deleting document from ${collection}: ${error.message}`);
			throw Error(`Error deleting document from ${collection}`);
		}
	}

	// Implementing deleteMany method
	async deleteMany<T extends Document>(collection: string, query: FilterQuery<T>): Promise<number> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			throw Error(`Collection ${collection} not found`);
		}
		try {
			const result = await model.deleteMany(query).exec();
			return result.deletedCount ?? 0;
		} catch (error) {
			logger.error(`Error deleting many documents from ${collection}: ${error.message}`);
			throw Error(`Error deleting many documents from ${collection}`);
		}
	}

	// Implementing countDocuments method
	async countDocuments<T extends Document>(collection: string, query?: FilterQuery<T>): Promise<number> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`countDocuments failed. Collection ${collection} does not exist.`);
			throw Error(`countDocuments failed. Collection ${collection} does not exist.`);
		}
		try {
			const count = await model.countDocuments(query).exec();
			return count;
		} catch (error) {
			logger.error(`Error counting documents in ${collection}: ${error.message}`);
			throw Error(`Error counting documents in ${collection}`);
		}
	}

	// Create a collection model
	async createCollectionModel(collection: CollectionConfig): Promise<Model<Document>> {
		if (!collection.name) {
			throw new Error('Collection must have a name');
		}

		const collectionName = String(collection.name);
		logger.debug(`Creating collection model for \x1b[34m${collectionName}\x1b[0m`);

		// Check if model already exists
		if (mongoose.models[collectionName]) {
			return mongoose.models[collectionName];
		}

		// Define base schema definition
		const schemaDefinition: Record<string, mongoose.SchemaDefinitionProperty> = {
			createdBy: {
				type: String,
				required: false
			},
			revisionsEnabled: {
				type: Boolean,
				required: false
			},
			translationStatus: {
				type: mongoose.Schema.Types.Mixed,
				default: {}
			}
		};

		// Add fields from collection schema
		if (collection.fields) {
			for (const field of collection.fields) {
				try {
					let fieldConfig;
					let widgetType;
					let fieldKey;

					if (typeof field === 'function') {
						// If field is a widget function, execute it to get config
						const result = field({});
						widgetType = result.widget.Name; // Get widget name from the widget object
						fieldConfig = result; // The result contains all field properties
						fieldKey = result.db_fieldName;
					} else {
						// If field is a direct configuration object
						widgetType = field.type;
						fieldConfig = field;
						fieldKey = field.db_fieldName;
					}

					// If db_fieldName is not provided, generate one from the label
					if (!fieldKey && fieldConfig.label) {
						fieldKey = fieldConfig.label.toLowerCase().replace(/\s+/g, '_');
						logger.debug(`Generated db_fieldName '${fieldKey}' from label '${fieldConfig.label}'`);
					}

					if (!fieldKey) {
						logger.warn(`Field in collection \x1b[34m${collectionName}\x1b[0m has no db_fieldName or label, skipping`);
						continue;
					}

					const isRequired = fieldConfig?.required === true;
					const isTranslated = fieldConfig?.translated === true;

					// Map the widget type to a MongoDB type
					const mongooseType = this.mapFieldType(widgetType);

					// Create the field schema
					let fieldSchema: mongoose.SchemaDefinitionProperty;

					if (isTranslated) {
						fieldSchema = {
							type: Map,
							of: mongooseType,
							required: isRequired,
							default: {}
						};
					} else {
						fieldSchema = {
							type: mongooseType,
							required: isRequired
						};
					}

					// Add any additional field configuration
					if (widgetType === 'Relation' && fieldConfig.collection) {
						fieldSchema.ref = fieldConfig.collection;
					}

					// Add the field to the schema
					schemaDefinition[fieldKey] = fieldSchema;
					logger.debug(`Added field ${fieldKey} with type ${widgetType} to collection ${collectionName}`);
				} catch (error) {
					logger.error(`Error processing field in collection ${collectionName}: ${error.message}`);
				}
			}
		}

		const schemaOptions = {
			strict: collection.strict !== false,
			timestamps: true,
			collection: collectionName.toLowerCase()
		};

		// Create and return the model
		const schema = new mongoose.Schema(schemaDefinition, schemaOptions);
		return mongoose.model(collectionName, schema);
	}

	// Methods for Draft and Revision Management

	// Create a new draft
	async createDraft(content: Record<string, unknown>, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> {
		try {
			const draft = new DraftModel({
				originalDocumentId: this.convertId(original_document_id),
				collectionId: this.convertId(collectionId),
				content,
				createdBy: this.convertId(user_id)
			});
			await draft.save();
			logger.info(`Draft created successfully for document ID: ${original_document_id}`);
			return draft.toObject() as Draft;
		} catch (error) {
			logger.error(`Error creating draft: ${error.message}`);
			throw Error(`Error creating draft`);
		}
	}

	// Update a draft
	async updateDraft(draft_id: string, content: Record<string, unknown>): Promise<Draft> {
		try {
			const draft = await DraftModel.findById(draft_id);
			if (!draft) throw Error('Draft not found');

			// Update the draft content and timestamp
			draft.content = content;
			draft.updatedAt = new Date();
			await draft.save();

			logger.info(`Draft ${draft_id} updated successfully.`);

			// Return the updated draft as a plain JavaScript object and cast it to Draft
			return draft.toObject() as Draft;
		} catch (error) {
			logger.error(`Error updating draft: ${error.message}`);
			throw Error(`Error updating draft`);
		}
	}

	// Publish a draft
	async publishDraft(draft_id: string): Promise<Draft> {
		try {
			const draft = await DraftModel.findById(draft_id);
			if (!draft) throw Error('Draft not found');
			draft.status = 'published';
			await draft.save();

			const revision = new RevisionModel({
				collectionId: draft.collectionId,
				documentId: draft.originalDocumentId,
				content: draft.content,
				createdBy: draft.createdBy
			});
			await revision.save();
			logger.info(`Draft ${draft_id} published and revision created successfully.`);
			return draft.toObject() as Draft;
		} catch (error) {
			logger.error(`Error publishing draft: ${error.message}`);
			throw Error(`Error publishing draft`);
		}
	}

	// Get drafts by user
	async getDraftsByUser(user_id: string): Promise<Draft[]> {
		try {
			const drafts = await DraftModel.find({ createdBy: this.convertId(user_id) })

				.exec();
			logger.info(`Retrieved ${drafts.length} drafts for user ID: ${user_id}`);
			return drafts;
		} catch (error) {
			logger.error(`Error retrieving drafts for user ${user_id}: ${error.message}`);
			throw Error(`Error retrieving drafts for user ${user_id}`);
		}
	}

	// Create a new revision
	async createRevision(collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<Revision> {
		try {
			const revision = new RevisionModel({
				collectionId: this.convertId(collectionId),
				documentId: this.convertId(documentId),
				content: data,
				createdBy: this.convertId(userId)
			});
			await revision.save();
			logger.info(`Revision created successfully for document ID: ${documentId} in collection ID: ${collectionId}`);
			return revision;
		} catch (error) {
			logger.error(`Error creating revision: ${error.message}`);
			throw Error(`Error creating revision`);
		}
	}

	// Get revisions for a document
	async getRevisions(collectionId: string, documentId: string): Promise<Revision[]> {
		try {
			const revisions = await RevisionModel.find({
				collectionId: this.convertId(collectionId),
				documentId: this.convertId(documentId)
			})
				.sort({ createdAt: -1 })
				.exec();

			logger.info(`Revisions retrieved for document ID: ${documentId} in collection ID: ${collectionId}`);
			return revisions;
		} catch (error) {
			logger.error(`Error retrieving revisions for document ID ${documentId} in collection ID ${collectionId}: ${error.message}`);
			throw Error(`Failed to retrieve revisions`);
		}
	}

	// Delete a specific revision
	async deleteRevision(revisionId: string): Promise<void> {
		try {
			const result = await RevisionModel.deleteOne({ _id: revisionId });
			if (result.deletedCount === 0) {
				throw Error(`Revision not found with ID: ${revisionId}`);
			}

			logger.info(`Revision ${revisionId} deleted successfully.`);
		} catch (error) {
			logger.error(`Error deleting revision ${revisionId}: ${error.message}`);
			throw Error(`Failed to delete revision`);
		}
	}

	// Restore a specific revision to its original document
	async restoreRevision(collectionId: string, revisionId: string): Promise<void> {
		try {
			// Fetch the revision with the correct typing
			const revision = await RevisionModel.findOne({ _id: revisionId }).exec();

			if (!revision) {
				throw Error(`Revision not found with ID: ${revisionId}`);
			}

			// Destructure the necessary properties
			const { documentId, content } = revision;

			if (!documentId || !content) {
				throw Error(`Revision ${revisionId} is missing required fields.`);
			}

			// Convert IDs to ObjectId if necessary
			const documentObjectId = this.convertId(documentId);

			// Update the original document with the revision content
			const updateResult = await this.updateOne(collectionId, { _id: documentObjectId }, { $set: content });

			// Check if the document was modified
			if (updateResult.modifiedCount === 0) {
				throw Error(`Failed to restore revision: Document not found or no changes applied.`);
			}

			logger.info(`Revision ${revisionId} restored successfully to document ID: ${documentId}`);
		} catch (error) {
			logger.error(`Error restoring revision ${revisionId}: ${error.message}`);
			throw Error(`Failed to restore revision`);
		}
	}

	// Methods for Widget Management

	// Install a new widget
	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		try {
			const widget = new WidgetModel({
				...widgetData,
				isActive: widgetData.isActive ?? false,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await widget.save();
			logger.info(`Widget ${widgetData.name} installed successfully.`);
		} catch (error) {
			logger.error(`Error installing widget: ${error.message}`);
			throw Error(`Error installing widget`);
		}
	}

	// Fetch all widgets
	async getAllWidgets(): Promise<Widget[]> {
		try {
			const widgets = await WidgetModel.find().exec();
			logger.info(`Fetched ${widgets.length} widgets.`);
			return widgets;
		} catch (error) {
			logger.error(`Error fetching all widgets: ${error.message}`);
			throw Error(`Error fetching all widgets`);
		}
	}

	// Fetch active widgets
	async getActiveWidgets(): Promise<string[]> {
		try {
			const widgets = await WidgetModel.find({ isActive: true }).lean().exec();
			const activeWidgetNames = widgets.map((widget) => widget.name);
			logger.info(`Fetched ${activeWidgetNames.length} active widgets.`);
			return activeWidgetNames;
		} catch (error) {
			logger.error(`Error fetching active widgets: ${error.message}`);
			throw Error(`Error fetching active widgets`);
		}
	}

	// Activate a widget
	async activateWidget(widgetName: string): Promise<void> {
		try {
			const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or already active.`);
			}
			logger.info(`Widget ${widgetName} activated successfully.`);
		} catch (error) {
			logger.error(`Error activating widget: ${error.message}`);
			throw Error(`Error activating widget`);
		}
	}

	// Deactivate a widget
	async deactivateWidget(widgetName: string): Promise<void> {
		try {
			const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or already inactive.`);
			}
			logger.info(`Widget ${widgetName} deactivated successfully.`);
		} catch (error) {
			logger.error(`Error deactivating widget: ${error.message}`);
			throw Error(`Error deactivating widget`);
		}
	}

	// Update a widget
	async updateWidget(widgetName: string, updateData: Partial<Widget>): Promise<void> {
		try {
			const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or no changes applied.`);
			}
			logger.info(`Widget ${widgetName} updated successfully.`);
		} catch (error) {
			logger.error(`Error updating widget: ${error.message}`);
			throw Error(`Error updating widget`);
		}
	}

	// Methods for Theme Management

	// Set the default theme
	async setDefaultTheme(themeName: string): Promise<void> {
		try {
			// First, unset the current default theme
			await ThemeModel.updateMany({}, { $set: { isDefault: false } });
			// Then, set the new default theme
			const result = await ThemeModel.updateOne({ name: themeName }, { $set: { isDefault: true } });

			if (result.modifiedCount === 0) {
				throw Error(`Theme with name ${themeName} not found.`);
			}

			logger.info(`Theme ${themeName} set as default successfully.`);
		} catch (error) {
			logger.error(`Error setting default theme: ${error.message}`);
			throw Error(`Error setting default theme`);
		}
	}

	// Fetch the default theme
	async getDefaultTheme(): Promise<Theme | null> {
		try {
			logger.debug('Attempting to fetch the default theme from the database...');
			let theme = await ThemeModel.findOne({ isDefault: true }).lean<Theme>().exec();

			if (theme) {
				logger.info(`Default theme found: ${theme.name}`);
				return theme;
			}

			const count = await ThemeModel.countDocuments();
			if (count === 0) {
				logger.warn('Theme collection is empty. Inserting default theme.');
				await this.storeThemes([DEFAULT_THEME]);
				theme = await ThemeModel.findOne({ isDefault: true }).lean<Theme>().exec();
			}

			if (!theme) {
				logger.warn('No default theme found in database. Using DEFAULT_THEME constant.');
				return DEFAULT_THEME as Theme;
			}

			return theme;
		} catch (error) {
			logger.error(`Error fetching default theme: ${error.message}`);
			throw Error(`Error fetching default theme`);
		}
	}

	// Store themes in the database
	async storeThemes(themes: Theme[]): Promise<void> {
		try {
			// If there's a default theme in the new themes, unset the current default
			if (themes.some((theme) => theme.isDefault)) {
				await ThemeModel.updateMany({}, { $set: { isDefault: false } });
			}

			await ThemeModel.insertMany(
				themes.map((theme) => ({
					_id: this.convertId(theme._id),
					name: theme.name,
					path: theme.path,
					isDefault: theme.isDefault ?? false,
					createdAt: theme.createdAt ?? new Date(),
					updatedAt: theme.updatedAt ?? new Date()
				})),
				{ ordered: false }
			); // Use ordered: false to ignore duplicates
			logger.info(`Stored \x1b[34m${themes.length}\x1b[0m themes in the database.`);
		} catch (error) {
			logger.error(`Error storing themes: ${error.message}`);
			throw Error(`Error storing themes`);
		}
	}

	// Fetch all themes
	async getAllThemes(): Promise<Theme[]> {
		try {
			const themes = await ThemeModel.find().exec();
			logger.info(`Fetched \x1b[34m${themes.length}\x1b[0m themes.`);
			return themes;
		} catch (error) {
			logger.error(`Error fetching all themes: ${error.message}`);
			throw Error(`Error fetching all themes`);
		}
	}

	// Methods for System Preferences Management

	// Set user preferences
	async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
		logger.debug(`Setting user preferences for userId: \x1b[34m${user_id}\x1b[0m`);

		try {
			await SystemPreferencesModel.updateOne({ userId }, { $set: { preferences } }, { upsert: true }).exec();
			logger.info(`User preferences set successfully for userId: \x1b[34m${user_id}\x1b[0m`);
		} catch (error) {
			logger.error(`Failed to set user preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to set user preferences`);
		}
	}

	//Retrieve system preferences for a user
	async getSystemPreferences(user_id: string): Promise<UserPreferences | null> {
		try {
			const preferencesDoc = await SystemPreferencesModel.findOne({ userId: user_id }).exec();
			if (preferencesDoc) {
				logger.info(`Retrieved system preferences for userId: \x1b[34m${user_id}\x1b[0m `);
				return preferencesDoc.preferences as UserPreferences;
			}
			logger.info(`No system preferences found for userId: \x1b[34m${user_id}\x1b[0m`);
			return null;
		} catch (error) {
			logger.error(`Failed to retrieve system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to retrieve system preferences`);
		}
	}

	// Update system preferences for a user
	async updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> {
		try {
			await SystemPreferencesModel.findOneAndUpdate({ userId: user_id }, { $set: { screenSize, preferences } }, { new: true, upsert: true }).exec();
			logger.info(`System preferences updated for userId: \x1b[34m${user_id}\x1b[0m`);
		} catch (error) {
			logger.error(`Failed to update system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to update system preferences`);
		}
	}

	// Clear system preferences for a user
	async clearSystemPreferences(user_id: string): Promise<void> {
		try {
			const result = await SystemPreferencesModel.deleteOne({ userId: user_id }).exec();
			if (result.deletedCount === 0) {
				logger.warn(`No system preferences found to delete for userId: \x1b[34m${user_id}\x1b[0m`);
			} else {
				logger.info(`System preferences cleared for userId: \x1b[34m${user_id}\x1b[0m`);
			}
		} catch (error) {
			logger.error(`Failed to clear system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to clear system preferences`);
		}
	}

	// Methods for Virtual Folder Management

	// Create a virtual folder in the database
	async createVirtualFolder(folderData: { name: string; parent?: string; path: string }): Promise<Document> {
		try {
			const folder = new SystemVirtualFolderModel({
				_id: this.generateId(),
				name: folderData.name,
				parent: folderData.parent ? this.convertId(folderData.parent) : null,
				path: folderData.path
			});
			await folder.save();
			logger.info(`Virtual folder '\x1b[34m${folderData.name}\x1b[0m' created successfully.`);
			return folder;
		} catch (error) {
			logger.error(`Error creating virtual folder: ${error.message}`);
			throw Error(`Error creating virtual folder`);
		}
	}

	// Get all virtual folders
	async getVirtualFolders(): Promise<Document[]> {
		try {
			const folders = await SystemVirtualFolderModel.find({}).exec();
			logger.info(`Fetched \x1b[34m${folders.length}\x1b[0m virtual folders.`);
			return folders;
		} catch (error) {
			logger.error(`Error fetching virtual folders: ${error.message}`);
			throw Error(`Error fetching virtual folders`);
		}
	}

	// Get contents of a virtual folder
	async getVirtualFolderContents(folderId: string): Promise<Document[]> {
		try {
			const objectId = this.convertId(folderId);
			const folder = await SystemVirtualFolderModel.findById(objectId);
			if (!folder) throw Error('Folder not found');

			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
			const results = await Promise.all(mediaPromises);
			logger.info(`Fetched contents for virtual folder ID: \x1b[34m${folderId}\x1b[0m`);
			return results.flat();
		} catch (error) {
			logger.error(`Error fetching contents for virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to fetch virtual folder contents`);
		}
	}

	// Update a virtual folder
	async updateVirtualFolder(folderId: string, updateData: VirtualFolderUpdateData): Promise<Document | null> {
		try {
			const updatePayload: VirtualFolderUpdateData & { updatedAt: Date } = {
				...updateData,
				updatedAt: new Date()
			};

			if (updateData.parent) {
				updatePayload.parent = this.convertId(updateData.parent).toString();
			}

			const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updatePayload, { new: true }).exec();

			if (!updatedFolder) {
				throw Error(`Virtual folder with ID \x1b[34m${folderId}\x1b[0m not found.`);
			}

			logger.info(`Virtual folder \x1b[34m${folderId}\x1b[0m updated successfully.`);
			return updatedFolder;
		} catch (error) {
			logger.error(`Error updating virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to update virtual folder`);
		}
	}

	// Delete a virtual folder
	async deleteVirtualFolder(folderId: string): Promise<boolean> {
		try {
			const result = await SystemVirtualFolderModel.findByIdAndDelete(this.convertId(folderId)).exec();
			if (!result) {
				logger.warn(`Virtual folder with ID \x1b[34m${folderId}\x1b[0m not found.`);
				return false;
			}

			logger.info(`Virtual folder \x1b[34m${folderId}\x1b[0m deleted successfully.`);
			return true;
		} catch (error) {
			logger.error(`Error deleting virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to delete virtual folder`);
		}
	}

	// Move media to a virtual folder
	async moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean> {
		try {
			const objectId = this.convertId(folderId);
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			for (const type of mediaTypes) {
				const result = await mongoose.model(type).findByIdAndUpdate(this.convertId(mediaId), { folderId: objectId }).exec();
				if (result) {
					logger.info(`Media \x1b[34m${mediaId}\x1b[0m moved to folder \x1b[34m${folderId}\x1b[0m successfully.`);
					return true;
				}
			}
			logger.warn(`Media \x1b[34m${mediaId}\x1b[0m not found in any media type collections.`);
			return false;
		} catch (error) {
			logger.error(`Error moving media \x1b[34m${mediaId}\x1b[0m to folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to move media to folder`);
		}
	}

	// Methods for Media Management

	// Fetch all media
	async getAllMedia(): Promise<MediaType[]> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const mediaPromises = mediaTypes.map((type) => this.findMany<Document & MediaBase>(type, {}));
			const results = await Promise.all(mediaPromises);
			const allMedia = results.flat().map((item) => ({
				...item,
				_id: item._id?.toString(), // Safe access using optional chaining
				type: item.type || 'unknown' // Handle the type property
			}));
			logger.info(`Fetched all media, total count: \x1b[34m${allMedia.length}\x1b[0m`);
			return allMedia as MediaType[];
		} catch (error) {
			logger.error(`Error fetching all media: ${error.message}`);
			throw Error(`Error fetching all media`);
		}
	}

	// Delete media
	async deleteMedia(mediaId: string): Promise<boolean> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			for (const type of mediaTypes) {
				const result = await this.deleteOne(type, { _id: this.convertId(mediaId) });
				if (result > 0) {
					logger.info(`Media \x1b[34m${mediaId}\x1b[0m deleted successfully from ${type}.`);
					return true;
				}
			}
			logger.warn(`Media \x1b[34m${mediaId}\x1b[0m not found in any media type collections.`);
			return false;
		} catch (error) {
			logger.error(`Error deleting media \x1b[34m${mediaId}\x1b[0m: ${error.message}`);
			throw Error(`Error deleting media`);
		}
	}

	// Fetch media in a specific folder
	async getMediaInFolder(folder_id: string): Promise<MediaType[]> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			const objectId = this.convertId(folder_id);
			const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
			const results = await Promise.all(mediaPromises);
			const mediaInFolder = results.flat();
			logger.info(`Fetched \x1b[34m${mediaInFolder.length}\x1b[0m media items in folder ID: \x1b[34m${folder_id}\x1b[0m`);
			return mediaInFolder;
		} catch (error) {
			logger.error(`Error fetching media in folder \x1b[34m${folder_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to fetch media in folder`);
		}
	}

	// Fetch the last five collections
	async getLastFiveCollections(): Promise<Document[]> {
		try {
			const collectionTypes = Object.keys(mongoose.models);
			const recentCollections: Document[] = [];

			for (const collectionType of collectionTypes) {
				const model = mongoose.models[collectionType];
				if (model) {
					const collections = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
					recentCollections.push(...collections);
				}
			}

			return recentCollections.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 5);
		} catch (error) {
			logger.error(`Failed to fetch last five collections: ${error.message}`);
			throw Error(`Failed to fetch last five collections`);
		}
	}

	// Fetch logged-in users
	async getLoggedInUsers(): Promise<Document[]> {
		try {
			const sessionModel = mongoose.models['auth_sessions'];
			if (!sessionModel) {
				throw Error('auth_sessions collection does not exist.');
			}
			const activeSessions = await sessionModel.find({ active: true }).lean().exec();
			logger.info(`Fetched \x1b[34m${activeSessions.length}\x1b[0m active sessions.`);
			return activeSessions;
		} catch (error) {
			logger.error(`Error fetching logged-in users: ${error.message}`);
			throw Error(`Failed to fetch logged-in users`);
		}
	}

	// Fetch CMS data
	async getCMSData(): Promise<{
		collections: number;
		media: number;
		users: number;
		drafts: number;
	}> {
		// Implement your CMS data fetching logic here
		// This is a placeholder and should be replaced with actual implementation
		logger.debug('Fetching CMS data...');
		return {};
	}

	// Fetch the last five media documents
	async getLastFiveMedia(): Promise<MediaType[]> {
		try {
			const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const recentMedia: MediaType[] = [];

			for (const schemaName of mediaSchemas) {
				const model = mongoose.models[schemaName];
				if (model) {
					const media = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
					recentMedia.push(...(media as MediaType[]));
				}
			}

			return recentMedia.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 5);
		} catch (error) {
			logger.error(`Failed to fetch last five media documents: ${error.message}`);
			throw Error(`Failed to fetch last five media documents`);
		}
	}

	// Methods for Disconnecting

	// Disconnect from MongoDB
	async disconnect(): Promise<void> {
		try {
			await mongoose.disconnect();
			logger.info('MongoDB adapter connection closed.');
		} catch (error) {
			logger.error(`Error disconnecting from MongoDB: ${error.message}`);
			throw Error(`Error disconnecting from MongoDB`);
		}
	}
}
