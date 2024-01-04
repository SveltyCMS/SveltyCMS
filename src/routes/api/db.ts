import { collections } from '@stores/store';

import { dev } from '$app/environment';
import type { Unsubscriber } from 'svelte/store';

// Lucia v2
import { lucia } from 'lucia';
import { mongoose } from '@lucia-auth/adapter-mongoose';

import { session, key, UserSchema, TokenSchema } from '@collections/Auth';
import { sveltekit } from 'lucia/middleware';
import { google } from '@lucia-auth/oauth/providers';
// mongoose
import mongodb from 'mongoose';
import {
	DB_HOST,
	DB_NAME,
	DB_USER,
	DB_PASSWORD,
	HOST_PROD,
	HOST_DEV,
	SECRET_GOOGLE_CLIENT_ID,
	SECRET_GOOGLE_CLIENT_SECERT
} from '$env/static/private';
// import { Session } from 'inspector';

// Turn off strict mode for query filters. Default in Mongodb 7
mongodb.set('strictQuery', false);

// Connect to MongoDB database using imported environment variables
mongodb
	.connect(DB_HOST, {
		authSource: 'admin',
		user: DB_USER,
		pass: DB_PASSWORD,
		dbName: DB_NAME
	})
	.then(() => console.log('---------------------Connection to database is successful! -----------------------'))
	.catch((error) => console.error('Error connecting to database:', error));

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
let googleAuth;

if (SECRET_GOOGLE_CLIENT_ID && SECRET_GOOGLE_CLIENT_SECERT) {
	googleAuth = google(auth, {
		clientId: SECRET_GOOGLE_CLIENT_ID,
		clientSecret: SECRET_GOOGLE_CLIENT_SECERT,
		redirectUri: `${dev ? HOST_DEV : HOST_PROD}/oauth`,
		scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'],
		accessType: dev ? 'offline' : 'online'
	});
} else {
	console.warn('Google client ID and secret not provided. Google OAuth will not be available.');
}

// Export collections and auth objects
export type Auth = typeof auth;
export { collectionsModels, auth, googleAuth };
