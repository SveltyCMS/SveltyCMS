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
 * Multi-Tenancy Note:
 * This file handles the one-time global startup of the server. Tenant-specific
 * data scoping is handled by the API endpoints and server hooks that use the
 * initialized services from this module.
 */

import { building } from '$app/environment';

// Handle private config that might not exist during setup
let privateEnv: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

// Function to load private config when needed
async function loadPrivateConfig(forceReload = false) {
	if (privateEnv && !forceReload) return privateEnv;

	try {
		logger.debug('Loading \x1b[34m/config/private.ts\x1b[0m configuration...');
		const module = await import('@root/config/private');
		privateEnv = module.privateEnv;
		logger.debug('Private config loaded successfully', {
			hasConfig: !!privateEnv,
			dbType: privateEnv?.DB_TYPE,
			dbHost: privateEnv?.DB_HOST ? '***' : 'missing'
		});
		return privateEnv;
	} catch (error) {
		// Private config doesn't exist during setup - this is expected
		logger.trace('Private config not found during setup - this is expected during initial setup', {
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

// Function to clear private config cache (used after setup completion)
export function clearPrivateConfigCache(keepPrivateEnv = false) {
	logger.debug('Clearing private config cache and initialization promises', {
		keepPrivateEnv,
		hadPrivateEnv: !!privateEnv
	});
	if (!keepPrivateEnv) {
		privateEnv = null;
	}
	adaptersLoaded = false;
	_dbInitPromise = null;
	initializationPromise = null;
	logger.debug('Private config cache and initialization promises cleared', {
		privateEnvCleared: !keepPrivateEnv
	});
}

// Auth
import { Auth } from '@src/databases/auth';
import { getDefaultSessionStore } from '@src/databases/auth/sessionManager';

// Adapters Interfaces
import type { DatabaseAdapter } from './dbInterface';

// Settings loader
import { privateConfigSchema, publicConfigSchema } from '@src/databases/schemas';
import { invalidateSettingsCache, setSettingsCache } from '@src/services/settingsService';
import { safeParse } from 'valibot';

// Theme
import { DEFAULT_THEME, ThemeManager } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// System State Management
import { setSystemState, updateServiceHealth, waitForServiceHealthy } from '@src/stores/system';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter

export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

// Create a proper Promise for lazy initialization
let _dbInitPromise: Promise<void> | null = null;
export function getDbInitPromise(forceInit = false): Promise<void> {
	if (!_dbInitPromise || forceInit) {
		_dbInitPromise = initializeOnRequest(forceInit);
	}
	return _dbInitPromise;
}
// Export a real Promise that will be initialized on first access
export const dbInitPromise = getDbInitPromise();
let adaptersLoaded = false; // Internal flag

/**
 * Loads all settings from the database and populates the in-memory cache.
 * This function should only be called from a server-side context.
 */
// Extract setting keys directly from schemas (single source of truth)
// These are cached to avoid rebuilding arrays on every call

// Infrastructure keys that come from config file, not database
const INFRASTRUCTURE_KEYS = new Set([
	'DB_TYPE',
	'DB_HOST',
	'DB_PORT',
	'DB_NAME',
	'DB_USER',
	'DB_PASSWORD',
	'DB_RETRY_ATTEMPTS',
	'DB_RETRY_DELAY',
	'DB_POOL_SIZE',
	'JWT_SECRET_KEY',
	'ENCRYPTION_KEY',
	'MULTI_TENANT'
]);

const KNOWN_PUBLIC_KEYS = Object.keys(publicConfigSchema.entries);
const KNOWN_PRIVATE_KEYS = Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key));

export async function loadSettingsFromDB() {
	try {
		// logger.debug('Loading settings from database...');

		// Check if database adapter is available
		if (!dbAdapter || !dbAdapter.systemPreferences) {
			logger.warn('Database adapter not available during settings load. Using empty cache.');
			await invalidateSettingsCache();
			return;
		}

		// 🚀 OPTIMIZATION: Load both public and private settings in parallel (not sequential)
		const [settingsResult, privateDynResult] = await Promise.all([
			dbAdapter.systemPreferences.getMany(KNOWN_PUBLIC_KEYS, 'system'),
			dbAdapter.systemPreferences.getMany(KNOWN_PRIVATE_KEYS, 'system')
		]);

		if (!settingsResult.success) {
			logger.error('Failed to load settings from database:', settingsResult.error);
			logger.error('Settings keys attempted:', KNOWN_PUBLIC_KEYS);
			logger.error('Database adapter status:', {
				hasAdapter: !!dbAdapter,
				hasSystemPrefs: !!dbAdapter?.systemPreferences,
				hasGetMany: !!dbAdapter?.systemPreferences?.getMany
			});
			throw new Error(`Could not load settings from DB: ${settingsResult.error?.message || 'Unknown error'}`);
		}

		const settings = settingsResult.data || {};
		const privateDynamic = privateDynResult.success ? privateDynResult.data || {} : {};

		// If no settings exist (initial setup), use empty objects and skip validation
		if (Object.keys(settings).length === 0) {
			logger.info('No settings found in database (initial setup). Using empty cache.');
			// During initial setup, bypass validation by calling invalidateSettingsCache
			// which sets empty cache without validation
			await invalidateSettingsCache();
			return;
		}

		// All system settings are public in the current implementation
		const publicSettings: Record<string, unknown> = settings;
		const databasePrivateSettings: Record<string, unknown> = {};

		// Import private config file settings (infrastructure settings)
		const { privateEnv } = await import('@root/config/private');

		// Merge private config file settings with database private settings
		// Private config contains infrastructure settings (DB_*, JWT_*, ENCRYPTION_*)
		// Database contains application private settings (SMTP_*, GOOGLE_*, etc.)
		const privateSettings = {
			...privateEnv, // Infrastructure settings from config file
			...databasePrivateSettings // Application settings from database
		};

		// Validate and parse the settings against the schemas
		const parsedPublic = safeParse(publicConfigSchema, publicSettings);
		const parsedPrivate = safeParse(privateConfigSchema, privateSettings);

		// If validation fails, it might be during setup with incomplete settings
		// In this case, just use empty cache to allow setup to continue
		if (!parsedPublic.success || !parsedPrivate.success) {
			logger.debug('Settings validation failed during startup - likely first run or setup mode');
			if (!parsedPublic.success) {
				logger.debug('Public settings validation issues:', parsedPublic.issues);
			}
			if (!parsedPrivate.success) {
				logger.debug('Private settings validation issues:', parsedPrivate.issues);
			}

			// Clear invalid settings from database (silent cleanup)
			try {
				logger.debug('Clearing invalid settings from database...');
				if (dbAdapter && dbAdapter.systemPreferences && typeof dbAdapter.systemPreferences.deleteMany === 'function') {
					await dbAdapter.systemPreferences.deleteMany([]);
					logger.debug('Invalid settings cleared successfully');
				}
			} catch (clearError) {
				logger.debug('Failed to clear invalid settings:', clearError);
			}

			await invalidateSettingsCache();
			logger.info('Settings validation failed - system will run with defaults until settings are configured');
			return; // Return without throwing - allow system to continue in setup mode
		}

		// Populate the cache with validated settings, merging dynamic private flags into unified cache
		const mergedPrivate = { ...(parsedPrivate.output as Record<string, unknown>), ...privateDynamic } as Record<string, unknown>;
		await setSettingsCache(mergedPrivate as typeof privateEnv, parsedPublic.output);

		logger.info('✅ System settings loaded and cached from database.');
	} catch (error) {
		logger.error('Failed to load settings from database:', error);
		// Don't throw - invalidate cache and continue with defaults
		await invalidateSettingsCache();
		logger.warn('Settings load failed - system will continue with default configuration');
	}
}

// Load database and authentication adapters
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) {
		logger.debug('Adapters already loaded, skipping');
		return;
	}

	// Use privateEnv if already set (from initializeWithConfig), otherwise load from Vite
	logger.debug('Loading adapters - checking privateEnv', {
		hasPrivateEnv: !!privateEnv,
		dbType: privateEnv?.DB_TYPE
	});

	const config = privateEnv || (await loadPrivateConfig(false));

	// If private config doesn't exist yet (during setup), we can't load adapters
	if (!config || !config.DB_TYPE) {
		logger.debug('Private config not available yet - skipping adapter loading during setup');
		return;
	}

	logger.debug(`🔌 Loading \x1b[34m${config.DB_TYPE}\x1b[0m adapters...`);

	try {
		switch (config.DB_TYPE) {
			case 'mongodb':
			case 'mongodb+srv': {
				logger.debug('Importing MongoDB adapter...');
				const mongoAdapterModule = await import('./mongodb/mongoDBAdapter');
				if (!mongoAdapterModule || !mongoAdapterModule.MongoDBAdapter) {
					throw new Error('MongoDBAdapter is not exported correctly from mongoDBAdapter.ts');
				}
				const { MongoDBAdapter } = mongoAdapterModule;
				dbAdapter = new MongoDBAdapter() as unknown as DatabaseAdapter;

				logger.debug('MongoDB adapter created');
				break;
			}
			default:
				logger.error(`Unsupported DB_TYPE: ${config.DB_TYPE}. Only MongoDB is supported.`);
				throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}. Only MongoDB is currently supported.`);
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
		// 🚀 OPTIMIZATION: Check if theme exists before writing (avoid unnecessary DB operation)
		const existingThemes = await dbAdapter.themes.getAllThemes();
		const themeExists = existingThemes.some((t) => t.name === DEFAULT_THEME.name && t.isDefault);

		if (!themeExists) {
			await dbAdapter.themes.storeThemes([DEFAULT_THEME]);
			logger.debug('Default SveltyCMS theme initialized');
		}
		// Skip logging if theme already exists (save 1-2ms)
	} catch (err) {
		// Log but don't fail - theme initialization is not critical for system startup
		logger.warn(`Theme initialization issue: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Initialize ThemeManager
async function initializeThemeManager(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize ThemeManager: dbAdapter is not available.');
	try {
		logger.debug('Initializing \x1b[34mThemeManager\x1b[0m...');
		const themeManager = ThemeManager.getInstance();
		await themeManager.initialize(dbAdapter);
	} catch (err) {
		const message = `Error initializing ThemeManager: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

// Initialize the media folder
async function initializeMediaFolder(): Promise<void> {
	// During setup, MEDIA_FOLDER might not be loaded yet, so use fallback
	const { getPublicSetting } = await import('@src/services/settingsService');
	const mediaFolderPath = (await getPublicSetting('MEDIA_FOLDER')) || './mediaFolder';
	if (building) return;
	const fs = await import('node:fs/promises');
	try {
		// 🚀 OPTIMIZATION: Fast stat() check, skip debug logging overhead
		await fs.stat(mediaFolderPath);
		// Folder exists, skip logging for speed
	} catch {
		// If the folder does not exist, create it
		logger.info(`Creating media folder: \x1b[34m${mediaFolderPath}\x1b[0m`);
		await fs.mkdir(mediaFolderPath, { recursive: true });
	}
}

// Initialize virtual folders with retry logic
async function initializeVirtualFolders(maxRetries = 3, retryDelay = 1000): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	if (!dbAdapter.systemVirtualFolder) {
		logger.warn('systemVirtualFolder adapter not available, skipping initialization.');
		return;
	}

	let lastError: unknown;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			logger.debug(`Initializing virtual folders (attempt ${attempt}/${maxRetries})...`);

			// Verify the connection is still active before querying
			if (dbAdapter.isConnected && !dbAdapter.isConnected()) {
				throw new Error('Database connection lost - reconnection required');
			}

			const systemVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();

			if (!systemVirtualFoldersResult.success) {
				const error = systemVirtualFoldersResult.error;
				let errorMessage = 'Unknown error';

				if (error instanceof Error) {
					errorMessage = error.message;
				} else if (error && typeof error === 'object' && 'message' in error) {
					errorMessage = String((error as { message: unknown }).message);
				} else if (error) {
					errorMessage = String(error);
				}

				throw new Error(`Failed to get virtual folders: ${errorMessage}`);
			}

			const systemVirtualFolders = systemVirtualFoldersResult.data;

			if (systemVirtualFolders.length === 0) {
				// 🚀 OPTIMIZATION: Streamlined folder creation, minimal logging
				const { getPublicSetting } = await import('@src/services/settingsService');
				const defaultMediaFolder = (await getPublicSetting('MEDIA_FOLDER')) || 'mediaFolder';
				const creationResult = await dbAdapter.systemVirtualFolder.create({
					name: defaultMediaFolder,
					path: defaultMediaFolder,
					order: 0,
					type: 'folder' as const
				});

				if (!creationResult.success) {
					const error = creationResult.error;
					const errorMessage = error instanceof Error ? error.message : String(error);
					throw new Error(`Failed to create root virtual folder: ${errorMessage}`);
				}
				logger.debug(`Created root virtual folder: ${defaultMediaFolder}`);
			}
			// Success - exit fast
			logger.debug(`✅ Virtual folders initialized successfully on attempt ${attempt}`);
			return;
		} catch (err) {
			lastError = err;
			const errorMsg = err instanceof Error ? err.message : String(err);

			if (attempt < maxRetries) {
				logger.warn(`Virtual folder initialization failed (attempt ${attempt}/${maxRetries}): ${errorMsg}`);
				logger.warn(`Retrying in ${retryDelay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));
				// Exponential backoff
				retryDelay *= 2;
			} else {
				logger.error(`Virtual folder initialization failed after ${maxRetries} attempts: ${errorMsg}`);
			}
		}
	}

	// All retries exhausted
	const message = `Error initializing virtual folders after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`;
	logger.error(message);
	throw new Error(message);
}

// Initialize adapters (instant validation only)
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.');
	// 🚀 OPTIMIZATION: Instant no-op validation (revisions are lazy-loaded on first use)
}

// Core Initialization Logic
async function initializeSystem(forceReload = false, skipSetupCheck = false): Promise<void> {
	// Prevent re-initialization
	if (isInitialized) {
		logger.debug('System already initialized. Skipping.');
		return;
	}

	const systemStartTime = performance.now();
	logger.info('Starting SvelteCMS System Initialization...');

	// Set system state to INITIALIZING
	setSystemState('INITIALIZING', 'Starting system initialization');

	try {
		// Step 1: Check for setup mode (skip if called from initializeWithConfig)
		let privateConfig;
		if (skipSetupCheck) {
			// When called from initializeWithConfig, privateEnv is already set - don't reload
			logger.debug('Skipping private config load - using pre-set configuration');
			privateConfig = privateEnv;
		} else {
			// Normal initialization flow - load from Vite
			privateConfig = await loadPrivateConfig(forceReload);
			if (!privateConfig || !privateConfig.DB_TYPE) {
				logger.info('Private config not available – running in setup mode (skipping full initialization).');
				setSystemState('IDLE', 'Running in setup mode');
				return;
			}
		}

		// Step 2: Load Adapters & Connect to DB
		updateServiceHealth('database', 'initializing', 'Loading database adapter...');
		await loadAdapters();
		if (!dbAdapter) {
			updateServiceHealth('database', 'unhealthy', 'Database adapter failed to load');
			throw new Error('Database adapter failed to load.');
		}

		let connectionString: string;
		if (privateConfig.DB_TYPE === 'mongodb') {
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `mongodb://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}${hasAuth ? '?authSource=admin' : ''}`;
			logger.debug(`Connecting to MongoDB...`);
		} else if (privateConfig.DB_TYPE === 'mongodb+srv') {
			// MongoDB Atlas connection string
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `mongodb+srv://${authPart}${privateConfig.DB_HOST}/${privateConfig.DB_NAME}?retryWrites=true&w=majority`;
			logger.debug(`Connecting to MongoDB Atlas (SRV)...`);
		} else {
			connectionString = '';
		}

		// Run connection + model setup in parallel (overlapping I/O)
		const step2And3StartTime = performance.now();
		const [connectionResult] = await Promise.all([
			dbAdapter.connect(connectionString),
			// Step 3: Setup Core Database Models (runs in parallel with connection)
			// Models can be set up while connection is establishing
			(async () => {
				// Small delay to ensure connection is in progress before model setup
				await new Promise((resolve) => setTimeout(resolve, 10));
				return Promise.all([dbAdapter.media?.setupMediaModels(), dbAdapter.widgets?.setupWidgetModels(), dbAdapter.themes?.setupThemeModels()]);
			})()
		]);

		if (!connectionResult.success) {
			updateServiceHealth(
				'database',
				'unhealthy',
				`Connection failed: ${connectionResult.error?.message || 'Unknown error'}`,
				connectionResult.error?.message
			);
			throw new Error(`Database connection failed: ${connectionResult.error?.message || 'Unknown error'}`);
		}
		isConnected = true;
		updateServiceHealth('database', 'healthy', 'Database connected successfully');

		const step2And3Time = performance.now() - step2And3StartTime;
		logger.info(`\x1b[32mSteps 1-2:\x1b[0m DB connected & adapters loaded in \x1b[32m${step2And3Time.toFixed(2)}ms\x1b[0m`);
		logger.info(`\x1b[32mStep 3:\x1b[0m Database models setup in \x1b[32m${step2And3Time.toFixed(2)}ms\x1b[0m (⚡ parallelized with connection)`);

		// Step 4: Lazy-initialize Server-Side Services (will initialize on first use)
		// WidgetRegistryService and ContentManager are now lazy-loaded for faster startup
		updateServiceHealth('contentManager', 'healthy', 'Will lazy-initialize on first use');
		logger.info('\x1b[32mStep 4:\x1b[0m Server services (Widgets & Content) will lazy-initialize on first use');

		// Step 5: Initialize Critical Components (optimized for speed)
		const step5StartTime = performance.now();

		// Auth (fast, required immediately)
		updateServiceHealth('auth', 'initializing', 'Initializing authentication service...');
		if (!dbAdapter) throw new Error('Database adapter not initialized');
		auth = new Auth(dbAdapter, getDefaultSessionStore());
		if (!auth) {
			updateServiceHealth('auth', 'unhealthy', 'Auth initialization failed');
			throw new Error('Auth initialization failed');
		}
		updateServiceHealth('auth', 'healthy', 'Authentication service ready');
		logger.debug(`✓ Authentication initialized in \x1b[32m${(performance.now() - step5StartTime).toFixed(2)}ms\x1b[0m`);

		// Settings (required for app configuration)
		await loadSettingsFromDB();
		logger.debug(`✓ Settings loaded from DB in \x1b[32m${(performance.now() - step5StartTime).toFixed(2)}ms\x1b[0m`);

		// Run slow I/O operations in parallel
		const parallelStartTime = performance.now();
		updateServiceHealth('cache', 'initializing', 'Initializing media, revisions, and themes...');
		updateServiceHealth('themeManager', 'initializing', 'Initializing theme manager...');

		await Promise.all([
			(async () => {
				const t = performance.now();
				await initializeMediaFolder();
				logger.debug(`  - Media folder: \x1b[32m${(performance.now() - t).toFixed(2)}ms\x1b[0m`);
			})(),
			(async () => {
				const t = performance.now();
				await initializeRevisions();
				logger.debug(`  - Revisions: \x1b[32m${(performance.now() - t).toFixed(2)}ms\x1b[0m`);
			})(),
			(async () => {
				const t = performance.now();
				await initializeVirtualFolders();
				logger.debug(`  - Virtual folders: \x1b[32m${(performance.now() - t).toFixed(2)}ms\x1b[0m`);
			})(),
			(async () => {
				const t = performance.now();
				await initializeDefaultTheme().then(() => initializeThemeManager());
				updateServiceHealth('themeManager', 'healthy', 'Theme manager initialized');
				logger.debug(`  - Themes: \x1b[32m${(performance.now() - t).toFixed(2)}ms\x1b[0m`);
			})()
		]);
		updateServiceHealth('cache', 'healthy', 'Media, revisions, and virtual folders initialized');
		logger.debug(`✓ Parallel I/O operations completed in \x1b[32m${(performance.now() - parallelStartTime).toFixed(2)}ms\x1b[0m`);

		const step5Time = performance.now() - step5StartTime;
		logger.info(`\x1b[32mStep 5:\x1b[0m Critical components initialized in \x1b[32m${step5Time.toFixed(2)}ms\x1b[0m`);
		isInitialized = true;

		// System is now READY - state will be derived automatically from service health
		const totalTime = performance.now() - systemStartTime;
		logger.info(`🚀 System initialization completed successfully in \x1b[32m${totalTime.toFixed(2)}ms\x1b[0m!`);
	} catch (err) {
		const message = `CRITICAL: System initialization failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, err);
		isInitialized = false; // Reset initialization flag on error
		isConnected = false; // Reset connection flag on error
		auth = null; // Reset auth on error
		setSystemState('FAILED', message);
		throw new Error(message);
	}
}

// --- Status & Reinitialization Helpers ---

/**
 * Minimal initialization for setup mode - ONLY connects to database
 * Does NOT initialize any services (auth, themes, content, etc.)
 * Used by setup wizard to perform database operations
 */
export async function initializeForSetup(dbConfig: {
	type: string;
	host: string;
	port: number;
	name: string;
	user?: string;
	password?: string;
}): Promise<{ success: boolean; error?: string }> {
	try {
		logger.info('Initializing minimal database connection for setup mode...');

		// Load the appropriate adapter
		if (!adaptersLoaded) {
			await loadAdapters();
		}

		if (!dbAdapter) {
			return { success: false, error: 'Failed to load database adapter' };
		}

		// Build connection string
		let connectionString: string;
		if (dbConfig.type === 'mongodb') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@` : '';
			connectionString = `mongodb://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}${hasAuth ? '?authSource=admin' : ''}`;
		} else {
			return { success: false, error: `Database type '${dbConfig.type}' not supported yet` };
		}

		// Connect to database
		const connectionResult = await dbAdapter.connect(connectionString);
		if (!connectionResult.success) {
			return { success: false, error: connectionResult.error?.message || 'Connection failed' };
		}

		isConnected = true;
		logger.info('✅ Minimal database connection established for setup');
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('Failed to initialize database for setup:', message);
		return { success: false, error: message };
	}
}

/**
 * Initializes the system on the first non-setup request.
 * This prevents the server from trying to connect to the DB during setup.
 */
export function initializeOnRequest(forceInit = false): Promise<void> {
	const isBuildProcess = typeof process !== 'undefined' && process.argv?.some((arg) => ['build', 'check'].includes(arg));

	if (!building && !isBuildProcess) {
		if (!initializationPromise || forceInit) {
			logger.debug('Creating system initialization promise...');

			initializationPromise = (async () => {
				// Check if private config exists and is valid
				const privateConfig = await loadPrivateConfig(forceInit);
				if (!privateConfig || !privateConfig.DB_TYPE || !privateConfig.DB_HOST) {
					logger.info('Private config not available – skipping initialization (setup mode)');
					return Promise.resolve();
				}

				// Private config exists - run full initialization
				logger.info('Private config found, starting full system initialization');
				return initializeSystem(forceInit);
			})();

			initializationPromise.catch((err) => {
				logger.error(`Initialization failed: ${err instanceof Error ? err.message : String(err)}`);
				logger.error('Clearing initialization promise to allow retry');
				initializationPromise = null;
				_dbInitPromise = null;
			});
		}
	} else if (!initializationPromise) {
		logger.debug('Skipping system initialization during build process.');
		initializationPromise = Promise.resolve();
	}
	return initializationPromise;
}

export function getSystemStatus() {
	return {
		initialized: isInitialized,
		connected: isConnected,
		authReady: !!auth,
		initializing: !!initializationPromise && !isInitialized
	};
}

export function getAuth() {
	return auth;
}

export async function reinitializeSystem(force = false, waitForAuth = true): Promise<{ status: string; error?: string }> {
	if (isInitialized && !force) {
		return { status: 'already-initialized' };
	}

	// If force is true, clear any existing initialization promise and reload config
	if (force) {
		logger.info('Force reinitialization requested - clearing existing initialization promise and reloading config');
		initializationPromise = null;
		isInitialized = false;
		isConnected = false;
		auth = null;
		// Force reload private config
		await loadPrivateConfig(true);
		// Reset system state
		setSystemState('IDLE', 'Preparing for reinitialization');
	}

	if (initializationPromise) {
		return { status: 'initialization-in-progress' };
	}

	try {
		logger.info(`Manual reinitialization requested${force ? ' (force)' : ''}${!waitForAuth ? ' (skip auth wait)' : ''}`);
		initializationPromise = initializeSystem(force);
		await initializationPromise;

		// Optionally wait for auth service to be ready (skip during setup to avoid blocking)
		if (waitForAuth) {
			logger.info('Waiting for auth service to become available after reinitialization...');
			const authReady = await waitForServiceHealthy('auth', 3000); // Reduced from 10s to 3s
			if (!authReady) {
				logger.warn('Auth service not ready after timeout, but will continue');
			}
		} else {
			logger.info('Skipping auth readiness wait (setup mode)');
		}

		return { status: 'initialized' };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// Clear the failed promise so retries are possible
		initializationPromise = null;
		return { status: 'failed', error: message };
	}
}

/**
 * Initialize system by loading private.ts from filesystem (bypasses Vite cache).
 *
 * Use this during setup when private.ts was just created on filesystem but hasn't been
 * loaded by Vite yet due to module caching.
 *
 * @returns Promise with initialization status
 */
export async function initializeWithFreshConfig(): Promise<{ status: string; error?: string }> {
	// Clear any existing initialization
	logger.info('Initializing system with fresh config from filesystem (bypassing Vite cache)...');
	initializationPromise = null;
	isInitialized = false;
	isConnected = false;
	auth = null;
	privateEnv = null; // Clear cache to force reload
	setSystemState('IDLE', 'Preparing for initialization with fresh config');

	try {
		// Force reload private.ts from filesystem (bypasses Vite's module cache)
		const freshConfig = await loadPrivateConfig(true);

		if (!freshConfig || !freshConfig.DB_TYPE) {
			throw new Error('Failed to load private config from filesystem');
		}

		logger.debug('Fresh config loaded from filesystem', {
			DB_TYPE: freshConfig.DB_TYPE,
			DB_HOST: freshConfig.DB_HOST ? '***' : 'missing',
			hasJWT: !!freshConfig.JWT_SECRET_KEY,
			hasEncryption: !!freshConfig.ENCRYPTION_KEY
		});

		// Now call initializeSystem - it will use the freshly loaded config
		initializationPromise = initializeSystem(false, true); // skipSetupCheck = true
		await initializationPromise;

		logger.info('✅ System initialized successfully with fresh config');
		return { status: 'initialized' };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Failed to initialize with fresh config:', message);
		initializationPromise = null;
		privateEnv = null; // Clear failed config
		return { status: 'failed', error: message };
	}
}

/**
 * Get the current database adapter instance
 * @returns The database adapter or null if not initialized
 */
export function getDb(): DatabaseAdapter | null {
	return dbAdapter;
}

/**
 * Initialize a database connection for seeding purposes
 * @param dbConfig Database configuration
 */
export async function initConnection(dbConfig: {
	type: string;
	host: string;
	port: string;
	name: string;
	user?: string;
	password?: string;
}): Promise<void> {
	// For seeding, we need to create a temporary adapter instance
	// This is a simplified version that works with the existing MongoDB setup

	if (!dbConfig || !dbConfig.type) {
		throw new Error('Database configuration is required');
	}

	if (dbConfig.type !== 'mongodb') {
		throw new Error(`Database type '${dbConfig.type}' is not supported for seeding yet`);
	}

	try {
		// Import MongoDB adapter
		const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');

		// Create a new adapter instance for seeding
		const tempAdapter = new MongoDBAdapter();

		// Build connection string like the test endpoint does
		const { buildDatabaseConnectionString } = await import('../routes/api/setup/utils');
		const connectionString = buildDatabaseConnectionString({
			type: dbConfig.type as 'mongodb' | 'mongodb+srv',
			host: dbConfig.host,
			port: Number(dbConfig.port),
			name: dbConfig.name,
			user: dbConfig.user ?? '',
			password: dbConfig.password ?? ''
		});
		const isAtlas = connectionString.startsWith('mongodb+srv://');

		const options = {
			user: dbConfig.user || undefined,
			pass: dbConfig.password || undefined,
			dbName: dbConfig.name,
			authSource: isAtlas ? undefined : 'admin',
			retryWrites: true,
			serverSelectionTimeoutMS: 15000,
			maxPoolSize: 1 // Use a minimal pool for seeding
		};

		// Connect using the custom connection string and options
		const connectResult = await tempAdapter.connect(connectionString, options);
		if (!connectResult.success) {
			throw new Error(`Database connection failed: ${connectResult.error?.message || 'Unknown error'}`);
		}

		// Set this as the global adapter for seeding
		dbAdapter = tempAdapter as unknown as DatabaseAdapter;

		logger.info('Database connection initialized for seeding');
	} catch (error) {
		logger.error('Failed to initialize database connection for seeding:', error);
		throw error;
	}
}
