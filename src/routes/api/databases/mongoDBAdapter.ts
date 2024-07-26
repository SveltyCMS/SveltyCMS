import { privateEnv } from '@root/config/private';
// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';
// Database
import mongoose from 'mongoose';
import type { dbInterface } from './dbInterface';
// Auth
import { UserSchema, SessionSchema, TokenSchema } from '@src/auth/mongoDBAuthAdapter';

// System Logs
import { logger } from '@src/utils/logger';

// Define the media schema (assuming it's defined similarly to other schemas)
const mediaSchema = new mongoose.Schema(
	{
		url: String, // The URL of the media
		altText: String, // The alt text for the media
		createdAt: { type: Date, default: Date.now }, // The date the media was created
		updatedAt: { type: Date, default: Date.now } // The date the media was last updated
	},
	{ timestamps: true, collection: 'media' } // Explicitly set the collection name
);

// Define the Draft schema
const DraftSchema = new mongoose.Schema(
	{
		originalDocumentId: mongoose.Schema.Types.ObjectId, // The ID of the original document
		content: mongoose.Schema.Types.Mixed, // The content of the draft
		createdAt: { type: Date, default: Date.now }, // The date the draft was created
		updatedAt: { type: Date, default: Date.now }, // The date the draft was last updated
		status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // The status of the draft
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'auth_users' } // The user who created the draft
	},
	{ collection: 'collection_drafts' } // Explicitly set the collection name
);

// Create Draft model
const Draft = mongoose.models.Draft || mongoose.model('Draft', DraftSchema);

// Define the Revision schema
const RevisionSchema = new mongoose.Schema(
	{
		documentId: mongoose.Schema.Types.ObjectId, // The ID of the document
		content: mongoose.Schema.Types.Mixed, // The content of the revision
		createdAt: { type: Date, default: Date.now }, // The date the revision was created
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'auth_users' } // The user who created the revision
	},
	{ collection: 'collection_revisions' } // Explicitly set the collection name
);

// Create Revision model
const Revision = mongoose.models.Revision || mongoose.model('Revision', RevisionSchema);

// Define the Widget schema
const widgetSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true }, // Name of the widget
		isActive: { type: Boolean, default: true }, // Whether the widget is active or not
		createdAt: { type: Date, default: Date.now }, // When the widget was created
		updatedAt: { type: Date, default: Date.now } // When the widget was last updated
	},
	{ timestamps: true, collection: 'system_widgets' } // Explicitly set the collection name
);

// Create Widget model
const Widget = mongoose.models.Widget || mongoose.model('Widget', widgetSchema);

// Define the Theme schema
const ThemeSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true }, // Name of the theme
		path: { type: String, required: true }, // Path to the theme file
		createdAt: { type: Date, default: Date.now }, // Creation timestamp
		updatedAt: { type: Date, default: Date.now } // Last updated timestamp
	},
	{ collection: 'system_themes' } // Explicitly set the collection name
);

// Create Theme model
const Theme = mongoose.models.Theme || mongoose.model('Theme', ThemeSchema);

export class MongoDBAdapter implements dbInterface {
	private unsubscribe: Unsubscriber | undefined;
	private collectionsInitialized = false;

	// Connect to MongoDB
	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		logger.debug('Attempting to connect to MongoDB...');
		const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv');
		// Construct the connection string
		const connectionString = isAtlas
			? privateEnv.DB_HOST // Use DB_HOST as full connection string for Atlas
			: `${privateEnv.DB_HOST}:${privateEnv.DB_PORT}`; // Local/Docker connection
		while (attempts > 0) {
			try {
				await mongoose.connect(connectionString, {
					authSource: isAtlas ? undefined : 'admin', // Only use authSource for local connection
					user: privateEnv.DB_USER,
					pass: privateEnv.DB_PASSWORD,
					dbName: privateEnv.DB_NAME,
					maxPoolSize: privateEnv.DB_POOL_SIZE || 5
				});
				// Inform about successful connection
				logger.debug(`MongoDB adapter connected successfully to ${privateEnv.DB_NAME}`);
				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				const err = error as Error;
				logger.error(`MongoDB adapter failed to connect. Attempts left: ${attempts}. Error: ${err.message}`);

				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					logger.error(errorMsg);
					throw new Error(`MongoDB adapter failed to connect after maximum retries. Error: ${err.message}`);
				}

				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	// Generate an ID using ObjectId
	generateId(): string {
		return new mongoose.Types.ObjectId().toString();
	}

	// Get collection models
	async getCollectionModels(): Promise<any> {
		logger.debug('getCollectionModels called');

		if (this.collectionsInitialized) {
			logger.debug('Collections already initialized, skipping reinitialization.');
			return mongoose.models;
		}

		return new Promise<any>((resolve, reject) => {
			this.unsubscribe = collections.subscribe(async (collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};
					// Map to collection names only
					const collectionNames = Object.values(collections).map((collection) => collection.name);
					logger.debug('Collections found:', { collectionNames });

					for (const collection of Object.values(collections)) {
						if (!collection.name) {
							logger.warn('Collection without a name encountered:', { collection });
							continue;
						}

						logger.debug(`Setting up collection model for ${collection.name}`);

						const schemaObject = new mongoose.Schema(
							{
								createdAt: Date,
								updatedAt: Date,
								createdBy: String,
								revisionsEnabled: Boolean,
								translationStatus: {}
							},
							{
								typeKey: '$type',
								strict: true, // Enable strict mode
								timestamps: true,
								collection: collection.name.toLowerCase() // Explicitly set the collection name to avoid duplicates
							}
						);

						if (mongoose.models[collection.name]) {
							logger.debug(`Collection model for ${collection.name} already exists.`);
						} else {
							logger.debug(`Creating new collection model for ${collection.name}.`);
							collectionsModels[collection.name] = mongoose.model(collection.name, schemaObject);

							await mongoose.connection.createCollection(collection.name.toLowerCase());
							logger.info(`Collection ${collection.name} created.`);
						}

						logger.info(`Collection model for ${collection.name} set up successfully.`);
					}

					this.unsubscribe && this.unsubscribe();
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
			if (!mongoose.models['auth_tokens']) {
				mongoose.model('auth_tokens', TokenSchema);
				logger.debug('Auth tokens model created.');
			} else {
				logger.debug('Auth tokens model already exists.');
			}

			if (!mongoose.models['auth_users']) {
				mongoose.model('auth_users', UserSchema);
				logger.debug('Auth users model created.');
			} else {
				logger.debug('Auth users model already exists.');
			}

			if (!mongoose.models['auth_sessions']) {
				mongoose.model('auth_sessions', SessionSchema);
				logger.debug('Auth sessions model created.');
			} else {
				logger.debug('Auth sessions model already exists.');
			}
			logger.info('Authentication models set up successfully.');
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to set up authentication models: ${err.message}`);
			throw new Error(`Failed to set up authentication models: ${err.message}`);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		mediaSchemas.forEach((schemaName) => {
			if (!mongoose.models[schemaName]) {
				mongoose.model(schemaName, mediaSchema);
				logger.debug(`Media model for ${schemaName} created.`);
			}
		});
		logger.info('Media models set up successfully.');
	}

	// Set up widget models
	setupWidgetModels(): void {
		if (!mongoose.models['system_widgets']) {
			mongoose.model('system_widgets', widgetSchema);
			logger.debug('Widget model for system_widgets created.');
		} else {
			logger.debug('Widget model already exists.');
		}
		logger.info('Widget models set up successfully.');
	}

	async getAllWidgets(): Promise<any[]> {
		try {
			return await Widget.find().lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching all widgets: ${err.message}`);
			throw new Error(`Error fetching all widgets: ${err.message}`);
		}
	}

	// Store themes in the database
	async storeThemes(themes: { name: string; path: string }[]): Promise<void> {
		try {
			await Theme.insertMany(
				themes.map((theme) => ({
					name: theme.name,
					path: theme.path,
					createdAt: new Date(),
					updatedAt: new Date()
				})),
				{ ordered: false } // Use ordered: false to ignore duplicates
			);
			logger.info(`Stored ${themes.length} themes in the database.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error storing themes: ${err.message}`);
			throw new Error(`Error storing themes: ${err.message}`);
		}
	}

	// Install a new widget
	async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
		try {
			const widget = new Widget({
				...widgetData,
				isActive: widgetData.isActive ?? false,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await widget.save();
			logger.info(`Widget ${widgetData.name} installed successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error installing widget: ${err.message}`);
			throw new Error(`Error installing widget: ${err.message}`);
		}
	}

	// Fetch all widgets
	async getWidgets(): Promise<any[]> {
		try {
			return await Widget.find().lean().exec();
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching widgets: ${err.message}`);
			throw new Error(`Error fetching widgets: ${err.message}`);
		}
	}

	// Fetch active widgets
	async getActiveWidgets(): Promise<string[]> {
		try {
			const widgets = await Widget.find({ isActive: true }).lean().exec();
			return widgets.map((widget) => widget.name);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error fetching active widgets: ${err.message}`);
			throw new Error(`Error fetching active widgets: ${err.message}`);
		}
	}

	// Activate a widget
	async activateWidget(widgetName: string): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already active.`);
			}

			logger.info(`Widget ${widgetName} activated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error activating widget: ${err.message}`);
			throw new Error(`Error activating widget: ${err.message}`);
		}
	}

	// Deactivate a widget
	async deactivateWidget(widgetName: string): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or already inactive.`);
			}

			logger.info(`Widget ${widgetName} deactivated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error deactivating widget: ${err.message}`);
			throw new Error(`Error deactivating widget: ${err.message}`);
		}
	}

	// Update a widget
	async updateWidget(widgetName: string, updateData: any): Promise<void> {
		try {
			const result = await Widget.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: new Date() } }).exec();

			if (result.modifiedCount === 0) {
				throw new Error(`Widget with name ${widgetName} not found or no changes applied.`);
			}

			logger.info(`Widget ${widgetName} updated successfully.`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Error updating widget: ${err.message}`);
			throw new Error(`Error updating widget: ${err.message}`);
		}
	}

	// Implementing findOne method
	async findOne(collection: string, query: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`findOne failed. Collection ${collection} does not exist.`);
			throw new Error(`findOne failed. Collection ${collection} does not exist.`);
		}
		return model.findOne(query).lean().exec();
	}

	// Implementing findMany method
	async findMany(collection: string, query: object): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`findMany failed. Collection ${collection} does not exist.`);
			throw new Error(`findMany failed. Collection ${collection} does not exist.`);
		}
		return model.find(query).lean().exec();
	}

	// Implementing insertMany method
	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`insertMany failed. Collection ${collection} does not exist.`);
			throw new Error(`insertMany failed. Collection ${collection} does not exist.`);
		}
		return model.insertMany(docs);
	}

	// Implementing updateOne method
	async updateOne(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateOne failed. Collection ${collection} does not exist.`);
			throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
		}
		return model.updateOne(query, update).exec();
	}

	// Implementing updateMany method
	async updateMany(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateMany failed. Collection ${collection} does not exist.`);
			throw new Error(`updateMany failed. Collection ${collection} does not exist.`);
		}
		return model.updateMany(query, update).exec();
	}

	// Implementing deleteOne method
	async deleteOne(collection: string, query: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			throw new Error(`Collection ${collection} not found`);
		}
		return model.deleteOne(query).then((result) => result.deletedCount);
	}

	// Implementing deleteMany method
	async deleteMany(collection: string, query: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			throw new Error(`Collection ${collection} not found`);
		}
		return model.deleteMany(query).then((result) => result.deletedCount);
	}

	// Implementing countDocuments method
	async countDocuments(collection: string, query?: object): Promise<number> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`countDocuments failed. Collection ${collection} does not exist.`);
			throw new Error(`countDocuments failed. Collection ${collection} does not exist.`);
		}
		return model.countDocuments(query).exec();
	}

	// Create a new draft
	async createDraft(content: any, originalDocumentId: string, userId: string) {
		const draft = new Draft({
			originalDocumentId,
			content,
			createdBy: userId
		});
		await draft.save();
		return draft;
	}

	// Update a draft
	async updateDraft(draftId: string, content: any) {
		const draft = await Draft.findById(draftId);
		if (!draft) throw new Error('Draft not found');
		draft.content = content;
		draft.updatedAt = new Date();
		await draft.save();
		return draft;
	}

	// Get drafts
	async publishDraft(draftId: string) {
		const draft = await Draft.findById(draftId);
		if (!draft) throw new Error('Draft not found');
		draft.status = 'published';
		await draft.save();

		const revision = new Revision({
			documentId: draft.originalDocumentId,
			content: draft.content,
			createdBy: draft.createdBy
		});
		await revision.save();
		return draft;
	}

	// Get drafts
	async getDraftsByUser(userId: string) {
		return await Draft.find({ createdBy: userId }).lean().exec();
	}

	// Create a new revision
	async createRevision(documentId: string, content: any, userId: string) {
		const revision = new Revision({
			documentId,
			content,
			createdBy: userId
		});
		await revision.save();
		return revision;
	}

	// Get revisions
	async getRevisions(documentId: string) {
		return await Revision.find({ documentId }).sort({ createdAt: -1 }).lean().exec();
	}

	// Get recent last 5 collections
	async getLastFiveCollections(): Promise<any[]> {
		const collections = Object.keys(mongoose.models);
		const recentCollections: any[] = [];

		for (const collectionName of collections) {
			const model = mongoose.models[collectionName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
			recentCollections.push({ collectionName, recentDocs });
		}

		return recentCollections;
	}

	// Get logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = mongoose.models['auth_sessions'];
		return await sessionModel.find({ active: true }).lean().exec();
	}

	// Get CMS data
	async getCMSData(): Promise<any> {
		// Implement your CMS data fetching logic here
		// This is a placeholder and should be replaced with actual implementation
		return {};
	}

	// Get recent last 5 media documents
	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = mongoose.models[schemaName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
			recentMedia.push({ schemaName, recentDocs });
			logger.debug(`Fetched recent media documents for ${schemaName}`);
		}
		return recentMedia;
	}

	// Disconnect
	async disconnect(): Promise<void> {
		await mongoose.disconnect();
		logger.debug('MongoDB adapter connection closed.');
	}
}
