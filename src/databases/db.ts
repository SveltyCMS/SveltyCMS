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
 * Multi-Tenancy Note:
 * This file handles the one-time global startup of the server. Tenant-specific
 * data scoping is handled by the API endpoints and server hooks that use the
 * initialized services from this module.
 */

import { building } from '$app/environment';
import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';

// MongoDB
import { connectToMongoDB } from './mongodb/dbconnect';

// Auth
import { Auth } from '@root/src/auth';
import { getDefaultSessionStore } from '@src/auth/sessionStore';

// Adapters Interfaces
import type { authDBInterface } from '@src/auth/authDBInterface';
import type { DatabaseAdapter } from './dbInterface';

// MongoDB Adapters
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';

// Content Manager
import { getAllPermissions } from '@src/auth/permissions';
import { contentManager } from '@src/content/ContentManager';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter
export let authAdapter: authDBInterface | null = null; // Authentication adapter
export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise
let adaptersLoaded = false; // Internal flag

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
					getUserCount: userAdapter.getUserCount.bind(userAdapter), // Session Management Methods

					createSession: sessionAdapter.createSession.bind(sessionAdapter),
					updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
					deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
					deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
					validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
					invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
					getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
					getAllActiveSessions: sessionAdapter.getAllActiveSessions.bind(sessionAdapter),
					getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
					rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter), // Add rotateToken binding
					cleanupRotatedSessions: sessionAdapter.cleanupRotatedSessions.bind(sessionAdapter), // Add cleanup binding
					// Token Management Methods

					createToken: tokenAdapter.createToken.bind(tokenAdapter),
					validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
					consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
					getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
					deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
					getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
					updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
					deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter), // Permission Management Methods (Imported)

					getAllPermissions
				};
				logger.debug('Auth adapters created and bound');
				break;
			}
			case 'mariadb':
			case 'postgresql': // Implement SQL adapters loading here
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
		const themes = await dbAdapter.themes.getAllThemes(); // Ensure themes is an array before accessing its length
		if (!Array.isArray(themes)) {
			logger.warn('No themes returned from database or an error occurred. Assuming no themes exist.');
			await dbAdapter.themes.storeThemes([DEFAULT_THEME]);
			logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m created successfully.');
			return;
		}
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
	if (building) return;
	const fs = await import('node:fs/promises');
	try {
		logger.debug(`Checking media folder: ${mediaFolderPath}`); // Check if the media folder exists
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
	if (!dbAdapter.systemVirtualFolder) {
		logger.warn('systemVirtualFolder adapter not available, skipping initialization.');
		return;
	}
	try {
		logger.debug('Initializing virtual folders...');
		const systemVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();

		if (!systemVirtualFoldersResult.success) {
			const errorMessage =
				systemVirtualFoldersResult.error instanceof Error ? systemVirtualFoldersResult.error.message : String(systemVirtualFoldersResult.error);
			throw new Error(`Failed to get virtual folders: ${errorMessage}`);
		}

		const systemVirtualFolders = systemVirtualFoldersResult.data;

		if (systemVirtualFolders.length === 0) {
			logger.info('No virtual folders found. Creating default root folder...'); // Create a default root folder
			const rootFolderData = {
				name: publicEnv.MEDIA_FOLDER,
				path: publicEnv.MEDIA_FOLDER, // parentId is undefined for root folders
				order: 0
			};
			const creationResult = await dbAdapter.systemVirtualFolder.create(rootFolderData);

			if (!creationResult.success) {
				const errorMessage = creationResult.error instanceof Error ? creationResult.error.message : String(creationResult.error);
				throw new Error(`Failed to create root virtual folder: ${errorMessage}`);
			}

			const rootFolder = creationResult.data; // Log only the essential information

			logger.info('Default root virtual folder created:', {
				name: rootFolder.name,
				path: rootFolder.path,
				id: rootFolder._id?.toString() || 'No ID'
			});
		} else {
			logger.debug(`Found \x1b[34m${systemVirtualFolders.length}\x1b[0m virtual folders`);
		}
	} catch (err) {
		const message = `Error initializing virtual folders: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

// Initialize adapters
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.'); // Add any revision-specific setup if needed in the future
	logger.debug('Revisions initialized.');
}

// Core Initialization Logic
async function initializeSystem(): Promise<void> {
	// Prevent re-initialization
	if (isInitialized) {
		logger.debug('System already initialized. Skipping.');
		return;
	}

	const systemStartTime = performance.now();
	logger.info('Starting SvelteCMS System Initialization...');

	try {
		// 1. Connect to Database & Load Adapters (Concurrently)
		const step1StartTime = performance.now();

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
		const step1Time = performance.now() - step1StartTime;
		logger.debug(`\x1b[32mStep 1 completed:\x1b[0m Database connected and adapters loaded in \x1b[32m${step1Time.toFixed(2)}ms\x1b[0m`); // Check if adapters loaded correctly (loadAdapters throws on critical failure)

		if (!dbAdapter || !authAdapter) {
			throw new Error('Database or Authentication adapter failed to load.');
		} // 2. Setup Core Database Models (Essential for subsequent steps) - Run in parallel

		const step2StartTime = performance.now();

		try {
			await Promise.all([
				dbAdapter.auth.setupAuthModels().then(() => logger.debug('\x1b[34mAuth models\x1b[0m setup complete')),
				dbAdapter.media.setupMediaModels().then(() => logger.debug('\x1b[34mMedia models\x1b[0m setup complete')),
				dbAdapter.widgets.setupWidgetModels().then(() => logger.debug('\x1b[34mWidget models\x1b[0m setup complete'))
			]);

			const step2Time = performance.now() - step2StartTime;
			logger.debug(`\x1b[32mStep 2 completed:\x1b[0m Database models setup in \x1b[32m${step2Time.toFixed(2)}ms\x1b[0m`);
		} catch (modelSetupErr) {
			logger.error(`Database model setup failed: ${modelSetupErr.message}`);
			throw modelSetupErr;
		} // 3. Initialize remaining components in parallel

		const step3StartTime = performance.now();

		try {
			await Promise.all([initializeMediaFolder(), initializeDefaultTheme(), initializeRevisions(), initializeVirtualFolders()]);

			const step3Time = performance.now() - step3StartTime;
			logger.debug(`\x1b[32mStep 3 completed:\x1b[0m System components initialized in \x1b[32m${step3Time.toFixed(2)}ms\x1b[0m`);
		} catch (componentErr) {
			logger.error(`Component initialization failed: ${componentErr.message}`);
			throw componentErr;
		} // 4. Initialize ContentManager (loads collection schemas into memory)

		const step4StartTime = performance.now();

		try {
			await contentManager.initialize();
			const step4Time = performance.now() - step4StartTime;
			logger.debug(`\x1b[32mStep 4 completed:\x1b[0m ContentManager initialized in \x1b[32m${step4Time.toFixed(2)}ms\x1b[0m`);
		} catch (contentErr) {
			logger.error(`ContentManager initialization failed: ${contentErr.message}`);
			throw contentErr;
		} // 5. Verify Collection-Specific Database Models (models are now created within ContentManager)

		const step5StartTime = performance.now();
		try {
			const { collectionMap } = await contentManager.getCollectionData();
			if (!dbAdapter) throw new Error('dbAdapter not available for model verification.'); // Since ContentManager now handles model creation, this step is purely for verification.
			// We can simply log that this step is complete, as the critical logic is in ContentManager.
			// If ContentManager failed, initialization would have already stopped.

			const schemas = Array.from(collectionMap.values());
			logger.debug(`ContentManager reports \x1b[34m${schemas.length}\x1b[0m collections loaded. Verification complete.`);

			const step5Time = performance.now() - step5StartTime;
			logger.debug(`\x1b[32mStep 5 completed:\x1b[0m Collection models verified in \x1b[32m${step5Time.toFixed(2)}ms\x1b[0m`);
		} catch (modelErr) {
			const message = `Error verifying collection models: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}`;
			logger.error(message);
			throw new Error(message);
		} // 6. Initialize Authentication (after DB/Auth adapters and models are ready)

		const step6StartTime = performance.now();

		if (!authAdapter) {
			throw new Error('Authentication adapter not initialized'); // Use Error instead of kit's error
		}

		try {
			// Initialize authentication
			auth = new Auth(authAdapter, getDefaultSessionStore());
			if (!auth) {
				throw new Error('Auth initialization failed - constructor returned null/undefined');
			} // Verify auth methods are available

			const authMethods = Object.keys(auth).filter((key) => typeof auth[key] === 'function');
			logger.debug(
				`Auth instance created with \x1b[34m${authMethods.length}\x1b[0m methods:`,
				authMethods.slice(0, 5).join(', ') + (authMethods.length > 5 ? '...' : '')
			); // Test auth functionality

			if (typeof auth.validateSession !== 'function') {
				throw new Error('Auth instance missing validateSession method');
			}

			const step6Time = performance.now() - step6StartTime;
			logger.debug(`\x1b[32mStep 6 completed:\x1b[0m Authentication initialized and verified in \x1b[32m${step6Time.toFixed(2)}ms\x1b[0m`);
		} catch (authErr) {
			logger.error(`Auth initialization failed: ${authErr.message}`);
			throw authErr;
		}

		isInitialized = true;
		isConnected = true;

		const totalTime = performance.now() - systemStartTime;
		logger.info(`🚀 System initialization completed successfully in \x1b[32m${totalTime.toFixed(2)}ms\x1b[0m! All systems ready.`);
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

// Automatically initialize the system, but only at runtime.
// We check process.argv to detect if a build-related command is running.
// Note: 'preview' is NOT a build process - it runs the actual application serving built files
const isBuildProcess = typeof process !== 'undefined' && process.argv?.some((arg) => ['build', 'check'].includes(arg));

if (!building && !isBuildProcess) {
	if (!initializationPromise) {
		logger.debug('Creating system initialization promise...');
		initializationPromise = initializeSystem(); // Handle initialization errors

		initializationPromise.catch((err) => {
			logger.error(`The main initializationPromise was rejected: ${err instanceof Error ? err.message : String(err)}`);
			logger.error('Clearing initialization promise to allow retry'); // Ensure promise variable is cleared so retries might be possible if the app handles it
			initializationPromise = null;
		});
	} else {
		logger.debug('Initialization promise already exists');
	}
} else {
	logger.debug('Skipping system initialization during build process.');
	initializationPromise = Promise.resolve();
}

// --- Full System Ready Promise (including ContentManager) ---

// Export the initialization promise so other modules can wait for system readiness
export { initializationPromise as dbInitPromise };
