import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Stores
import { collections } from '@stores/store';
import type { Unsubscriber } from 'svelte/store';

// Lucia v2
import { lucia } from 'lucia';
import { mongoose } from '@lucia-auth/adapter-mongoose';

import { session, key, UserSchema, TokenSchema } from '@collections/Auth';
import { sveltekit } from 'lucia/middleware';
import { google } from '@lucia-auth/oauth/providers';

// mongoose
import mongodb from 'mongoose';

// import { Session } from 'inspector';

// Turn off strict mode for query filters. Default in Mongodb 7
mongodb.set('strictQuery', false);

console.log('\n\x1b[33m\x1b[5m====> Trying to Connect to your defined ' + privateEnv.DB_NAME + ' database ...\x1b[0m');

// Connect to MongoDB database using imported environment variables
try {
	await mongodb.connect(privateEnv.DB_HOST, {
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

// Initialize collections object
const collectionsModels: { [Key: string]: mongodb.Model<any> } = {};

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
				for (const collection of collections) {
					// Create a detailed revisions schema
					const RevisionSchema = new mongodb.Schema(
						{
							revisionNumber: { type: Number, default: 0 },
							editedAt: { type: Date, default: Date.now },
							editedBy: { type: String, default: 'System' },
							changes: { type: Object, default: {} }
						},
						{ _id: false }
					);

					// Create a new mongoose schema using the collection's fields and timestamps
					const schema_object = new mongodb.Schema(
						{
							createdAt: Number,
							updatedAt: Number,
							createdBy: String,
							__v: [RevisionSchema] // versionKey
						},
						{
							typeKey: '$type',
							strict: false,
							timestamps: { currentTime: () => Date.now() }
						}
					);

					// Add the revision field to the schema

					// Add the mongoose model for the collection to the collectionsModels object
					if (!collection.name) return;
					collectionsModels[collection.name] = mongodb.models[collection.name]
						? mongodb.model(collection.name)
						: mongodb.model(collection.name, schema_object);
				}

				// Unsubscribe from the collections store and resolve the Promise with the collectionsModels object
				unsubscribe && unsubscribe();
				unsubscribe = undefined;
				resolve(collectionsModels);
			}
		});
	});
}

// Set up authentication collections if they don't already exist
!mongodb.models['auth_session'] && mongodb.model('auth_session', new mongodb.Schema({ ...session }, { _id: false }));
!mongodb.models['auth_key'] && mongodb.model('auth_key', new mongodb.Schema({ ...key }, { _id: false }));
!mongodb.models['auth_user'] && mongodb.model('auth_user', new mongodb.Schema({ ...UserSchema }, { _id: false, timestamps: true }));
!mongodb.models['auth_tokens'] && mongodb.model('auth_tokens', new mongodb.Schema({ ...TokenSchema }, { _id: false, timestamps: true }));

// Set up authentication using Lucia and export auth object
const auth = lucia({
	adapter: mongoose({
		User: mongodb.models['auth_user'],
		Key: mongodb.models['auth_key'],
		Session: mongodb.models['auth_session']
	}),

	//for production & cloned dev environment
	env: dev ? 'DEV' : 'PROD',
	middleware: sveltekit(),

	sessionCookie: {
		expires: false
	},

	// sessions will expire within 120 minutes (max) since inactivity
	sessionExpiresIn: {
		activePeriod: 1000 * 60 * 120, // 60 minutes
		idlePeriod: 1000 * 60 * 120 // 60 minutes
	},

	getUserAttributes: (userData) => {
		return {
			// `userId` included by default!!
			...userData
		};
	}

	// csrfProtection: {
	// 	allowedSubdomains: ["foo"] // allow https://foo.example.com
	// }
});

// Google OAuth2 - optional authentication
let googleAuth: any;

if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
	googleAuth = google(auth, {
		clientId: privateEnv.GOOGLE_CLIENT_ID,
		clientSecret: privateEnv.GOOGLE_CLIENT_SECRET,
		redirectUri: `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/oauth`,
		scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'],
		accessType: dev ? 'offline' : 'online'
	});
} else {
	console.warn('Google client ID and secret not provided. Google OAuth will not be available.');
}

// Export collections and auth objects
export type Auth = typeof auth;
export { collectionsModels, auth, googleAuth };
