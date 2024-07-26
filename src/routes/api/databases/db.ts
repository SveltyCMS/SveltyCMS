import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Auth
import { Auth } from '@src/auth';
import { getCollections, updateCollections } from '@src/collections';

// Adapters
import type { dbInterface } from '@api/databases/dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// System Logs
import { logger } from '@src/utils/logger';

// Database and authentication adapters
let dbAdapter: dbInterface | null = null;
let authAdapter: authDBInterface | null = null;
let auth: Auth | null = null;

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

let initializationPromise: Promise<void> | null = null;

// Flag to track initialization status
let isInitialized = false;

// Load database and authentication adapters
async function loadAdapters() {
	try {
		if (privateEnv.DB_TYPE === 'mongodb') {
			logger.debug('Detected mongodb database as the database type.');

			const [{ MongoDBAdapter }, { MongoDBAuthAdapter }] = await Promise.all([import('./mongoDBAdapter'), import('@src/auth/mongoDBAuthAdapter')]);
			dbAdapter = new MongoDBAdapter();
			authAdapter = new MongoDBAuthAdapter();
		} else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
			logger.debug('Detected SQL database as the database type.');

			// Uncomment and ensure these adapters are correctly implemented
			// const [{ DrizzleDBAdapter }, { DrizzleAuthAdapter }] = await Promise.all([
			//     import('./drizzleDBAdapter'),
			//     import('@src/auth/drizzleAuthAdapter')
			// ]);
			// dbAdapter = new DrizzleDBAdapter();
			// authAdapter = new DrizzleAuthAdapter();
		} else {
			throw new Error('Unsupported DB_TYPE specified in environment variables');
		}
	} catch (error) {
		const err = error as Error;
		logger.error(`Error loading adapters: ${err.message}`, { name: err.name, message: err.message });
		throw error;
	}
}

// Connect to the database
async function connectToDatabase(retries = MAX_RETRIES) {
	if (!dbAdapter) {
		logger.error('Database adapter not initialized');
		throw new Error('Database adapter not initialized');
	}
	// Message for connecting to the database
	logger.info(`\x1b[33m\x1b[5mTrying to connect to your defined ${privateEnv.DB_NAME} database ...\x1b[0m`);

	while (retries > 0) {
		try {
			await dbAdapter.connect();

			// Message for successful connection
			logger.info(`\x1b[32mConnection to ${privateEnv.DB_NAME} database successful!\x1b[0m ===> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`);
			return;
		} catch (error) {
			// Message for connection error
			const err = error as Error;
			logger.error(`\x1b[31m Error connecting to database:\x1b[0m ${err.message}`, { name: err.name, message: err.message });

			retries -= 1;
			if (retries > 0) {
				logger.info(`Retrying... Attempts left: ${retries}`, { retries });
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			} else {
				const errorMsg = 'Failed to connect to the database after maximum retries';
				logger.error(errorMsg);
				throw new Error(errorMsg);
			}
		}
	}
}

// Initialize adapters
async function initializeAdapters() {
	// Check if adapters are already initialized
	if (isInitialized) {
		logger.debug('Adapters already initialized, skipping initialization.');
		return;
	}

	try {
		logger.debug('Starting to load adapters...');
		const loadAdaptersStart = Date.now();
		await loadAdapters();
		logger.debug(`Adapters loaded in ${Date.now() - loadAdaptersStart}ms`);

		logger.debug('Starting to connect to the database...');
		const connectToDatabaseStart = Date.now();
		await connectToDatabase();
		logger.debug(`Database connected in ${Date.now() - connectToDatabaseStart}ms`);

		// Initialize collections
		logger.debug('Initializing collections...');
		const initCollectionsStart = Date.now();
		await updateCollections();
		const collections = await getCollections();
		logger.debug(`Collections initialized in ${Date.now() - initCollectionsStart}ms`);

		if (Object.keys(collections).length === 0) {
			throw new Error('No collections found after initialization');
		}

		if (dbAdapter) {
			logger.debug('Setting up authentication models...');
			const setupAuthModelsStart = Date.now();
			await dbAdapter.setupAuthModels();
			logger.debug(`Authentication models set up in ${Date.now() - setupAuthModelsStart}ms`);

			logger.debug('Setting up media models...');
			const setupMediaModelsStart = Date.now();
			await dbAdapter.setupMediaModels();
			logger.debug(`Media models set up in ${Date.now() - setupMediaModelsStart}ms`);

			logger.debug('Setting up collection models...');
			const setupCollectionModelsStart = Date.now();
			await dbAdapter.getCollectionModels(); // Changed from getCollectionModels to use dbAdapter
			logger.debug(`Collection models set up in ${Date.now() - setupCollectionModelsStart}ms`);
		}

		if (authAdapter) {
			auth = new Auth(authAdapter);
			logger.debug('Authentication adapter initialized.');
		} else {
			const errorMsg = 'Authentication adapter not initialized';
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		isInitialized = true; // Mark as initialized
		logger.debug('Adapters initialized successfully');
	} catch (error) {
		const err = error as Error;
		logger.error(`Error initializing adapters: ${err.message}`, { name: err.name, message: err.message });
		initializationPromise = null; // Reset promise on error to retry initialization if needed
		throw error;
	}
}

// Initialize adapters and set the promise
initializationPromise = initializeAdapters()
	.then(() => {
		logger.debug('Initialization completed successfully.');
	})
	.catch((error) => {
		const err = error as Error;
		logger.error(`Initialization promise rejected with error: ${err.message}`, { name: err.name, message: err.message });
		initializationPromise = null; // Reset promise on error to retry initialization if needed
	});

// Initialize collections object
const collectionsModels: { [key: string]: any } = {};

// Set up collections in the database using the adapter
export async function getCollectionModels() {
	if (!dbAdapter) {
		const errorMsg = 'Database adapter not initialized';
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}
	logger.info('Fetching collection models...');

	try {
		const models = await dbAdapter.getCollectionModels();
		Object.assign(collectionsModels, models);
		logger.debug('Collection models fetched successfully', { collectionsModels });
	} catch (error) {
		const err = error as Error;
		logger.error(`Error fetching collection models: ${err.message}`, { name: err.name, message: err.message });
		throw error;
	}

	return collectionsModels;
}

// Google OAuth2 - optional authentication
//let googleAuth: any = null;
async function googleAuth() {
	if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
		const { google } = await import('googleapis');
		logger.debug('Setting up Google OAuth2...');
		const oauth2Client = new google.auth.OAuth2(
			privateEnv.GOOGLE_CLIENT_ID,
			privateEnv.GOOGLE_CLIENT_SECRET,
			`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
		);

		return oauth2Client;
		logger.debug('Google OAuth2 setup complete.');
	} else {
		logger.warn('Google client ID and secret not provided. Google OAuth will not be available.');
	}
}
// Export collections and auth objects
export { collectionsModels, auth, googleAuth, initializationPromise, dbAdapter, authAdapter };
