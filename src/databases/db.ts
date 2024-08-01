import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Auth
import { Auth } from '@src/auth';
import { getCollections, updateCollections } from '@src/collections';
import { setLoadedRolesAndPermissions, type LoadedRolesAndPermissions } from '@src/auth/types';

// Adapters
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// System Logs
import logger from '@src/utils/logger';

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
		logger.debug(`Loading ${privateEnv.DB_TYPE} adapters...`);

		if (privateEnv.DB_TYPE === 'mongodb') {
			const [{ MongoDBAdapter }, { MongoDBAuthAdapter }] = await Promise.all([
				import('./mongoDBAdapter'),
				import('@src/auth/mongoDBAuth/mongoDBAuthAdapter')
			]);
			dbAdapter = new MongoDBAdapter();
			authAdapter = new MongoDBAuthAdapter();
			logger.info('MongoDB adapters loaded successfully.');
		} else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
			logger.debug('Implement & Loading SQL adapters...');
			// const [{ DrizzleDBAdapter }, { DrizzleAuthAdapter }] = await Promise.all([
			// 	import('./drizzleDBAdapter'),
			// 	import('@src/auth/drizzelDBAuth/drizzleAuthAdapter')
			// ]);
			// dbAdapter = new DrizzleDBAdapter();
			// authAdapter = new DrizzleAuthAdapter();
			// logger.info('SQL adapters loaded successfully.');
		} else {
			throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
		}
	} catch (error) {
		logger.error(`Error loading adapters: ${(error as Error).message}`, { error });
		throw error;
	}
}

// Connect to the database
async function connectToDatabase(retries = MAX_RETRIES): Promise<void> {
	if (!dbAdapter) {
		const errorMsg = 'Database adapter not initialized';
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}

	logger.info(`Trying to connect to your defined ${privateEnv.DB_NAME} database ...`);

	while (retries > 0) {
		try {
			await dbAdapter.connect();
			logger.info(`Connection to ${privateEnv.DB_NAME} database successful!`);
			return;
		} catch (error) {
			logger.error(`Error connecting to database: ${(error as Error).message}`, { error });
			retries -= 1;
			if (retries > 0) {
				logger.info(`Retrying... Attempts left: ${retries}`);
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
async function initializeAdapters(): Promise<void> {
	if (isInitialized) {
		logger.debug('Adapters already initialized, skipping initialization.');
		return;
	}

	try {
		await loadAdapters();
		await connectToDatabase();

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

			try {
				await authAdapter.initializeDefaultRolesAndPermissions();
				logger.info('Default roles and permissions initialized.');
			} catch (error) {
				logger.error(`Error initializing default roles and permissions: ${(error as Error).message}`, { error });
			}

			try {
				const roles = await authAdapter.getAllRoles();
				const permissions = await authAdapter.getAllPermissions();
				const loadedData: LoadedRolesAndPermissions = { roles, permissions };
				setLoadedRolesAndPermissions(loadedData);
				logger.info('Roles and permissions loaded.');
			} catch (error) {
				logger.error(`Error loading roles and permissions: ${(error as Error).message}`, { error });
			}
		} else {
			throw new Error('Authentication adapter not initialized');
		}

		isInitialized = true;
		logger.info('Adapters initialized successfully');
	} catch (error) {
		logger.error(`Error initializing adapters: ${(error as Error).message}`, { error });
		initializationPromise = null;
		throw error;
	}
}

initializationPromise = initializeAdapters()
	.then(() => logger.debug('Initialization completed successfully.'))
	.catch((error) => {
		logger.error(`Initialization promise rejected with error: ${(error as Error).message}`, { error });
		initializationPromise = null;
	});

const collectionsModels: { [key: string]: any } = {};

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
		logger.error(`Error fetching collection models: ${(error as Error).message}`, { error });
		throw error;
	}
}

// Google OAuth2 - optional authentication
async function googleAuth() {
	if (privateEnv.GOOGLE_CLIENT_ID && privateEnv.GOOGLE_CLIENT_SECRET) {
		const { google } = await import('googleapis');
		logger.debug('Setting up Google OAuth2...');
		const oauth2Client = new google.auth.OAuth2(
			privateEnv.GOOGLE_CLIENT_ID,
			privateEnv.GOOGLE_CLIENT_SECRET,
			`${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login/oauth`
		);
		logger.debug('Google OAuth2 setup complete.');
		return oauth2Client;
	} else {
		logger.warn('Google client ID and secret not provided. Google OAuth will not be available.');
	}
}
// Export collections and auth objects
export { collectionsModels, auth, googleAuth, initializationPromise, dbAdapter, authAdapter };
