/**
 * @file src/databases/db.ts
 * @description Database and authentication initialization and management module.
 *
 * This module handles:
 * - Loading of database and authentication adapters based on the configured DB_TYPE
 * - Database connection with retry mechanism
 * - Initialization of auth models, media models, and collection models
 * - Setup of default roles and permissions
 * - Google OAuth2 client setup
 *
 * Features:
 * - Dynamic adapter loading for different database types (MongoDB, MariaDB, PostgreSQL)
 * - Retry mechanism for database connection
 * - Initialization state management to prevent redundant setups
 * - Asynchronous initialization with promise-based error handling
 * - Collection models management
 * - Google OAuth2 client configuration (when credentials are provided)
 *
 * Usage:
 * This module is typically imported and used in the application's startup process
 * to ensure database and authentication systems are properly initialized before
 * handling requests.
 */

import { dev } from '$app/environment';
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

// Auth
import { Auth } from '@src/auth';
import { getCollections, updateCollections } from '@src/collections';
import { setLoadedRolesAndPermissions } from '@src/auth/types';

// Adapters Interfaces
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';
import { initializeDefaultRolesAndPermissions } from '@src/auth/initializeRolesAndPermissions';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { RoleAdapter } from '@src/auth/mongoDBAuth/roleAdapter';
import { PermissionAdapter } from '@src/auth/mongoDBAuth/permissionAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// Drizzle Adapters
// import { DrizzleAuthAdapter } from '@src/auth/drizzelDBAuth/drizzleAuthAdapter';

// System Logs
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
			const { MongoDBAdapter } = await import('./mongoDBAdapter');
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
				createUser: userAdapter.createUser.bind(userAdapter),
				updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
				deleteUser: userAdapter.deleteUser.bind(userAdapter),
				getUserById: userAdapter.getUserById.bind(userAdapter),
				getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
				getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
				getUserCount: userAdapter.getUserCount.bind(userAdapter),
				createRole: roleAdapter.createRole.bind(roleAdapter),
				updateRole: roleAdapter.updateRole.bind(roleAdapter),
				deleteRole: roleAdapter.deleteRole.bind(roleAdapter),
				getRoleById: roleAdapter.getRoleById.bind(roleAdapter),
				getAllRoles: roleAdapter.getAllRoles.bind(roleAdapter),
				getRoleByName: roleAdapter.getRoleByName.bind(roleAdapter),
				createPermission: permissionAdapter.createPermission.bind(permissionAdapter),
				updatePermission: permissionAdapter.updatePermission.bind(permissionAdapter),
				deletePermission: permissionAdapter.deletePermission.bind(permissionAdapter),
				getPermissionById: permissionAdapter.getPermissionById.bind(permissionAdapter),
				getAllPermissions: permissionAdapter.getAllPermissions.bind(permissionAdapter),
				getPermissionByName: permissionAdapter.getPermissionByName.bind(permissionAdapter),
				createSession: sessionAdapter.createSession.bind(sessionAdapter),
				updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
				destroySession: sessionAdapter.destroySession.bind(sessionAdapter),
				validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
				createToken: tokenAdapter.createToken.bind(tokenAdapter),
				validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
				consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
				assignPermissionToRole: roleAdapter.assignPermissionToRole.bind(roleAdapter),
				removePermissionFromRole: roleAdapter.removePermissionFromRole.bind(roleAdapter),
				getPermissionsForRole: roleAdapter.getPermissionsForRole.bind(roleAdapter),
				getRolesForPermission: roleAdapter.getRolesForPermission.bind(roleAdapter),
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
				initializeDefaultRolesAndPermissions: roleAdapter.initializeDefaultRoles.bind(roleAdapter),
				deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
				invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
				getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
				getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
				deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter)
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

	logger.info(`Trying to connect to your defined ${privateEnv.DB_NAME} database ...`);

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			await dbAdapter.connect();
			logger.info(`Connection to ${privateEnv.DB_NAME} database successful!`);
			return;
		} catch (error) {
			logger.error(`Error connecting to database (attempt ${attempt}/${retries}): ${(error as Error).message}`, { error });
			if (attempt < retries) {
				logger.info(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			} else {
				throw new Error('Failed to connect to the database after maximum retries');
			}
		}
	}
}

// Initialize Theme
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
		// Connect to the database
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

		if (!authAdapter) {
			throw new Error('Authentication adapter not initialized');
		}

		auth = new Auth(authAdapter);
		logger.debug('Authentication adapter initialized.');

		try {
			// Initialize default roles and permissions if needed
			await initializeDefaultRolesAndPermissions(authAdapter);
			logger.info('Default roles and permissions initialized.');
		} catch (error) {
			logger.error(`Error initializing default roles and permissions: ${(error as Error).message}`, { error });
		}

		try {
			const [roles, permissions] = await Promise.all([authAdapter.getAllRoles(), authAdapter.getAllPermissions()]);
			setLoadedRolesAndPermissions({ roles, permissions });
			logger.info('Roles and permissions loaded.');
		} catch (error) {
			logger.error(`Error loading roles and permissions: ${(error as Error).message}`, { error });
		}

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
