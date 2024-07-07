import { privateEnv } from '@root/config/private';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Database
import mongoose from 'mongoose';
import type { dbAdapter } from './dbAdapter';

// Auth
import { UserSchema, SessionSchema, TokenSchema } from '@src/auth/mongoDBAuthAdapter';

// System Logs
import logger from '@utils/logger';

// Define the media schema (assuming it's defined similarly to other schemas)
const mediaSchema = new mongoose.Schema(
	{
		url: String,
		altText: String,
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now }
	},
	{ timestamps: true }
);

// Define the Draft schema
const DraftSchema = new mongoose.Schema({
	originalDocumentId: mongoose.Schema.Types.ObjectId,
	content: mongoose.Schema.Types.Mixed,
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
	status: { type: String, enum: ['draft', 'published'], default: 'draft' },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Define the Revision schema
const RevisionSchema = new mongoose.Schema({
	documentId: mongoose.Schema.Types.ObjectId,
	content: mongoose.Schema.Types.Mixed,
	createdAt: { type: Date, default: Date.now },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Create models for Draft and Revision
const Draft = mongoose.model('Draft', DraftSchema);
const Revision = mongoose.model('Revision', RevisionSchema);

export class MongoDBAdapter implements dbAdapter {
	private unsubscribe: Unsubscriber | undefined;

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
		return new Promise<any>((resolve) => {
			this.unsubscribe = collections.subscribe((collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};

					logger.debug('Collections found:', { collections });

					Object.values(collections).forEach((collection) => {
						if (!collection.name) {
							logger.warn('Collection without a name encountered:', { collection });
							return;
						}

						logger.debug(`Setting up collection model for ${collection.name}`);

						const schemaObject = new mongoose.Schema(
							{
								createdAt: Date,
								updatedAt: Date,
								createdBy: String,
								revisionsEnabled: Boolean,
								__v: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Revision' }],
								translationStatus: {}
							},
							{
								typeKey: '$type',
								strict: false,
								timestamps: true
							}
						);

						if (mongoose.models[collection.name]) {
							logger.debug(`Collection model for ${collection.name} already exists.`);
						} else {
							logger.debug(`Creating new collection model for ${collection.name}.`);
						}

						collectionsModels[collection.name] = mongoose.models[collection.name] || mongoose.model(collection.name, schemaObject);
						logger.info(`Collection model for ${collection.name} set up successfully.`);
					});

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					logger.info('MongoDB adapter collection models setup complete.');
					resolve(collectionsModels);
				} else {
					logger.warn('No collections found to set up models.');
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
			}
		});
	}

	// Implementing findOne method
	async findOne(collection: string, query: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`findOne failed. Collection ${collection} does not exist.`);
			throw new Error(`findOne failed. Collection ${collection} does not exist.`);
		}
		return model.findOne(query).exec();
	}

	// Implementing insertMany method
	async insertMany(collection: string, docs: object[]): Promise<any[]> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`insertMany failed. Collection ${collection} does not exist.`);
			throw new Error(`insertMany failed. Collection ${collection} does not exist.`);
		}
		const result = await model.insertMany(docs);
		return result;
	}

	// Implementing updateOne method
	async updateOne(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateOne failed. Collection ${collection} does not exist.`);
			throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
		}
		const result = await model.updateOne(query, update).exec();
		return result;
	}

	// Implementing updateMany method
	async updateMany(collection: string, query: object, update: object): Promise<any> {
		const model = mongoose.models[collection];
		if (!model) {
			logger.error(`updateMany failed. Collection ${collection} does not exist.`);
			throw new Error(`updateMany failed. Collection ${collection} does not exist.`);
		}
		const result = await model.updateMany(query, update).exec();
		return result;
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
		draft.updatedAt = new Date(); // Assign a Date object instead of a timestamp
		await draft.save();
		return draft;
	}

	// Get drafts
	async publishDraft(draftId: string) {
		const draft = await Draft.findById(draftId);
		if (!draft) throw new Error('Draft not found');
		draft.status = 'published';
		await draft.save();

		// Optionally, save a revision
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
		return await Draft.find({ createdBy: userId });
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
		return await Revision.find({ documentId }).sort({ createdAt: -1 });
	}

	// Get recent last 5 collections
	async getLastFiveCollections(): Promise<any[]> {
		const collections = Object.keys(mongoose.models);
		const recentCollections: any[] = [];

		for (const collectionName of collections) {
			const model = mongoose.models[collectionName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).exec();
			recentCollections.push({ collectionName, recentDocs });
		}

		return recentCollections;
	}

	// Get logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = mongoose.models['auth_sessions'];
		const loggedInUsers = await sessionModel.find({ active: true }).exec();
		return loggedInUsers;
	}

	// Get CMS data
	async getCMSData(): Promise<any> {
		const cmsData = {}; // Replace with actual logic
		return cmsData;
	}

	// Get recent last 5 media documents
	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = mongoose.models[schemaName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).exec();
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
