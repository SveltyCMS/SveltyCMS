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

// Stores
import { collections } from '@stores/collectionStore';
import type { Unsubscriber } from 'svelte/store';
import type { ScreenSize } from '@stores/screenSizeStore';
import type { UserPreferences, WidgetPreference } from '@src/stores/userPreferences';

// Database
import mongoose, { Schema, Model, Document, type FilterQuery, type UpdateQuery } from 'mongoose';
import type { dbInterface, Draft, Revision, Theme, Widget, SystemVirtualFolder } from '../dbInterface';

import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';

// System Logs
import { logger } from '@src/utils/logger';

// Media
import type { MediaBase, MediaType } from '@src/utils/media/mediaModels';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// Define the media schema for different media types
const mediaSchema = new Schema(
	{
		hash: { type: String, required: true }, // The hash of the media
		url: { type: String, required: true }, // The URL of the media
		altText: { type: String, required: true }, // The alt text for the media
		createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // The date the media was created
		updatedAt: { type: Number, default: () => Math.floor(Date.now() / 1000) } // The date the media was last updated
	},
	{ timestamps: false, collection: 'media' } // Explicitly set the collection name
);

// Define the Draft model if it doesn't exist already
const DraftModel =
	mongoose.models.Draft ||
	mongoose.model<Draft>(
		'Draft',
		new Schema(
			{
				originalDocumentId: { type: Schema.Types.Mixed, required: true }, // Or Schema.Types.String
				collectionId: { type: Schema.Types.Mixed, required: true }, // The ID of the collection
				content: { type: Schema.Types.Mixed, required: true }, // The content of the draft
				createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Creation timestamp
				updatedAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Last update timestamp
				status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // Status of the draft
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true } // The user who created the draft
			},
			{ timestamps: false, collection: 'collection_drafts' }
		)
	);

// Define the Revision model if it doesn't exist already
const RevisionModel =
	mongoose.models.Revision ||
	mongoose.model<Revision>(
		'Revision',
		new Schema(
			{
				collectionId: { type: Schema.Types.Mixed, required: true, ref: 'collections' }, // ID of the collection
				documentId: { type: Schema.Types.Mixed, required: true }, // ID of the document
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true }, // ID of the user who created the revision
				content: { type: Schema.Types.Mixed, required: true }, // Content of the revision
				createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Creation timestamp
				version: { type: Number, required: true } // Version number of the revision
			},
			{ timestamps: false, collection: 'collection_revisions' }
		)
	);

// Create the Theme model if it doesn't exist already
const ThemeModel =
	mongoose.models.Theme ||
	mongoose.model<Theme>(
		'Theme',
		new Schema(
			{
				name: { type: String, required: true, unique: true }, // Name of the theme
				path: { type: String, required: true }, // Path to the theme file
				isDefault: { type: Boolean, default: false }, // Whether the theme is the default theme
				createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Creation timestamp
				updatedAt: { type: Number, default: () => Math.floor(Date.now() / 1000) } // Last updated timestamp
			},
			{ timestamps: false, collection: 'system_themes' }
		)
	);

// Create the Widget model if it doesn't exist already
const WidgetModel =
	mongoose.models.Widget ||
	mongoose.model<Widget>(
		'Widget',
		new Schema(
			{
				name: { type: String, required: true, unique: true }, // Name of the widget
				isActive: { type: Boolean, default: true }, // Whether the widget is active
				createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Creation timestamp
				updatedAt: { type: Number, default: () => Math.floor(Date.now() / 1000) } // Last update timestamp
			},
			{ timestamps: false, collection: 'system_widgets' }
		)
	);

// Define the System Preferences schema for user layout and screen size
const SystemPreferencesModel =
	mongoose.models.SystemPreferences ||
	mongoose.model<SystemPreferences>(
		'SystemPreferences',
		new Schema(
			{
				userId: { type: String, required: true, unique: true }, // User identifier
				screenSize: { type: String, enum: ['mobile', 'tablet', 'desktop'], required: true }, // Screen size context
				preferences: {
					type: [
						{
							id: { type: String, required: true }, // Component ID
							component: { type: String, required: true }, // Component type or name
							label: { type: String, required: true }, // Label for the component
							x: { type: Number, required: true }, // X position on the screen
							y: { type: Number, required: true }, // Y position on the screen
							w: { type: Number, required: true }, // Width of the component
							h: { type: Number, required: true }, // Height of the component
							min: { w: { type: Number }, h: { type: Number } }, // Minimum size constraints
							max: { w: { type: Number }, h: { type: Number } }, // Maximum size constraints
							movable: { type: Boolean, default: true }, // Whether the component can be moved
							resizable: { type: Boolean, default: true }, // Whether the component can be resized
							screenSize: { type: String, enum: ['mobile', 'tablet', 'desktop'], required: true } // Screen size context
						}
					],
					default: []
				}
			},
			{ timestamps: false, collection: 'system_preferences' } // Explicitly set the collection name
		)
	);

// Define the SystemVirtualFolder model only if it doesn't already exist
const SystemVirtualFolderModel =
	mongoose.models.SystemVirtualFolder ||
	mongoose.model<SystemVirtualFolder>(
		'SystemVirtualFolder',
		new Schema(
			{
				name: { type: String, required: true },
				parent: { type: String, ref: 'SystemVirtualFolder', default: null }, // Allow null for root folders
				path: { type: String, required: true }
			},
			{ collection: 'system_virtualfolders' } // Explicitly set the collection name to system_virtualfolders
		)
	);

export class MongoDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private collectionsInitialized = false;

	// Connect to MongoDB
	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		logger.debug('Attempting to connect to MongoDB...');
		const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv');

		// Construct the connection string
		const connectionString = isAtlas
			? privateEnv.DB_HOST // Use full connection string for Atlas
			: `${privateEnv.DB_HOST}:${privateEnv.DB_PORT}`; // Local/Docker connection

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

		try {
			await mongoose.connect(connectionString, options);
			logger.info(`Successfully connected to MongoDB database: ${privateEnv.DB_NAME}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to connect to MongoDB after ${attempts} attempts: ${err.message}`);
			throw Error(`MongoDB connection failed: ${err.message}`);
		}
	}

	// Generate an ID using ObjectId
	generateId(): string {
		return new mongoose.Types.ObjectId().toString();
	}

	// Convert a string ID to a MongoDB ObjectId
	convertId(id: string): mongoose.Types.ObjectId {
		return new mongoose.Types.ObjectId(id);
	}

	// Get collection models
	async getCollectionModels(): Promise<Record<string, Model<any>>> {
		logger.debug('getCollectionModels called');

		if (this.collectionsInitialized) {
			logger.debug('Collections already initialized, skipping reinitialization.');
			return mongoose.models as Record<string, Model<any>>;
		}

		return new Promise<Record<string, Model<any>>>((resolve, reject) => {
			this.unsubscribe = collections.subscribe(async (collectionsData) => {
				if (collectionsData) {
					const collectionsModels: { [key: string]: Model<any> } = {};
					// Map to collection names only
					const collectionNames = Object.values(collectionsData).map((collection) => collection.name);
					logger.debug('Collections found:', { collectionNames });

					for (const collection of Object.values(collectionsData)) {
						if (!collection.name) {
							logger.warn('Collection without a name encountered:', { collection });
							continue;
						}

						logger.debug(`Setting up collection model for ${collection.name}`);

						const schemaObject = new mongoose.Schema(
							{
								createdAt: { type: Number }, // Unix timestamp in seconds
								updatedAt: { type: Number }, // Unix timestamp in seconds
								createdBy: { type: String }, // ID of the user who created the document
								revisionsEnabled: { type: Boolean }, // Flag indicating if revisions are enabled
								translationStatus: { type: Schema.Types.Mixed, default: {} } // Translation status, mixed type allows any structure
							},
							{
								typeKey: '$type',
								strict: true, // Enable strict mode
								timestamps: false,
								collection: collection.name.toLowerCase() // Explicitly set the collection name to avoid duplicates
							}
						);

						if (mongoose.models[collection.name]) {
							logger.debug(`Collection model for ${collection.name} already exists.`);
							collectionsModels[collection.name] = mongoose.models[collection.name];
						} else {
							logger.debug(`Creating new collection model for ${collection.name}.`);
							collectionsModels[collection.name] = mongoose.model(collection.name, schemaObject);
							logger.info(`Collection ${collection.name} created.`);
						}

						logger.info(`Collection model for ${collection.name} set up successfully.`);
					}

					if (this.unsubscribe) {
						this.unsubscribe();
					}
					this.unsubscribe = undefined;
					this.collectionsInitialized = true;
					logger.info('MongoDB adapter collection models setup complete.');
					resolve(collectionsModels);
				} else {
					logger.warn('No collections found to set up models.');
					reject(new Error('No collections found to set up models.'));
				}
			});
		});
	}

	// Set up authentication models
	setupAuthModels(): void {
		try {
			this.setupModel('auth_tokens', TokenSchema);
			this.setupModel('auth_users', UserSchema);
			this.setupModel('auth_sessions', SessionSchema);
			logger.info('Authentication models set up successfully.');
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to set up authentication models: ${err.message}`, { error: err });
			throw Error(`Failed to set up authentication models: ${err.message}`);
		}
	}

	// Helper method to set up models if they don't already exist
	private setupModel(name: string, schema: Schema) {
		if (!mongoose.models[name]) {
			mongoose.model(name, schema);
			logger.debug(`${name} model created.`);
		} else {
			logger.debug(`${name} model already exists.`);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
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
		} catch (error) {
			const err = error as Error;
			logger.error(`Error in findOne for collection ${collection}: ${err.message}`, { error: err });
			throw err;
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
			const err = error as Error;
			logger.error(`Error inserting document into ${collection}: ${err.message}`);
			throw Error(`Error inserting document into ${collection}: ${err.message}`);
		}
	}

	// Implementing insertMany method
	async insertMany(collection: string, docs: Partial<Document>[]): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`insertMany failed. Collection ${collection} does not exist.`);
			throw Error(`insertMany failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.insertMany(docs);
			return result;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error inserting many documents into ${collection}: ${err.message}`);
			throw Error(`Error inserting many documents into ${collection}: ${err.message}`);
		}
	}

	// Implementing updateOne method
	async updateOne<T extends Document>(collection: string, query: FilterQuery<T>, update: UpdateQuery<T>): Promise<any> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`updateOne failed. Collection ${collection} does not exist.`);
			throw Error(`updateOne failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.updateOne(query, update).exec();
			return result;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating document in ${collection}: ${err.message}`);
			throw Error(`Error updating document in ${collection}: ${err.message}`);
		}
	}

	// Implementing updateMany method
	async updateMany<T extends Document>(collection: string, query: FilterQuery<T>, update: UpdateQuery<T>): Promise<any> {
		const model = mongoose.models[collection] as Model<T>;
		if (!model) {
			logger.error(`updateMany failed. Collection ${collection} does not exist.`);
			throw Error(`updateMany failed. Collection ${collection} does not exist.`);
		}
		try {
			const result = await model.updateMany(query, update).exec();
			return result;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating many documents in ${collection}: ${err.message}`);
			throw Error(`Error updating many documents in ${collection}: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error deleting document from ${collection}: ${err.message}`);
			throw Error(`Error deleting document from ${collection}: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error deleting many documents from ${collection}: ${err.message}`);
			throw Error(`Error deleting many documents from ${collection}: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error counting documents in ${collection}: ${err.message}`);
			throw Error(`Error counting documents in ${collection}: ${err.message}`);
		}
	}

	// Methods for Draft and Revision Management

	// Create a new draft
	async createDraft(content: any, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> {
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
			const err = error as Error;
			logger.error(`Error creating draft: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Update a draft
	async updateDraft(draft_id: string, content: any): Promise<Draft> {
		try {
			const draft = await DraftModel.findById(draft_id);
			if (!draft) throw Error('Draft not found');

			// Update the draft content and timestamp
			draft.content = content;
			draft.updatedAt = Math.floor(Date.now() / 1000);
			await draft.save();

			logger.info(`Draft ${draft_id} updated successfully.`);

			// Return the updated draft as a plain JavaScript object and cast it to Draft
			return draft.toObject() as Draft;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating draft: ${err.message}`, { error: err });
			throw err;
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
			const err = error as Error;
			logger.error(`Error publishing draft: ${err.message}`, { error: err });
			throw err;
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
			const err = error as Error;
			logger.error(`Error retrieving drafts for user ${user_id}: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Create a new revision
	async createRevision(collectionId: string, documentId: string, userId: string, data: any): Promise<Revision> {
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
			const err = error as Error;
			logger.error(`Error creating revision: ${err.message}`, { error: err });
			throw Error(`Error creating revision: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error retrieving revisions for document ID ${documentId} in collection ID ${collectionId}: ${err.message}`);
			throw Error(`Failed to retrieve revisions: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error deleting revision ${revisionId}: ${err.message}`, { error: err });
			throw Error(`Failed to delete revision: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error restoring revision ${revisionId}: ${err.message}`, { error: err });
			throw Error(`Failed to restore revision: ${err.message}`);
		}
	}

	// Methods for Widget Management

	// Install a new widget
	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		try {
			const widget = new WidgetModel({
				...widgetData,
				isActive: widgetData.isActive ?? false,
				createdAt: Math.floor(Date.now() / 1000),
				updatedAt: Math.floor(Date.now() / 1000)
			});
			await widget.save();
			logger.info(`Widget ${widgetData.name} installed successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error installing widget: ${err.message}`);
			throw Error(`Error installing widget: ${err.message}`);
		}
	}

	// Fetch all widgets
	async getAllWidgets(): Promise<Widget[]> {
		try {
			const widgets = await WidgetModel.find().exec();
			logger.info(`Fetched ${widgets.length} widgets.`);
			return widgets;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all widgets: ${err.message}`);
			throw Error(`Error fetching all widgets: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error fetching active widgets: ${err.message}`);
			throw Error(`Error fetching active widgets: ${err.message}`);
		}
	}

	// Activate a widget
	async activateWidget(widgetName: string): Promise<void> {
		try {
			const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: Math.floor(Date.now() / 1000) } }).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or already active.`);
			}
			logger.info(`Widget ${widgetName} activated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error activating widget: ${err.message}`);
			throw Error(`Error activating widget: ${err.message}`);
		}
	}

	// Deactivate a widget
	async deactivateWidget(widgetName: string): Promise<void> {
		try {
			const result = await WidgetModel.updateOne(
				{ name: widgetName },
				{ $set: { isActive: false, updatedAt: Math.floor(Date.now() / 1000) } }
			).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or already inactive.`);
			}
			logger.info(`Widget ${widgetName} deactivated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deactivating widget: ${err.message}`);
			throw Error(`Error deactivating widget: ${err.message}`);
		}
	}

	// Update a widget
	async updateWidget(widgetName: string, updateData: any): Promise<void> {
		try {
			const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: Math.floor(Date.now() / 1000) } }).exec();
			if (result.modifiedCount === 0) {
				throw Error(`Widget with name ${widgetName} not found or no changes applied.`);
			}
			logger.info(`Widget ${widgetName} updated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating widget: ${err.message}`);
			throw Error(`Error updating widget: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error setting default theme: ${err.message}`);
			throw Error(`Error setting default theme: ${err.message}`);
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
			const err = error as Error;
			logger.error(`Error fetching default theme: ${err.message}`);
			throw Error(`Error fetching default theme: ${err.message}`);
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
					createdAt: theme.createdAt ?? Math.floor(Date.now() / 1000),
					updatedAt: theme.updatedAt ?? Math.floor(Date.now() / 1000)
				})),
				{ ordered: false }
			); // Use ordered: false to ignore duplicates
			logger.info(`Stored ${themes.length} themes in the database.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error storing themes: ${err.message}`);
			throw Error(`Error storing themes: ${err.message}`);
		}
	}

	// Fetch all themes
	async getAllThemes(): Promise<Theme[]> {
		try {
			const themes = await ThemeModel.find().exec();
			logger.info(`Fetched ${themes.length} themes.`);
			return themes;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all themes: ${err.message}`);
			throw Error(`Error fetching all themes: ${err.message}`);
		}
	}

	// Methods for System Preferences Management

	// Set user preferences
	async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
		logger.debug(`Setting user preferences for userId: ${userId}`);

		try {
			await SystemPreferencesModel.updateOne({ userId }, { $set: { preferences, screenSize: preferences.screenSize } }, { upsert: true }).exec();
			logger.info(`User preferences set successfully for userId: ${userId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to set user preferences for user ${userId}. Error: ${err.message}`);
			throw Error(`Failed to set user preferences: ${err.message}`);
		}
	}

	//Retrieve system preferences for a user
	async getSystemPreferences(user_id: string): Promise<UserPreferences | null> {
		try {
			const preferencesDoc = await SystemPreferencesModel.findOne({ userId: user_id }).exec();
			if (preferencesDoc) {
				logger.info(`Retrieved system preferences for userId: ${user_id}`);
				return preferencesDoc.preferences as UserPreferences;
			}
			logger.info(`No system preferences found for userId: ${user_id}`);
			return null;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to retrieve system preferences for user ${user_id}. Error: ${err.message}`);
			throw Error(`Failed to retrieve system preferences: ${err.message}`);
		}
	}

	// Update system preferences for a user
	async updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> {
		try {
			await SystemPreferencesModel.findOneAndUpdate({ userId: user_id }, { $set: { screenSize, preferences } }, { new: true, upsert: true }).exec();
			logger.info(`System preferences updated for userId: ${user_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update system preferences for user ${user_id}. Error: ${err.message}`);
			throw Error(`Failed to update system preferences: ${err.message}`);
		}
	}

	// Clear system preferences for a user
	async clearSystemPreferences(user_id: string): Promise<void> {
		try {
			const result = await SystemPreferencesModel.deleteOne({ userId: user_id }).exec();
			if (result.deletedCount === 0) {
				logger.warn(`No system preferences found to delete for userId: ${user_id}`);
			} else {
				logger.info(`System preferences cleared for userId: ${user_id}`);
			}
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to clear system preferences for user ${user_id}. Error: ${err.message}`);
			throw Error(`Failed to clear system preferences: ${err.message}`);
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
			logger.info(`Virtual folder '${folderData.name}' created successfully.`);
			return folder;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error creating virtual folder: ${err.message}`, { error: err });
			throw err;
		}
	}

	// Get all virtual folders
	async getVirtualFolders(): Promise<Document[]> {
		try {
			const folders = await SystemVirtualFolderModel.find().exec();
			logger.info(`Fetched ${folders.length} virtual folders.`);
			return folders;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching virtual folders: ${err.message}`);
			throw Error(`Error fetching virtual folders: ${err.message}`);
		}
	}

	// Get contents of a virtual folder
	async getVirtualFolderContents(folderId: string): Promise<any[]> {
		try {
			const objectId = this.convertId(folderId);
			const folder = await SystemVirtualFolderModel.findById(objectId);
			if (!folder) throw Error('Folder not found');

			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
			const results = await Promise.all(mediaPromises);
			logger.info(`Fetched contents for virtual folder ID: ${folderId}`);
			return results.flat();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching contents for virtual folder ${folderId}: ${err.message}`);
			throw Error(`Failed to fetch virtual folder contents: ${err.message}`);
		}
	}

	// Update a virtual folder
	async updateVirtualFolder(folderId: string, updateData: { name?: string; parent?: string }): Promise<Document | null> {
		try {
			const updatePayload: any = { ...updateData };
			if (updateData.parent) {
				updatePayload.parent = this.convertId(updateData.parent);
			}

			const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updatePayload, { new: true }).exec();
			if (!updatedFolder) {
				throw Error(`Virtual folder with ID ${folderId} not found.`);
			}

			logger.info(`Virtual folder ${folderId} updated successfully.`);
			return updatedFolder;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating virtual folder ${folderId}: ${err.message}`);
			throw Error(`Failed to update virtual folder: ${err.message}`);
		}
	}

	// Delete a virtual folder
	async deleteVirtualFolder(folderId: string): Promise<boolean> {
		try {
			const result = await SystemVirtualFolderModel.findByIdAndDelete(folderId).exec();
			if (!result) {
				logger.warn(`Virtual folder with ID ${folderId} not found.`);
				return false;
			}

			logger.info(`Virtual folder ${folderId} deleted successfully.`);
			return true;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deleting virtual folder ${folderId}: ${err.message}`);
			throw Error(`Failed to delete virtual folder: ${err.message}`);
		}
	}

	// Move media to a virtual folder
	async moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean> {
		try {
			const objectId = this.convertId(folderId);
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			for (const type of mediaTypes) {
				const result = await mongoose.model(type).findByIdAndUpdate(mediaId, { folderId: objectId }).exec();
				if (result) {
					logger.info(`Media ${mediaId} moved to folder ${folderId} successfully.`);
					return true;
				}
			}
			logger.warn(`Media ${mediaId} not found in any media type collections.`);
			return false;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error moving media ${mediaId} to folder ${folderId}: ${err.message}`);
			throw Error(`Failed to move media to folder: ${err.message}`);
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
			logger.info(`Fetched all media, total count: ${allMedia.length}`);
			return allMedia as MediaType[];
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all media: ${err.message}`);
			throw Error(`Error fetching all media: ${err.message}`);
		}
	}

	// Delete media
	async deleteMedia(mediaId: string): Promise<boolean> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			for (const type of mediaTypes) {
				const result = await this.deleteOne(type, { _id: this.convertId(mediaId) });
				if (result > 0) {
					logger.info(`Media ${mediaId} deleted successfully from ${type}.`);
					return true;
				}
			}
			logger.warn(`Media ${mediaId} not found in any media type collections.`);
			return false;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deleting media ${mediaId}: ${err.message}`);
			throw Error(`Error deleting media: ${err.message}`);
		}
	}

	// Fetch media in a specific folder
	async getMediaInFolder(folder_id: string): Promise<any[]> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			const objectId = this.convertId(folder_id);
			const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
			const results = await Promise.all(mediaPromises);
			const mediaInFolder = results.flat();
			logger.info(`Fetched ${mediaInFolder.length} media items in folder ID: ${folder_id}`);
			return mediaInFolder;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching media in folder ${folder_id}: ${err.message}`);
			throw Error(`Failed to fetch media in folder: ${err.message}`);
		}
	}

	// Fetch the last five collections
	async getLastFiveCollections(): Promise<any[]> {
		try {
			const collectionNames = Object.keys(mongoose.models);
			const recentCollections: any[] = [];

			for (const collectionName of collectionNames) {
				const model = mongoose.models[collectionName];
				const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
				recentCollections.push({ collectionName, recentDocs });
			}

			logger.info(`Fetched last five documents from ${recentCollections.length} collections.`);
			return recentCollections;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching last five collections: ${err.message}`);
			throw Error(`Failed to fetch last five collections: ${err.message}`);
		}
	}

	// Fetch logged-in users
	async getLoggedInUsers(): Promise<any[]> {
		try {
			const sessionModel = mongoose.models['auth_sessions'];
			if (!sessionModel) {
				throw Error('auth_sessions collection does not exist.');
			}
			const activeSessions = await sessionModel.find({ active: true }).lean().exec();
			logger.info(`Fetched ${activeSessions.length} active sessions.`);
			return activeSessions;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching logged-in users: ${err.message}`);
			throw Error(`Failed to fetch logged-in users: ${err.message}`);
		}
	}

	// Fetch CMS data
	async getCMSData(): Promise<any> {
		// Implement your CMS data fetching logic here
		// This is a placeholder and should be replaced with actual implementation
		logger.debug('Fetching CMS data...');
		return {};
	}

	// Fetch the last five media documents
	async getLastFiveMedia(): Promise<any[]> {
		try {
			const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const recentMedia: any[] = [];

			for (const schemaName of mediaSchemas) {
				const model = mongoose.models[schemaName];
				if (model) {
					const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
					recentMedia.push(...recentDocs);
					logger.debug(`Fetched ${recentDocs.length} recent media documents for ${schemaName}`);
				} else {
					logger.warn(`Media schema ${schemaName} does not exist.`);
				}
			}
			logger.info(`Fetched last five media documents across schemas.`);
			return recentMedia;
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching last five media documents: ${err.message}`);
			throw Error(`Failed to fetch last five media documents: ${err.message}`);
		}
	}

	// Methods for Disconnecting

	// Disconnect from MongoDB
	async disconnect(): Promise<void> {
		try {
			await mongoose.disconnect();
			logger.info('MongoDB adapter connection closed.');
		} catch (error) {
			const err = error as Error;
			logger.error(`Error disconnecting from MongoDB: ${err.message}`, { error: err });
			throw err;
		}
	}
}
