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
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// Content Manager
import { contentManager } from '@src/content/ContentManager';
import { getPermissionByName, getAllPermissions, syncPermissions } from '@src/auth/permissionManager';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// State Variables
export let dbAdapter: dbInterface | null = null; // Database adapter
export let authAdapter: authDBInterface | null = null; // Authentication adapter
export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise
let adaptersLoaded = false; // Internal flag

// Load database and authentication adapters
async function loadAdapters() {
	if (adaptersLoaded) return;
	logger.debug(`Loading \x1b[34m${privateEnv.DB_TYPE}\x1b[0m adapters...`);

	try {
		switch (privateEnv.DB_TYPE) {
			case 'mongodb': {
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

					// Permission Management Methods (Imported)
					getAllPermissions,
					getPermissionByName
				};
				logger.debug('MongoDB adapters loaded successfully.');
				break;
			}
			case 'mariadb':
			case 'postgresql':
				// Implement SQL adapters loading here
				logger.error(`SQL adapter loading not yet implemented for ${privateEnv.DB_TYPE}`);
				throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
			default:
				throw new Error(`Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
		}
		adaptersLoaded = true;
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
		const themes = await dbAdapter.getAllThemes();
		logger.debug(`Found \x1b[34m${themes.length}\x1b[0m themes`);

		if (themes.length === 0) {
			await dbAdapter.storeThemes([DEFAULT_THEME]);
			logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m created successfully.');
		} else {
			logger.info(`Found \x1b[34m${themes.length}\x1b[0m existing themes. Skipping default theme creation.`);
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
		// Check if the media folder exists
		await fs.access(mediaFolderPath);
		logger.info(`Media folder already exists: \x1b[34m${mediaFolderPath}\x1b[0m`);
	} catch {
		// If the folder does not exist, create it
		try {
			logger.info(`Media folder not found. Creating: \x1b[34m${mediaFolderPath}\x1b[0m`);
			await fs.mkdir(mediaFolderPath, { recursive: true });
			logger.info(`Media folder created successfully: \x1b[34m${mediaFolderPath}\x1b[0m`);
		} catch (mkdirErr) {
			const message = `Error creating media folder '${mediaFolderPath}': ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`;
			logger.error(message);
			throw new Error(message);
		}
	}
}

// Initialize virtual folders
async function initializeVirtualFolders(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	try {
		const virtualFolders = await dbAdapter.getVirtualFolders();
		if (virtualFolders.length === 0) {
			logger.info('No virtual folders found. Creating default root folder...');
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
				id: rootFolder._id?.toString() ?? 'N/A'
			});
		} else {
			logger.info(`Found \x1b[34m${virtualFolders.length}\x1b[0m virtual folders. Skipping creation.`);
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
			connectToMongoDB(), // Assuming this handles its own retries/errors
			loadAdapters() // Handles its own errors and throws if fails
		]);
		isConnected = true; // Mark connected after DB connection succeeds
		logger.debug('Database connected and adapters loaded.');

		// Check if adapters loaded correctly (loadAdapters throws on critical failure)
		if (!dbAdapter || !authAdapter) {
			throw new Error('Database or Authentication adapter failed to load.');
		}

		// 2. Setup Core Database Models (Essential for subsequent steps)
		logger.debug('Setting up core database models...');
		// Initialize database models
		await dbAdapter.setupAuthModels();
		await dbAdapter.setupMediaModels();
		await dbAdapter.setupWidgetModels(); // Widgets might be needed by collections
		logger.debug('Core models setup complete.');

		// 3. Initialize File System & Basic DB Entries (Can run partly concurrently)
		logger.debug('Initializing file system structure and default DB entries...');
		await Promise.all([
			initializeMediaFolder(),
			initializeDefaultTheme(), // Uses dbAdapter
			initializeVirtualFolders(), // Uses dbAdapter
			initializeRevisions(), // Uses dbAdapter
			syncPermissions() // Synchronize permissions with code definition
		]);
		logger.debug('File system and default entries initialized.');

		// 4. Initialize Content Manager (This is now done in hooks.server.ts AFTER dbInitPromise resolves)
		// logger.debug('Initializing Content Manager...');
		// await contentManager.initialize(); // MOVED TO hooks.server.ts
		// logger.debug('Content Manager initialized successfully.');

		// 5. Initialize Authentication System
		logger.debug('Initializing Authentication system...');
		auth = new Auth(authAdapter);
		logger.debug('Authentication system initialized.');

		// 6. Finalization
		isInitialized = true;
		logger.info('SvelteCMS System Initialization Completed Successfully.');
	} catch (err) {
		const message = `System Initialization Failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { stack: err instanceof Error ? err.stack : undefined });

		// Reset state on failure
		isInitialized = false;
		isConnected = false; // May or may not be connected, safer to assume not.
		dbAdapter = null;
		authAdapter = null;
		auth = null;
		adaptersLoaded = false;
		initializationPromise = null; // Allow retrying initialization if applicable
		// Propagate the error; the application likely cannot run.
		// Consider whether to throw error() for SvelteKit or just throw Error
		throw new Error(message); // Throw standard error to stop server startup potentially
	}
}

// Singleton Initialization Execution
if (!initializationPromise) {
	logger.debug('Creating system initialization promise.');
	initializationPromise = initializeSystem();

	// initializeSystem Catch any errors that might be caught
	initializationPromise.catch(() => {
		logger.error(`The main initializationPromise was rejected. See previous errors for details.`);
		// Ensure promise variable is cleared so retries might be possible if the app handles it
		initializationPromise = null;
	});
} else {
	logger.debug('Initialization promise already exists.');
}

// --- Full System Ready Promise (including ContentManager) ---

// This function ensures ContentManager initializes *after* the core DB/Auth setup
async function initializeFullSystem(): Promise<void> {
	try {
		// Wait for the core DB/Auth adapters and setup to complete
		await initializationPromise; // Wait for the original promise
		logger.debug('Core system initialized (dbInitPromise resolved). Now initializing ContentManager...');

		// Now initialize the Content Manager
		await contentManager.initialize();
		logger.info('ContentManager initialized as part of full system startup.');
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
	logger.debug('Creating full system ready promise.');
	fullSystemPromise = initializeFullSystem();
	fullSystemPromise.catch(() => {
		logger.error('The fullSystemReadyPromise was rejected. See previous errors.');
		fullSystemPromise = null; // Allow potential retry?
	});
}

// Export the promises so other modules can wait
// dbInitPromise: Resolves when DB connection and core adapters/models are ready
// fullSystemReadyPromise: Resolves when dbInitPromise is done AND ContentManager is initialized
export { initializationPromise as dbInitPromise, fullSystemPromise as fullSystemReadyPromise };
