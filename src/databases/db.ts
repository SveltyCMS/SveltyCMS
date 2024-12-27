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
 * - Initialization Management: Manages initialization state to prevent redundant setup processes.
 * - Theme Initialization: Handles default theme setup and ensures it's marked as default if not already.
 * - Authentication and Authorization: Configures and initializes authentication adapters.
 * - Google OAuth2 Integration: Optionally sets up Google OAuth2 client if the client ID and secret are provided.
 */

import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import fs from 'node:fs/promises';
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { connectToMongoDB } from './mongodb/dbconnect';

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

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Database and authentication adapters
export let dbAdapter: dbInterface | null = null; // Database adapter
export let authAdapter: authDBInterface | null = null; // Authentication adapter
export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

// Load database and authentication adapters
async function loadAdapters() {
	try {
		logger.debug(`Loading ${privateEnv.DB_TYPE} adapters...`);

		if (privateEnv.DB_TYPE === 'mongodb') {
			const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter.js');
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

// Initialize default theme
async function initializeDefaultTheme(dbAdapter: dbInterface): Promise<void> {
	try {
		logger.debug('Initializing \x1b[34mdefault theme\x1b[0m...');
		const themes = await dbAdapter.getAllThemes();
		logger.debug(`Found \x1b[34m${themes.length}\x1b[0m themes`);

		if (themes.length === 0) {
			await dbAdapter.storeThemes([DEFAULT_THEME]);
			logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m created successfully.');
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
				path: publicEnv.MEDIA_FOLDER,
				type: 'folder'
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
			await connectToMongoDB();

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
				// Initialize each collection model
				for (const collection of collections) {
					if (dbAdapter) {
						logger.debug(`Creating collection model for: \x1b[34m${collection.name}\x1b[0m`);
						await dbAdapter.createCollectionModel(collection);
						logger.debug(`Finished creating collection model for: \x1b[34m${collection.name}\x1b[0m`);
					}
				}
			}
		}

		if (!authAdapter) {
			throw error(500, 'Authentication adapter not initialized');
		}

		// Step 7: Initialize authentication
		auth = new Auth(authAdapter);
		logger.info('Authentication adapter initialized.');

		isInitialized = true;
		isConnected = true;
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

		// Get collection data from ContentManager - this now uses UUIDs
		const { collections } = contentManager.getCollectionData();

		// Create models using UUID as the key
		for (const collection of collections) {
			if (!collection.id) {
				logger.warn(`Collection missing UUID: \x1b[34m${collection.id}\x1b[0m`);
				continue;
			}

			// Create or update model using UUID
			collectionsModels[collection.id] = {
				name: collection.name,
				schema: collection.schema || {}
			};
		}

		return collectionsModels;
	} catch (error) {
		const message = `Error fetching collection models: ${error instanceof Error ? error.message : String(error)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Export functions and state
export { collectionsModels, initializationPromise as dbInitPromise };
