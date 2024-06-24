import { privateEnv } from '@root/config/private';
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';
import mongoose from 'mongoose';
import type { DatabaseAdapter } from './databaseAdapter';
import { UserSchema, SessionSchema, TokenSchema } from '@src/auth/mongoDBAuthAdapter';

// System Logs
import logger from '@utils/logger';

export class MongoDBAdapter implements DatabaseAdapter {
	private unsubscribe: Unsubscriber | undefined;

	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		// logger.info('Attempting to connect to MongoDB...');
		while (attempts > 0) {
			try {
				await mongoose.connect(privateEnv.DB_HOST, {
					authSource: 'admin',
					user: privateEnv.DB_USER,
					pass: privateEnv.DB_PASSWORD,
					dbName: privateEnv.DB_NAME,
					maxPoolSize: privateEnv.DB_POOL_SIZE || 5
				});
				// logger.info(`Successfully connected to ${privateEnv.DB_NAME}`);
				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				logger.error(`Failed to connect to the database. Attempts left: ${attempts}. Error: ${(error as Error).message}`);

				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					logger.error(errorMsg);

					throw new Error(errorMsg);
				}
				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	async getCollectionModels(): Promise<any> {
		// console.log('Setting up collection models...');
		return new Promise<any>((resolve) => {
			this.unsubscribe = collections.subscribe((collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};

					Object.values(collections).forEach((collection) => {
						if (!collection.name) return;

						const RevisionSchema = new mongoose.Schema(
							{
								revisionNumber: { type: Number, default: 0 },
								editedAt: { type: Date, default: Date.now },
								editedBy: { type: String, default: 'System' },
								changes: { type: Object, default: {} }
							},
							{ _id: false }
						);

						const schemaObject = new mongoose.Schema(
							{
								createdAt: Date,
								updatedAt: Date,
								createdBy: String,
								__v: [RevisionSchema],
								translationStatus: {}
							},
							{
								typeKey: '$type',
								strict: false,
								timestamps: true
							}
						);

						collectionsModels[collection.name] = mongoose.models[collection.name] || mongoose.model(collection.name, schemaObject);
						// console.log(`Collection model for ${collection.name} set up.`);
					});

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					console.log('Collection models setup complete.');
					resolve(collectionsModels);
				}
			});
		});
	}

	// Set up authentication models
	setupAuthModels(): void {
		if (!mongoose.models['auth_tokens']) {
			mongoose.model('auth_tokens', TokenSchema);
		}
		if (!mongoose.models['auth_users']) {
			mongoose.model('auth_users', UserSchema);
		}
		if (!mongoose.models['auth_sessions']) {
			mongoose.model('auth_sessions', SessionSchema);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		mediaSchemas.forEach((schemaName) => {
			if (!mongoose.models[schemaName]) {
				mongoose.model(schemaName, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
			}
		});
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
			console.log(`Fetched recent media documents for ${schemaName}`);
		}
		return recentMedia;
	}
}
