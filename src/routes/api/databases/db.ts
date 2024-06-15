import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Adapters Database
import { MongoDBAdapter } from './mongoDBAdapter';
import type { DatabaseAdapter } from './databaseAdapter';

// Adapters Auth
import { MongoAuthAdapter } from '@src/auth/mongoAuthAdapter'; // Import MongoDB auth adapter
import type { AuthDBAdapter } from '@src/auth/authDBAdapter'; // Import AuthDBAdapter interface

// Auth
import { Auth } from '@src/auth';
import { google } from 'googleapis';

let dbAdapter: DatabaseAdapter;
let authAdapter: AuthDBAdapter;

async function initializeAdapters() {
	if (privateEnv.DB_TYPE === 'mongodb') {
		dbAdapter = new MongoDBAdapter();
		authAdapter = new MongoAuthAdapter();
	} else if (privateEnv.DB_TYPE === 'mariadb') {
		const { MariaDBAdapter } = await import('./mariaDBAdapter');
		const { MariaDBAuthAdapter } = await import('@src/auth/mariaDBAuthAdapter');
		dbAdapter = new MariaDBAdapter();
		authAdapter = new MariaDBAuthAdapter();
	} else {
		throw new Error('Unsupported DB_TYPE specified in environment variables');
	}

	// Connect to the selected database
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

	// Set up authentication collections if they don't already exist
	dbAdapter.setupAuthModels();

	// Set up Media collections if they don't already exist
	dbAdapter.setupMediaModels();
}

// Initialize adapters
initializeAdapters().catch((error) => console.error(error));

// Initialize collections object
const collectionsModels: { [Key: string]: any } = {};

// Set up collections in the database using the adapter
export async function getCollectionModels() {
	const models = await dbAdapter.getCollectionModels();
	Object.assign(collectionsModels, models);
	return collectionsModels;
}

// Initialize the Auth class with the appropriate auth adapter
const auth = new Auth(authAdapter);

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
