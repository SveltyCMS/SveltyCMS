import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Auth
import { Auth } from '@src/auth';
import { google } from 'googleapis';

// Adapters
import type { DatabaseAdapter } from './databaseAdapter';
import type { AuthDBAdapter } from '@src/auth/authDBAdapter';

// Database and authentication adapters
let dbAdapter: DatabaseAdapter | null = null;
let authAdapter: AuthDBAdapter | null = null;
let auth: Auth | null = null;

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

let initializationPromise: Promise<void> | null = null;

async function loadAdapters() {
	// console.log('Loading database and authentication adapters...');
	try {
		if (privateEnv.DB_TYPE === 'mongodb') {
			// console.log('Detected MongoDB as the database type.');
			const [{ MongoDBAdapter }, { MongoDBAuthAdapter }] = await Promise.all([import('./mongoDBAdapter'), import('@src/auth/mongoDBAuthAdapter')]);
			dbAdapter = new MongoDBAdapter();
			authAdapter = new MongoDBAuthAdapter();
		} else if (privateEnv.DB_TYPE === 'mariadb') {
			// console.log('Detected MariaDB as the database type.');
			const [{ MariaDBAdapter }, { MariaDBAuthAdapter }] = await Promise.all([import('./mariaDBAdapter'), import('@src/auth/mariaDBAuthAdapter')]);
			dbAdapter = new MariaDBAdapter();
			authAdapter = new MariaDBAuthAdapter();
		} else {
			throw new Error('Unsupported DB_TYPE specified in environment variables');
		}
		// console.log('Adapters loaded successfully');
	} catch (error) {
		console.error('Error loading adapters:', error);
		throw error;
	}
}

async function connectToDatabase(retries = MAX_RETRIES) {
	if (!dbAdapter) {
		console.error('Database adapter not initialized');
		throw new Error('Database adapter not initialized');
	}

	console.log(`\n\x1b[33m\x1b[5m====> Trying to Connect to your defined ${privateEnv.DB_NAME} database ...\x1b[0m`);

	while (retries > 0) {
		try {
			await dbAdapter.connect();
			console.log(
				`\x1b[32m====> Connection to ${privateEnv.DB_NAME} database successful!\x1b[0m\n====> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`
			);
			return;
		} catch (error) {
			console.error(`\x1b[31mError connecting to database:\x1b[0m`, error);
			retries -= 1;
			if (retries > 0) {
				console.log(`Retrying... Attempts left: ${retries}`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			} else {
				const errorMsg = 'Failed to connect to the database after maximum retries';
				console.error(errorMsg);
				throw new Error(errorMsg);
			}
		}
	}
}

async function initializeAdapters() {
	try {
		await loadAdapters();
		await connectToDatabase();

		// Set up authentication collections if they don't already exist
		if (dbAdapter) {
			dbAdapter.setupAuthModels();
			dbAdapter.setupMediaModels();
		}

		if (authAdapter) {
			auth = new Auth(authAdapter);
			console.log('Authentication adapter initialized.');
		} else {
			const errorMsg = 'Authentication adapter not initialized';
			console.error(errorMsg);
			throw new Error(errorMsg);
		}
		console.log('Adapters initialized successfully');
	} catch (error) {
		console.error('Error initializing adapters:', error);
		initializationPromise = null; // Reset promise on error to retry initialization if needed
		throw error;
	}
}

// Initialize adapters and set the promise
initializationPromise = initializeAdapters()
	.then(() => {
		console.log('Initialization completed successfully.');
	})
	.catch((error) => {
		console.error('Initialization promise rejected with error:', error);
		initializationPromise = null; // Reset promise on error to retry initialization if needed
	});

// Initialize collections object
const collectionsModels: { [key: string]: any } = {};

// Set up collections in the database using the adapter
export async function getCollectionModels() {
	if (!dbAdapter) {
		const errorMsg = 'Database adapter not initialized';
		console.error(errorMsg);
		throw new Error(errorMsg);
	}
	console.log('Fetching collection models...');
	const models = await dbAdapter.getCollectionModels();
	Object.assign(collectionsModels, models);
	console.log('Collection models fetched successfully:', collectionsModels);
	return collectionsModels;
}

// Google OAuth2 - optional authentication
let googleAuth: any = null;

if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
	// console.log('Setting up Google OAuth2...');
	const oauth2Client = new google.auth.OAuth2(
		privateEnv.GOOGLE_CLIENT_ID,
		privateEnv.GOOGLE_CLIENT_SECRET,
		`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
	);

	googleAuth = oauth2Client;
	// console.log('Google OAuth2 setup complete.');
} else {
	console.warn('Google client ID and secret not provided. Google OAuth will not be available.');
}

// Export collections and auth objects
export { collectionsModels, auth, googleAuth, initializationPromise };
