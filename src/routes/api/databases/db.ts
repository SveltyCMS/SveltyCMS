import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import { dev } from '$app/environment';

// Adapters
import { MongoDBAdapter } from './mongoDBAdapter';
import { MariaDBAdapter } from './mariaDBAdapter';
import type { DatabaseAdapter } from './databaseAdapter';

// Auth
import { Auth } from '@src/auth';
import mongoose from 'mongoose';

// OAuth
import { google } from 'googleapis';

// Initialize the appropriate database adapter based on the environment variable
let dbAdapter: DatabaseAdapter;

if (privateEnv.DB_TYPE === 'mongodb') {
	dbAdapter = new MongoDBAdapter();
} else if (privateEnv.DB_TYPE === 'mariadb') {
	dbAdapter = new MariaDBAdapter();
} else {
	throw new Error('Unsupported DB_TYPE specified in environment variables');
}

// Connect to the selected database
(async () => {
	console.log(`\n\x1b[33m\x1b[5m====> Trying to Connect to your defined ${privateEnv.DB_NAME} database ...\x1b[0m`);
	try {
		await dbAdapter.connect();
		console.log(
			`\x1b[32m====> Connection to ${privateEnv.DB_NAME} database successful!\x1b[0m\n====> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`
		);
	} catch (error) {
		console.error('\x1b[31mError connecting to database:\x1b[0m', error);
		throw new Error('Error connecting to database');
	}
})();

// Initialize collections object
const collectionsModels: { [Key: string]: any } = {};

// Set up collections in the database using the adapter
export async function getCollectionModels() {
	const models = await dbAdapter.getCollectionModels();
	Object.assign(collectionsModels, models);
	return collectionsModels;
}

// Set up authentication collections if they don't already exist
dbAdapter.setupAuthModels();

// Set up Media collections if they don't already exist
dbAdapter.setupMediaModels();

// Initialize authModels with an empty object
let authModels: { User: any; Session: any; Token: any } = {
	User: null,
	Session: null,
	Token: null
};

// Authentication setup
if (privateEnv.DB_TYPE === 'mongodb') {
	authModels = {
		User: mongoose.models['auth_users'],
		Session: mongoose.models['auth_sessions'],
		Token: mongoose.models['auth_tokens']
	};
} else if (privateEnv.DB_TYPE === 'mariadb') {
	// authModels = {
	// 	User: dbAdapter.getAuthModel('auth_users'),
	// 	Session: dbAdapter.getAuthModel('auth_sessions'),
	// 	Token: dbAdapter.getAuthModel('auth_tokens')
	// };
}

const auth = new Auth(authModels);

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
