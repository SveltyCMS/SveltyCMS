import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import { dev } from '$app/environment';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Auth
import { Auth } from '@src/auth';
import { mongooseSessionSchema, mongooseTokenSchema, mongooseUserSchema } from '@src/auth/types';

// OAuth
import { google } from 'googleapis';

// mongoose
import mongoose from 'mongoose';

// Turn off strict mode for query filters. Default in Mongodb 7
mongoose.set('strictQuery', false);

console.log('\n\x1b[33m\x1b[5m====> Trying to Connect to your defined ' + privateEnv.DB_NAME + ' database ...\x1b[0m');

// Connect to MongoDB database using imported environment variables
(async () => {
	console.log('\n\x1B[33m\x1B[5m====> Trying to Connect to your defined ' + privateEnv.DB_NAME + ' database ...\x1B[0m');
	try {
		await mongoose.connect(privateEnv.DB_HOST, {
			authSource: 'admin',
			user: privateEnv.DB_USER,
			pass: privateEnv.DB_PASSWORD,
			dbName: privateEnv.DB_NAME,
			compressors: privateEnv.DB_COMPRESSOR
		});

		console.log(
			`\x1b[32m====> Connection to ${privateEnv.DB_NAME} database successful!\x1b[0m\n====> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`
		);
	} catch (error) {
		console.error('\x1b[31mError connecting to database:\x1b[0m', error);
		throw new Error('Error connecting to database');
	}
})();

// Initialize collections object
const collectionsModels: { [Key: string]: mongoose.Model<any> } = {};

let unsubscribe: Unsubscriber | undefined;

// Set up collections in the database using imported schemas
export async function getCollectionModels() {
	// Return a new Promise that resolves with the collectionsModels object
	return new Promise<any>((resolve) => {
		// Subscribe to the collections store
		unsubscribe = collections.subscribe((collections) => {
			// If collections are defined
			if (collections) {
				// Iterate over each collection
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
					const schema_object = new mongoose.Schema(
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
					collectionsModels[collection.name] = mongoose.models[collection.name] || mongoose.model(collection.name, schema_object);
				});

				// Unsubscribe from the collections store and resolve the Promise with the collectionsModels object
				unsubscribe && unsubscribe();
				unsubscribe = undefined;
				resolve(collectionsModels);
			}
		});
	});
}

// Set up authentication collections if they don't already exist
!mongoose.models['auth_tokens'] && mongoose.model('auth_tokens', mongooseTokenSchema);
!mongoose.models['auth_users'] && mongoose.model('auth_users', mongooseUserSchema);
!mongoose.models['auth_sessions'] && mongoose.model('auth_sessions', mongooseSessionSchema);

// Set up Media collections if they don't already exist
const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];

mediaSchemas.forEach((schemaName) => {
	if (!mongoose.models[schemaName]) {
		mongoose.model(schemaName, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
	}
});

// Set up authentication and export auth object
const auth = new Auth({
	User: mongoose.models['auth_users'],
	Session: mongoose.models['auth_sessions'],
	Token: mongoose.models['auth_tokens']
});

// Google OAuth2 - optional authentication
let googleAuth: any = null;

if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
	const oauth2Client = new google.auth.OAuth2(
		privateEnv.GOOGLE_CLIENT_ID,
		privateEnv.GOOGLE_CLIENT_SECRET,
		`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
	);

	googleAuth = oauth2Client;
} else {
	console.warn('Google client ID and secret not provided. Google OAuth will not be available.');
}

// Export collections and auth objects
export { collectionsModels, auth, googleAuth };
