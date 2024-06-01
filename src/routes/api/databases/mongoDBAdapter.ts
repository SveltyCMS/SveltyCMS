import { privateEnv } from '@root/config/private';

// Store
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Mongoose
import mongoose from 'mongoose';
import type { DatabaseAdapter } from './databaseAdapter';
import { mongooseSessionSchema, mongooseTokenSchema, mongooseUserSchema } from '@src/auth/types';

export class MongoDBAdapter implements DatabaseAdapter {
	private unsubscribe: Unsubscriber | undefined;

	// Connect to MongoDB database using imported environment variables with retry
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
				return; // Connection successful, exit loop
			} catch (error) {
				attempts--;
				if (attempts <= 0) {
					throw new Error('Failed to connect to the database after maximum retries.');
				}
				// Wait before retrying only if more attempts remain
				await new Promise((resolve) => setTimeout(resolve, privateEnv.DB_RETRY_DELAY || 3000));
			}
		}
	}

	// Set up collections in the database using imported schemas
	async getCollectionModels(): Promise<any> {
		return new Promise<any>((resolve) => {
			this.unsubscribe = collections.subscribe((collections) => {
				if (collections) {
					const collectionsModels: { [key: string]: mongoose.Model<any> } = {};

					collections.forEach((collection) => {
						if (!collection.name) return;

						// Create a detailed revisions schema
						const RevisionSchema = new mongoose.Schema(
							{
								revisionNumber: { type: Number, default: 0 },
								editedAt: { type: Date, default: Date.now },
								editedBy: { type: String, default: 'System' },
								changes: { type: Object, default: {} }
							},
							{ _id: false }
						);

						// Create a new mongoose schema using the collection's fields and timestamps
						const schemaObject = new mongoose.Schema(
							{
								createdAt: Date,
								updatedAt: Date,
								createdBy: String,
								__v: [RevisionSchema], // versionKey
								translationStatus: {}
							},
							{
								typeKey: '$type',
								strict: false,
								timestamps: true // Use the default Mongoose timestamp
							}
						);

						// Add the mongoose model for the collection to the collectionsModels object
						collectionsModels[collection.name] = mongoose.models[collection.name] || mongoose.model(collection.name, schemaObject);
					});

					this.unsubscribe && this.unsubscribe();
					this.unsubscribe = undefined;
					resolve(collectionsModels);
				}
			});
		});
	}

	// Set up authentication collections if they don't already exist
	setupAuthModels(): void {
		if (!mongoose.models['auth_tokens']) {
			mongoose.model('auth_tokens', mongooseTokenSchema);
		}
		if (!mongoose.models['auth_users']) {
			mongoose.model('auth_users', mongooseUserSchema);
		}
		if (!mongoose.models['auth_sessions']) {
			mongoose.model('auth_sessions', mongooseSessionSchema);
		}
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
}
