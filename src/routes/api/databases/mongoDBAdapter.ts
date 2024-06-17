import { privateEnv } from '@root/config/private';
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';
import mongoose from 'mongoose';
import type { DatabaseAdapter } from './databaseAdapter';
import { UserMongooseSchema, SessionMongooseSchema, TokenMongooseSchema } from '@src/auth/mongoDBAuthAdapter';

export class MongoDBAdapter implements DatabaseAdapter {
	private unsubscribe: Unsubscriber | undefined;

	async connect(attempts: number = privateEnv.DB_RETRY_ATTEMPTS || 3): Promise<void> {
		console.log('Attempting to connect to MongoDB...');
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
				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				console.error(`Failed to connect to the database. Attempts left: ${attempts}. Error: ${(error as Error).message}`);
				if (attempts <= 0) {
					const errorMsg = 'Failed to connect to the database after maximum retries.';
					console.error(errorMsg);
					throw new Error(errorMsg);
				}
				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	async getCollectionModels(): Promise<any> {
		console.log('Setting up collection models...');
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
						console.log(`Collection model for ${collection.name} set up.`);
					});

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					console.log('Collection models setup complete.');
					resolve(collectionsModels);
				}
			});
		});
	}

	setupAuthModels(): void {
		console.log('Setting up authentication models...');
		if (!mongoose.models['auth_tokens']) {
			mongoose.model('auth_tokens', TokenMongooseSchema);
			console.log('auth_tokens model set up.');
		} else {
			console.log('auth_tokens model already exists.');
		}
		if (!mongoose.models['auth_users']) {
			mongoose.model('auth_users', UserMongooseSchema);
			console.log('auth_users model set up.');
		} else {
			console.log('auth_users model already exists.');
		}
		if (!mongoose.models['auth_sessions']) {
			mongoose.model('auth_sessions', SessionMongooseSchema);
			console.log('auth_sessions model set up.');
		} else {
			console.log('auth_sessions model already exists.');
		}
		console.log('Authentication models setup complete.');
	}

	setupMediaModels(): void {
		console.log('Setting up media models...');
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		mediaSchemas.forEach((schemaName) => {
			if (!mongoose.models[schemaName]) {
				mongoose.model(schemaName, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
				console.log(`${schemaName} model set up.`);
			}
		});
		console.log('Media models setup complete.');
	}

	async getLastFiveCollections(): Promise<any[]> {
		console.log('Fetching the last 5 added collections...');
		const collections = Object.keys(mongoose.models);
		const recentCollections: any[] = [];

		for (const collectionName of collections) {
			const model = mongoose.models[collectionName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).exec();
			recentCollections.push({ collectionName, recentDocs });
			console.log(`Fetched recent documents for ${collectionName}`);
		}

		console.log('Last 5 collections fetched.');
		return recentCollections;
	}

	async getLoggedInUsers(): Promise<any[]> {
		console.log('Fetching logged in users...');
		const sessionModel = mongoose.models['auth_sessions'];
		const loggedInUsers = await sessionModel.find({ active: true }).exec();
		console.log('Logged in users fetched.');
		return loggedInUsers;
	}

	async getCMSData(): Promise<any> {
		console.log('Fetching CMS data...');
		const cmsData = {}; // Replace with actual logic
		console.log('CMS data fetched.');
		return cmsData;
	}

	async getLastFiveMedia(): Promise<any[]> {
		console.log('Fetching the last 5 added media items...');
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const recentMedia: any[] = [];

		for (const schemaName of mediaSchemas) {
			const model = mongoose.models[schemaName];
			const recentDocs = await model.find().sort({ createdAt: -1 }).limit(5).exec();
			recentMedia.push({ schemaName, recentDocs });
			console.log(`Fetched recent media documents for ${schemaName}`);
		}

		console.log('Last 5 media items fetched.');
		return recentMedia;
	}
}
