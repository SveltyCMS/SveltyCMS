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

import { connectToMongoDB } from './mongodb/dbconnect';

// Auth
import { Auth } from '@src/auth';

// Adapters Interfaces
import type { DatabaseAdapter } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// Content Manager
import { contentManager } from '@src/content/ContentManager';
import { getPermissionByName, getAllPermissions, syncPermissions } from '@src/auth/permissionManager';
import type { CollectionData } from '@src/content/types';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Screen Size
import { ScreenSize } from '@src/stores/screenSizeStore.svelte.ts';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter
export let authAdapter: authDBInterface | null = null; // Authentication adapter
export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise
let adaptersLoaded = false; // Internal flag

// Initialize default preferences if needed
async function initializeDefaultPreferences(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize preferences: dbAdapter is not available');
	try {
		logger.debug('Initializing default preferences...');
		const existingPrefs = await dbAdapter.systemPreferences.getSystemPreferences('system');
		// If preferences for LG screen size are missing, initialize them
		if (!existingPrefs || !existingPrefs[ScreenSize.LG]) {
			await dbAdapter.systemPreferences.updateSystemPreferences('system', ScreenSize.LG, []);
			logger.info('Initialized default system preferences for LG screen size');
		} else {
			logger.debug('Default preferences already exist');
		}
	} catch (err) {
		logger.error(`Error initializing default preferences: ${err instanceof Error ? err.message : String(err)}`);
		throw err; // Re-throw to fail initialization
	}
}

// Load database and authentication adapters
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) {
		logger.debug('Adapters already loaded, skipping');
		return;
	}
	logger.debug(`🔌 Loading \x1b[34m${privateEnv.DB_TYPE}\x1b[0m adapters...`);

	try {
		switch (privateEnv.DB_TYPE) {
			case 'mongodb': {
				logger.debug('Importing MongoDB adapter...');
				const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');
				dbAdapter = new MongoDBAdapter();
				logger.debug('MongoDB adapter created');

				logger.debug('Creating auth adapters...');
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
					getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
					rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter), // Add rotateToken binding
					cleanupRotatedSessions: sessionAdapter.cleanupRotatedSessions.bind(sessionAdapter), // Add cleanup binding

					// Token Management Methods
					createToken: tokenAdapter.createToken.bind(tokenAdapter),
					validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
					consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
					getTokenData: tokenAdapter.getTokenData.bind(tokenAdapter),
					deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
					getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),

					// Permission Management Methods (Imported)
					getAllPermissions,
					getPermissionByName
				};
				logger.debug('Auth adapters created and bound');
				break;
			}
			case 'mariadb':
			case 'postgresql':
				// Implement SQL adapters loading here
				logger.error(`SQL adapter loading not yet implemented for ${privateEnv.DB_TYPE}`);
				throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
			default:
				logger.error(`Unknown DB_TYPE: ${privateEnv.DB_TYPE}`);
				throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
		}
		adaptersLoaded = true;
		logger.debug('All adapters loaded successfully');
	} catch (err) {
		const message = `Error loading adapters: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		adaptersLoaded = false; // Ensure flag is reset on error
		// Re-throwing here will cause the initializationPromise to reject
		throw new Error(message);
	}
}

// Initialize default theme
async function initializeDefaultTheme(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize themes: dbAdapter is not available.');
	try {
		logger.debug('Initializing \x1b[34mdefault theme\x1b[0m...');
		const themes = await dbAdapter.themes.getAllThemes();
		logger.debug(`Found \x1b[34m${themes.length}\x1b[0m themes in the database`);

		if (themes.length === 0) {
			await dbAdapter.themes.storeThemes([DEFAULT_THEME]);
			logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m created successfully.');
		} else {
			logger.info('Themes already exist in the database. Skipping default theme initialization.');
		}
	} catch (err) {
		const message = `Error initializing default theme: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

// Initialize the media folder
async function initializeMediaFolder(): Promise<void> {
	const mediaFolderPath = publicEnv.MEDIA_FOLDER;
	try {
		logger.debug(`Checking media folder: ${mediaFolderPath}`);
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
async function initializeVirtualFolders(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	try {
		logger.debug('Initializing virtual folders...');
		const virtualFolders = await dbAdapter.systemVirtualFolder.getAll();
		if (virtualFolders.length === 0) {
			logger.info('No virtual folders found. Creating default root folder...');
			// Create a default root folder
			const rootFolder = await dbAdapter.systemVirtualFolder.create({
				_id: dbAdapter.utils.generateId(),
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
			logger.debug(`Found \x1b[34m${virtualFolders.length}\x1b[0m virtual folders`);
		}
	} catch (err) {
		const message = `Error initializing virtual folders: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

// Initialize adapters
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.');
	// Add any revision-specific setup if needed in the future
	logger.debug('Revisions initialized.');
}

// Core Initialization Logic
async function initializeSystem(): Promise<void> {
	// Prevent re-initialization
	if (isInitialized) {
		logger.debug('System already initialized. Skipping.');
		return;
	}
	logger.info('Starting SvelteCMS System Initialization...');

	try {
		// 1. Connect to Database & Load Adapters (Concurrently)
		logger.debug('Connecting to database and loading adapters...');
		await Promise.all([
			connectToMongoDB().catch((err) => {
				logger.error(`MongoDB connection failed: ${err.message}`);
				throw err;
			}),
			loadAdapters().catch((err) => {
				logger.error(`Adapter loading failed: ${err.message}`);
				throw err;
			})
		]);
		isConnected = true; // Mark connected after DB connection succeeds
		logger.debug('Step 1 completed: Database connected and adapters loaded');

		// Check if adapters loaded correctly (loadAdapters throws on critical failure)
		if (!dbAdapter || !authAdapter) {
			throw new Error('Database or Authentication adapter failed to load.');
		}

		// 2. Setup Core Database Models (Essential for subsequent steps)
		logger.debug('Step 2: Setting up core database models...');
		try {
			await dbAdapter.auth.setupAuthModels();
			logger.debug('Auth models setup complete');

			await dbAdapter.media.setupMediaModels();
			logger.debug('Media models setup complete');

			await dbAdapter.widgets.setupWidgetModels();
			logger.debug('Widget models setup complete');
		} catch (modelSetupErr) {
			logger.error(`Database model setup failed: ${modelSetupErr.message}`);
			throw modelSetupErr;
		}

		// 3. Initialize remaining components
		logger.debug('Step 3: Initializing system components...');
		try {
			await initializeMediaFolder();
			await initializeDefaultTheme();
			await initializeRevisions();
			await initializeVirtualFolders();
			await initializeDefaultPreferences();
			await syncPermissions();
			logger.debug('Step 3 completed: System components initialized');
		} catch (componentErr) {
			logger.error(`Component initialization failed: ${componentErr.message}`);
			throw componentErr;
		}

		// 4. Initialize ContentManager (loads collection schemas into memory)
		logger.debug('Step 4: Initializing ContentManager...');
		try {
			await contentManager.initialize();
			logger.debug('Step 4 completed: ContentManager initialized');
		} catch (contentErr) {
			logger.error(`ContentManager initialization failed: ${contentErr.message}`);
			throw contentErr;
		}

		// 5. Create Collection-Specific Database Models (ONCE after schemas are loaded)
		logger.debug('Step 5: Creating collection-specific database models...');
		try {
			const { collectionMap } = await contentManager.getCollectionData(); // Get loaded schemas
			if (!dbAdapter) throw new Error('dbAdapter not available for model creation.'); // Should not happen here

			for (const schema of collectionMap.values()) {
				logger.debug(`Creating model for collection: ${schema.name}`);
				await dbAdapter.collection.createModel(schema as CollectionData);
			}
			logger.debug('Step 5 completed: Collection-specific models created');
		} catch (modelErr) {
			const message = `Error creating collection models: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}`;
			logger.error(message);
			throw new Error(message); // Propagate error to fail initialization
		}

		// 6. Initialize Authentication (after DB/Auth adapters and models are ready)
		logger.debug('Step 6: Initializing Authentication...');
		if (!authAdapter) {
			throw new Error('Authentication adapter not initialized'); // Use Error instead of kit's error
		}

		try {
			// Initialize authentication
			logger.debug('Creating Auth instance...');
			auth = new Auth(authAdapter);
			if (!auth) {
				throw new Error('Auth initialization failed - constructor returned null/undefined');
			}

			// Verify auth methods are available
			const authMethods = Object.keys(auth).filter((key) => typeof auth[key] === 'function');
			logger.debug(
				`Auth instance created with ${authMethods.length} methods:`,
				authMethods.slice(0, 5).join(', ') + (authMethods.length > 5 ? '...' : '')
			);

			// Test auth functionality
			if (typeof auth.validateSession !== 'function') {
				throw new Error('Auth instance missing validateSession method');
			}

			logger.debug('Step 6 completed: Authentication initialized and verified');
		} catch (authErr) {
			logger.error(`Auth initialization failed: ${authErr.message}`);
			throw authErr;
		}

		isInitialized = true;
		isConnected = true;

		logger.info('System initialization completed successfully! All systems ready.');
	} catch (err) {
		const message = `CRITICAL: System initialization failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		logger.error('Stack trace:', err instanceof Error ? err.stack : 'No stack trace available');

		isInitialized = false; // Reset initialization flag on error
		isConnected = false; // Reset connection flag on error
		auth = null; // Reset auth on error

		throw new Error(message);
	}
}

// Singleton Initialization Execution
if (!initializationPromise) {
	logger.debug('Creating system initialization promise...');
	initializationPromise = initializeSystem();

	// Handle initialization errors
	initializationPromise.catch((err) => {
		logger.error(`The main initializationPromise was rejected: ${err instanceof Error ? err.message : String(err)}`);
		logger.error('Clearing initialization promise to allow retry');
		// Ensure promise variable is cleared so retries might be possible if the app handles it
		initializationPromise = null;
	});
} else {
	logger.debug('Initialization promise already exists');
}

// --- Full System Ready Promise (including ContentManager) ---

// This function ensures ContentManager initializes *after* the core DB/Auth setup
async function initializeFullSystem(): Promise<void> {
	try {
		// Wait for the core DB/Auth adapters and setup to complete
		await initializationPromise; // Wait for the original promise
		logger.debug('Core system initialized (dbInitPromise resolved). ContentManager already initialized as part of core setup.');
	} catch (err) {
		// If either initializationPromise or contentManager.initialize fails
		logger.error(`Full system initialization failed: ${err instanceof Error ? err.message : String(err)}`);
		// We might want to re-throw or handle this specifically
		throw err; // Re-throw to indicate startup failure
	}
}

// Create and export a promise that represents the *fully* initialized system
let fullSystemPromise: Promise<void> | null = null;
if (!fullSystemPromise) {
	logger.debug('Creating full system ready promise...');
	fullSystemPromise = initializeFullSystem();
	fullSystemPromise.catch((err) => {
		logger.error(`The fullSystemReadyPromise was rejected: ${err instanceof Error ? err.message : String(err)}`);
		fullSystemPromise = null; // Allow potential retry?
	});
}

// Export the promises so other modules can wait
// dbInitPromise: Resolves when DB connection and core adapters/models are ready
// fullSystemReadyPromise: Resolves when dbInitPromise is done AND ContentManager is initialized
export { initializationPromise as dbInitPromise, fullSystemPromise as fullSystemReadyPromise };
