import { privateEnv } from '@root/config/private';
import mongoose from 'mongoose';
import { collections } from '@stores/store';
import { UserMongooseSchema, SessionMongooseSchema, TokenMongooseSchema } from '@src/auth/mongoDBAuthAdapter';
import type { DatabaseAdapter } from './databaseAdapter';
import type { Unsubscriber } from 'svelte/store';

export class MongoDBAdapter implements DatabaseAdapter {
	private unsubscribe: Unsubscriber | undefined;

	// Connect to MongoDB database using imported environment variables with retry logic
	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		while (attempts > 0) {
			try {
				await mongoose.connect(privateEnv.DB_HOST, {
					authSource: 'admin',
					user: privateEnv.DB_USER,
					pass: privateEnv.DB_PASSWORD,
					dbName: privateEnv.DB_NAME,
					maxPoolSize: privateEnv.DB_POOL_SIZE || 5
				});
				console.log(`Successfully connected to ${privateEnv.DB_NAME}`);
				this.setupAuthModels(); // Ensure models are set up after connection is successful
				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				console.error(`Failed to connect to the database. Attempts left: ${attempts}. Error: ${(error as Error).message}`);
				if (attempts <= 0) {
					throw new Error(`Failed to connect to the database after maximum retries. Error: ${(error as Error).message}`);
				}
				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	// Set up authentication collections if they don't already exist
	setupAuthModels(): void {
		if (!mongoose.models.auth_tokens) {
			mongoose.model('auth_tokens', TokenMongooseSchema);
		}
		if (!mongoose.models.auth_users) {
			mongoose.model('auth_users', UserMongooseSchema);
		}
		if (!mongoose.models.auth_sessions) {
			mongoose.model('auth_sessions', SessionMongooseSchema);
		}
	}

	// Set up collections in the database using imported schemas
	async getCollectionModels(): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			this.unsubscribe = collections.subscribe((collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};

					try {
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
						});

						this.unsubscribe && this.unsubscribe();
						this.unsubscribe = undefined;
						resolve(collectionsModels);
					} catch (error) {
						this.unsubscribe && this.unsubscribe();
						this.unsubscribe = undefined;
						reject(`Failed to set up collection models: ${(error as Error).message}`);
					}
				} else {
					reject('No collections found to set up models.');
				}
			});
		});
	}

	// Set up Media collections if they don't already exist
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		mediaSchemas.forEach((schemaName) => {
			if (!mongoose.models[schemaName]) {
				mongoose.model(schemaName, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
			}
		});
	}

	// Fetch the last 5 added collections
	async getLastFiveCollections(): Promise<any[]> {
		const collections = Object.keys(mongoose.models);
		const recentCollections = await Promise.all(
			collections.map(async (collectionName) => {
				const model = mongoose.models[collectionName];
				const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
				return { collectionName, recentDocs };
			})
		);
		return recentCollections;
	}

	// Fetch logged in users
	async getLoggedInUsers(): Promise<any[]> {
		const sessionModel = mongoose.models.auth_sessions;
		const loggedInUsers = await sessionModel.find({ active: true }).lean().exec();
		return loggedInUsers;
	}

	// Fetch the last 5 added media items
	async getLastFiveMedia(): Promise<any[]> {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia = await Promise.all(
			mediaSchemas.map(async (schemaName) => {
				const model = mongoose.models[schemaName];
				const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
				return { schemaName, recentDocs };
			})
		);
		return recentMedia;
	}
}
