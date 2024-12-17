/**
 * @file src/databases/db.ts
 * @description
 * Database and authentication initialization and management module.
 *
 * This module is responsible for:
 * - Loading and initializing database and authentication adapters based on the configured DB_TYPE
 * - Establishing database connections with a retry mechanism
 * - Managing initialization of authentication models, media models, and collection models
 * - Setting up default roles and permissions
 * - Configuring Google OAuth2 client if credentials are provided
 *
 * Key Features:
 * - Dynamic Adapter Loading: Supports MongoDB and SQL-based adapters (MariaDB, PostgreSQL) with dynamic import.
 * - Database Connection: Implements a retry mechanism to handle connection failures and attempts reconnections.
 * - Initialization Management: Manages initialization state to prevent redundant setup processes.
 * - Theme Initialization: Handles default theme setup and ensures it's marked as default if not already.
 * - Authentication and Authorization: Configures and initializes authentication adapters.
 * - Google OAuth2 Integration: Optionally sets up Google OAuth2 client if the client ID and secret are provided.
 */

import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import fs from 'fs/promises';
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';

// Auth
import { Auth } from '@src/auth';

// Content Manager
import { contentManager } from '@src/content/ContentManager';

import { getPermissionByName, getAllPermissions, syncPermissions } from '@src/auth/permissionManager';

// Adapters Interfaces
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// System Logger
import { logger } from '@utils/logger.svelte';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// Database and authentication adapters
let dbAdapter: dbInterface | null = null;
let authAdapter: authDBInterface | null = null;
let auth: Auth | null = null;

let isInitialized = false; // Flag to track initialization status
let isConnected = false; // Flag to track database connection status
let initializationPromise: Promise<void> | null = null;

const MAX_RETRIES = 5; // Maximum number of DB connection retries
const RETRY_DELAY = 5000; // 5 seconds

// Load database and authentication adapters
async function loadAdapters() {
	try {
		logger.debug(`Loading ${privateEnv.DB_TYPE} adapters...`);

		if (privateEnv.DB_TYPE === 'mongodb') {
			const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');
			dbAdapter = new MongoDBAdapter();
			const userAdapter = new UserAdapter();
			const sessionAdapter = new SessionAdapter();
			const tokenAdapter = new TokenAdapter();

			authAdapter = {
				// User Management Methods
				createUser: userAdapter.createUser.bind(userAdapter),
				updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
				deleteUser: userAdapter.deleteUser.bind(userAdapter),
				getUserById: userAdapter.getUserById.bind(userAdapter),
				getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
				getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
				getUserCount: userAdapter.getUserCount.bind(userAdapter),

				// Session Management Methods
				createSession: sessionAdapter.createSession.bind(sessionAdapter),
				updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
				deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
				deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
				validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
				invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
				getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),

				// Token Management Methods
				createToken: tokenAdapter.createToken.bind(tokenAdapter),
				validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
				consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
				getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
				deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),

				// Permission Management Methods
				getAllPermissions,
				getPermissionByName
			} as authDBInterface;

			logger.info('MongoDB adapters loaded successfully.');
		} else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
			logger.debug('Implement & Loading SQL adapters...');
			// Implement SQL adapters loading here
		} else {
			throw error(500, `Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
		}
	} catch (err) {
		const message = `Error in loadAdapters: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Connect to the database
async function connectToDatabase(retries = MAX_RETRIES): Promise<void> {
	if (!dbAdapter) {
		throw error(500, 'Database adapter not initialized');
	}

	if (isConnected) {
		logger.info('Database already connected');
		return;
	}

	logger.info(`\x1b[33m\x1b[5mTrying to connect to your defined ${privateEnv.DB_NAME} database ...\x1b[0m`);

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await dbAdapter.connect();
			isConnected = true;
			logger.info(`\x1b[32mConnection to ${privateEnv.DB_NAME} database successful!\x1b[0m ===> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`);
			return;
		} catch (err) {
			const message = `Error connecting to database (attempt ${attempt}/${retries}): ${err instanceof Error ? err.message : String(err)}`;
			logger.error(`\x1b[31m${message}\x1b[0m`);
			if (attempt < retries) {
				logger.info(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			} else {
				throw error(500, 'Failed to connect to the database after maximum retries');
			}
		}
	}
}

// Initialize default theme
async function initializeDefaultTheme(dbAdapter: dbInterface): Promise<void> {
	try {
		logger.debug('Initializing default theme...');
		const themes = await dbAdapter.getAllThemes();
		logger.debug(`Found \x1b[34m${themes.length}\x1b[0m themes`);

		if (themes.length === 0) {
			await dbAdapter.storeThemes([DEFAULT_THEME]);
			logger.info('Default SveltyCMS theme created successfully.');
		} else {
			logger.info('Themes already exist in the database. Skipping default theme initialization.');
		}
	} catch (err) {
		const message = `Error in initializeDefaultTheme: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Initialize the media folder
async function initializeMediaFolder() {
	const mediaFolderPath = publicEnv.MEDIA_FOLDER;

	try {
		// Check if the media folder exists
		await fs.access(mediaFolderPath);
		logger.info(`Media folder already exists: \x1b[34m${mediaFolderPath}\x1b[0m`);
	} catch {
		// If the folder does not exist, create it
		logger.info(`Media folder not found. Creating new folder: \x1b[34m${mediaFolderPath}\x1b[0m`);
		await fs.mkdir(mediaFolderPath, { recursive: true });
		logger.info(`Media folder created successfully: \x1b[34m${mediaFolderPath}\x1b[0m`);
	}
}

// Initialize virtual folders
async function initializeVirtualFolders() {
	if (!dbAdapter) {
		throw error(500, 'Database adapter not initialized');
	}

	try {
		const virtualFolders = await dbAdapter.getVirtualFolders();
		if (virtualFolders.length === 0) {
			// Create a default root folder
			const rootFolder = await dbAdapter.createVirtualFolder({
				name: publicEnv.MEDIA_FOLDER,
				parent: undefined,
				path: publicEnv.MEDIA_FOLDER
			});

			// Log only the essential information
			logger.info('Default root virtual folder created:', {
				name: rootFolder.name,
				path: rootFolder.path,
				id: rootFolder._id?.toString() || 'No ID'
			});
		} else {
			logger.info(`Found \x1b[34m${virtualFolders.length}\x1b[0m virtual folders.`);
		}
	} catch (err) {
		const message = `Error in initializeVirtualFolders: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Initialize adapters
async function initializeAdapters(): Promise<void> {
	if (isInitialized) {
		logger.info('Adapters already initialized, skipping initialization.');
		return;
	}

	try {
		// Step 1: Load adapters first
		await loadAdapters();

		if (!browser) {
			// Step 2: Connect to database before any other initialization
			await connectToDatabase();

			// Step 3: Initialize media folder (filesystem operation, can be done in parallel)
			await initializeMediaFolder();

			// Step 4: Setup database models
			if (!dbAdapter) {
				throw error(500, 'Database adapter not initialized');
			}

			// Initialize database models first
			await dbAdapter.setupAuthModels();
			await dbAdapter.setupMediaModels();

			// Step 5: Initialize remaining components
			await initializeDefaultTheme(dbAdapter);
			await initializeVirtualFolders();
			await initializeRevisions();
			await syncPermissions();

			// Step 6: Initialize ContentManager
			logger.debug('Initializing ContentManager...');
			await contentManager.initialize();

			// Get collection data after initialization
			const { collections } = contentManager.getCollectionData();
			if (!collections || collections.length === 0) {
				logger.warn('No collections found after ContentManager initialization');
			} else {
				logger.debug('ContentManager initialized with collections:', { count: collections.length });
			}

			await dbAdapter.getCollectionModels();
		}

		if (!authAdapter) {
			throw error(500, 'Authentication adapter not initialized');
		}

		// Step 7: Initialize authentication
		auth = new Auth(authAdapter);
		logger.info('Authentication adapter initialized.');

		isInitialized = true;
		logger.info('Adapters initialized successfully');
	} catch (err) {
		const message = `Error in initializeAdapters: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		isInitialized = false; // Reset initialization flag on error
		isConnected = false; // Reset connection flag on error
		throw error(500, message);
	}
}

// Initialize revisions
async function initializeRevisions() {
	if (!dbAdapter) {
		throw error(500, 'Database adapter not initialized');
	}

	// Implement any revision-specific initialization logic here
	logger.info('Revisions initialized successfully');
}

// Ensure initialization runs once
if (!initializationPromise) {
	initializationPromise = initializeAdapters()
		.then(() => logger.info('Initialization completed successfully.'))
		.catch((err) => {
			const message = `Initialization promise rejected with error: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			initializationPromise = null;
			throw err;
		});
}

interface CollectionModel {
	// Define the properties of your collection model here
	name: string;
	schema: object;
	// Add other properties as needed
}

// Export collections
const collectionsModels: { [key: string]: CollectionModel } = {};

// Export collections
export async function getCollectionModels() {
	if (!dbAdapter) {
		throw error(500, 'Database adapter not initialized');
	}

	try {
		logger.debug('Fetching collection models...');

		// Fetch all collection models
		const models = await dbAdapter.getCollectionModels();
		// Assign the models to collectionsModels object
		Object.assign(collectionsModels, models);

		// Log the correct count after all collections have been fetched and assigned
		const modelCount = Object.keys(collectionsModels).length;
		logger.debug('Collection models fetched successfully', { modelCount });
		return models;
	} catch (err) {
		const message = `Error in getCollectionModels: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Export functions and state
export { collectionsModels, auth, initializationPromise as dbInitPromise, dbAdapter, authAdapter, isConnected };