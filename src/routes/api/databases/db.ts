import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Auth
import { Auth } from '@src/auth';
import { getCollections, updateCollections } from '@src/collections';
import { setLoadedRolesAndPermissions, type LoadedRolesAndPermissions } from '@src/auth/types';

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
			logger.debug('Loading MongoDB adapters...');

			const [{ MongoDBAdapter }, { MongoDBAuthAdapter }] = await Promise.all([
				import('./mongoDBAdapter'),
				import('@src/auth/mongoDBAuth/mongoDBAuthAdapter')
			]);
			dbAdapter = new MongoDBAdapter();
			authAdapter = new MongoDBAuthAdapter();
			logger.info('MongoDB adapters loaded successfully.');
		} else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
			logger.debug('Loading SQL adapters...');

			// Uncomment and ensure these adapters are correctly implemented
			// const [{ DrizzleDBAdapter }, { DrizzleAuthAdapter }] = await Promise.all([
			//     import('./drizzleDBAdapter'),
			//     import('@src/auth/drizzleAuthAdapter')
			// ]);
			// dbAdapter = new DrizzleDBAdapter();
			// authAdapter = new DrizzleAuthAdapter();
			throw new Error('SQL adapters not implemented yet');
		} else {
			throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
		}
	} catch (error) {
		const err = error as Error;
		logger.error(`Error loading adapters: ${err.message}`, { error: err });
		throw err;
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
		await loadAdapters();
		await connectToDatabase();

		logger.debug('Initializing collections...');
		await updateCollections();
		const collections = await getCollections();

		if (Object.keys(collections).length === 0) {
			throw new Error('No collections found after initialization');
		}

		if (dbAdapter) {
			await dbAdapter.setupAuthModels();
			await dbAdapter.setupMediaModels();
			await dbAdapter.getCollectionModels();
		} else {
			throw new Error('Database adapter not initialized');
		}

		if (authAdapter) {
			auth = new Auth(authAdapter);
			logger.debug('Authentication adapter initialized.');

			// Initialize default roles and permissions
			await authAdapter.initializeDefaultRolesAndPermissions();
			logger.info('Default roles and permissions initialized.');

			// Load roles and permissions after initialization
			const roles = await authAdapter.getAllRoles();
			const permissions = await authAdapter.getAllPermissions();

			// Create a LoadedRolesAndPermissions object
			const loadedData: LoadedRolesAndPermissions = {
				roles,
				permissions
			};

			// Pass the single object to setLoadedRolesAndPermissions
			setLoadedRolesAndPermissions(loadedData);
			logger.info('Roles and permissions loaded.');
		} else {
			throw new Error('Authentication adapter not initialized');
		}

		isInitialized = true; // Mark as initialized
		logger.info('Adapters initialized successfully');
	} catch (error) {
		const err = error as Error;
		logger.error(`Error initializing adapters: ${err.message}`, { error: err });
		initializationPromise = null; // Reset promise on error to retry initialization if needed
		throw err;
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

	try {
		logger.debug('Fetching collection models...');
		const models = await dbAdapter.getCollectionModels();
		Object.assign(collectionsModels, models);
		logger.debug('Collection models fetched successfully', { modelCount: Object.keys(models).length });
		return collectionsModels;
	} catch (error) {
		const err = error as Error;
		logger.error(`Error fetching collection models: ${err.message}`, { error: err });
		throw err;
	}
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
