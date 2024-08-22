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
 * - **Dynamic Adapter Loading:** Supports MongoDB and SQL-based adapters (MariaDB, PostgreSQL) with dynamic import.
 * - **Database Connection:** Implements a retry mechanism to handle connection failures and attempts reconnections.
 * - **Initialization Management:** Manages initialization state to prevent redundant setup processes. Asynchronous initialization with promise-based error handling.
 * - **Theme Initialization:** Handles default theme setup and ensures it's marked as default if not already.
 * - **Authentication and Authorization:** Configures and initializes authentication adapters, including user, role, permission, session, and token management.
 * - **Google OAuth2 Integration:** Optionally sets up Google OAuth2 client if the client ID and secret are provided.
 *
 * Usage:
 * This module is typically imported and utilized in the startup phase of the application to ensure that database and authentication systems
 * are properly set up and ready to handle incoming requests.
 */

import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import { browser } from '$app/environment';

// Auth
import { Auth } from '@src/auth';
import { getCollections, updateCollections } from '@src/collections';

// Adapters Interfaces
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { RoleAdapter } from '@src/auth/mongoDBAuth/roleAdapter';
import { PermissionAdapter } from '@src/auth/permissionAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// Drizzle Adapters (Commented out for future implementation)
// import { DrizzleAuthAdapter } from '@src/auth/drizzelDBAuth/drizzleAuthAdapter';

// System Logger
import logger from '@src/utils/logger';

// Database and authentication adapters
let dbAdapter: dbInterface | null = null;
let authAdapter: authDBInterface | null = null;
let auth: Auth | null = null;

const MAX_RETRIES = 5; // Maximum number of DB connection retries
const RETRY_DELAY = 5000; // 5 seconds

let initializationPromise: Promise<void> | null = null;
// Flag to track initialization status
let isInitialized = false;

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

// Load database and authentication adapters
async function loadAdapters() {
	try {
		logger.debug(`Loading ${privateEnv.DB_TYPE} adapters...`);

		if (privateEnv.DB_TYPE === 'mongodb') {
			const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');
			dbAdapter = new MongoDBAdapter();
			const userAdapter = new UserAdapter();
			const roleAdapter = new RoleAdapter();
			const permissionAdapter = new PermissionAdapter();
			const sessionAdapter = new SessionAdapter();
			const tokenAdapter = new TokenAdapter();

			authAdapter = {
				...userAdapter,
				...roleAdapter,
				...permissionAdapter,
				...sessionAdapter,
				...tokenAdapter,
				// Bind all methods explicitly

				// User Management Methods
				createUser: userAdapter.createUser.bind(userAdapter),
				updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
				addUser: userAdapter.addUser.bind(userAdapter),
				deleteUser: userAdapter.deleteUser.bind(userAdapter),
				changePassword: userAdapter.changePassword.bind(userAdapter),
				blockUser: userAdapter.blockUser.bind(userAdapter),
				unblockUser: userAdapter.unblockUser.bind(userAdapter),
				getUserById: userAdapter.getUserById.bind(userAdapter),
				getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
				getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
				getUserCount: userAdapter.getUserCount.bind(userAdapter),
				getRecentUserActivities: userAdapter.getRecentUserActivities.bind(userAdapter),

				// Session Management Methods
				createSession: sessionAdapter.createSession.bind(sessionAdapter),
				updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
				destroySession: sessionAdapter.destroySession.bind(sessionAdapter),
				validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
				deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
				invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
				getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),

				// Token Management Methods
				createToken: tokenAdapter.createToken.bind(tokenAdapter),
				validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
				consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
				getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
				deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),

				// Role Management Methods
				createRole: roleAdapter.createRole.bind(roleAdapter),
				updateRole: roleAdapter.updateRole.bind(roleAdapter),
				deleteRole: roleAdapter.deleteRole.bind(roleAdapter),
				getRoleById: roleAdapter.getRoleById.bind(roleAdapter),
				getAllRoles: roleAdapter.getAllRoles.bind(roleAdapter),
				getRoleByName: roleAdapter.getRoleByName.bind(roleAdapter),

				// Permission Management Methods
				createPermission: permissionAdapter.createPermission.bind(permissionAdapter),
				updatePermission: permissionAdapter.updatePermission.bind(permissionAdapter),
				deletePermission: permissionAdapter.deletePermission.bind(permissionAdapter),
				getPermissionById: permissionAdapter.getPermissionById.bind(permissionAdapter),
				getAllPermissions: permissionAdapter.getAllPermissions.bind(permissionAdapter),
				getPermissionByName: permissionAdapter.getPermissionByName.bind(permissionAdapter),

				// Role-Permissions Linking Methods
				assignPermissionToRole: roleAdapter.assignPermissionToRole.bind(roleAdapter),
				removePermissionFromRole: roleAdapter.removePermissionFromRole.bind(roleAdapter),
				getPermissionsForRole: roleAdapter.getPermissionsForRole.bind(roleAdapter),
				getRolesForPermission: roleAdapter.getRolesForPermission.bind(roleAdapter),

				// User-Specific Permissions Methods
				assignPermissionToUser: userAdapter.assignPermissionToUser.bind(userAdapter),
				removePermissionFromUser: userAdapter.removePermissionFromUser.bind(userAdapter),
				getPermissionsForUser: userAdapter.getPermissionsForUser.bind(userAdapter),
				getUsersWithPermission: userAdapter.getUsersWithPermission.bind(userAdapter),
				assignRoleToUser: userAdapter.assignRoleToUser.bind(userAdapter),
				removeRoleFromUser: userAdapter.removeRoleFromUser.bind(userAdapter),
				getRolesForUser: userAdapter.getRolesForUser.bind(userAdapter),
				getUsersWithRole: roleAdapter.getUsersWithRole.bind(roleAdapter),
				checkUserPermission: userAdapter.checkUserPermission.bind(userAdapter),
				checkUserRole: userAdapter.checkUserRole.bind(userAdapter),

				// Sync Methods
				syncRolesWithConfig: roleAdapter.syncRolesWithConfig.bind(roleAdapter),
				syncPermissionsWithConfig: permissionAdapter.syncPermissionsWithConfig.bind(permissionAdapter)
			} as authDBInterface;

			logger.info('MongoDB adapters loaded successfully.');
		} else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
			logger.debug('Implement & Loading SQL adapters...');
			// Implement SQL adapters loading here
			// const [{ DrizzleDBAdapter }, { DrizzleAuthAdapter }] = await Promise.all([
			// 	import('./drizzleDBAdapter'),
			// 	import('@src/auth/drizzelDBAuth/drizzleAuthAdapter')
			// ]);
			// dbAdapter = new DrizzleDBAdapter();
			// authAdapter = new DrizzleAuthAdapter();
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
		throw new Error('Database adapter not initialized');
	}

	// Message for connecting to the database
	logger.info(`\x1b[33m\x1b[5mTrying to connect to your defined ${privateEnv.DB_NAME} database ...\x1b[0m`);

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await dbAdapter.connect();
			// Message for successful connection
			logger.info(`\x1b[32mConnection to ${privateEnv.DB_NAME} database successful!\x1b[0m ===> Enjoying your \x1b[31m${publicEnv.SITE_NAME}\x1b[0m`);
			return;
		} catch (error) {
			// Message for connection error
			logger.error(`\x1b[31m Error connecting to database:\x1b[0m (attempt ${attempt}/${retries}): ${(error as Error).message}`, { error });
			if (attempt < retries) {
				logger.info(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			} else {
				throw new Error('Failed to connect to the database after maximum retries');
			}
		}
	}
}

// Initialize default theme
async function initializeDefaultTheme(dbAdapter: dbInterface): Promise<void> {
	try {
		logger.debug('Initializing default theme...');
		const themes = await dbAdapter.getAllThemes();
		logger.debug(`Found ${themes.length} themes`);

		if (themes.length === 0) {
			// If no themes exist, create the default SveltyCMS theme
			await dbAdapter.storeThemes([DEFAULT_THEME]);
			logger.info('Default SveltyCMS theme created successfully.');
		} else {
			// Check if SveltyCMS Theme exists
			const sveltyCMSTheme = themes.find((theme) => theme.name === DEFAULT_THEME.name);
			if (sveltyCMSTheme) {
				// Check if the theme is already marked as default
				if (!sveltyCMSTheme.isDefault) {
					await dbAdapter.setDefaultTheme(DEFAULT_THEME.name);
					logger.info('SveltyCMS theme set as default.');
				} else {
					logger.info('SveltyCMS theme is already set as default.');
				}
			} else {
				// If SveltyCMS theme doesn't exist, create it
				await dbAdapter.storeThemes([DEFAULT_THEME]);
				logger.info('SveltyCMS theme created and set as default.');
			}
		}
	} catch (error) {
		logger.error(`Error initializing default theme: ${(error as Error).message}`);
		throw new Error(`Error initializing default theme: ${(error as Error).message}`);
	}
}

// Initialize adapters
async function initializeAdapters(): Promise<void> {
	if (isInitialized) {
		logger.debug('Adapters already initialized, skipping initialization.');
		return;
	}

	try {
		// Load database and authentication adapters
		await loadAdapters();

		if (!browser) {
			// Connect to the database only on the server
			await connectToDatabase();

			// Initialize collections and models
			await updateCollections();
			const collections = await getCollections();

			if (Object.keys(collections).length === 0) {
				throw new Error('No collections found after initialization');
			}

			if (!dbAdapter) {
				throw new Error('Database adapter not initialized');
			}

			// Initialize default theme
			await initializeDefaultTheme(dbAdapter);
			// Setup auth models and media models
			await dbAdapter.setupAuthModels();
			await dbAdapter.setupMediaModels();
			await dbAdapter.getCollectionModels();
		}

		if (!authAdapter) {
			throw new Error('Authentication adapter not initialized');
		}

		auth = new Auth(authAdapter);
		logger.debug('Authentication adapter initialized.');

		isInitialized = true;
		logger.info('Adapters initialized successfully');
	} catch (error) {
		logger.error(`Error initializing adapters: ${(error as Error).message}`, { error });
		initializationPromise = null;
		throw error;
	}
}

// Initialize the adapter
initializationPromise = initializeAdapters()
	.then(() => logger.debug('Initialization completed successfully.'))
	.catch((error) => {
		logger.error(`Initialization promise rejected with error: ${(error as Error).message}`, { error });
		initializationPromise = null;
	});

// Export collections
const collectionsModels: { [key: string]: any } = {};

// Export collections
export async function getCollectionModels() {
	if (!dbAdapter) {
		throw new Error('Database adapter not initialized');
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

// Google OAuth
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
	} else {
		logger.warn('Google client ID and secret not provided. Google OAuth will not be available.');
		return null;
	}
}

// Export functions
export { collectionsModels, auth, googleAuth, initializationPromise, dbAdapter, authAdapter };
