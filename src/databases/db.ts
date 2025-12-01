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
let privateEnv: InferOutput<typeof privateConfigSchema> | null = null;

// Function to load private config when needed
async function loadPrivateConfig(forceReload = false) {
	if (privateEnv && !forceReload) return privateEnv;

	try {
		try {
			logger.debug('Loading @config/private configuration...');
			let module;
			if (process.env.TEST_MODE) {
				const path = '@config/private.test';
				module = await import(path);
			} else {
				module = await import('@config/private');
			}
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
import { invalidateSettingsCache, setSettingsCache, getPublicSetting } from '@src/services/settingsService';
import { safeParse, type InferOutput } from 'valibot';

// Type definition for private config schema

// Theme
import { DEFAULT_THEME, ThemeManager } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger';

// System State Management
import { setSystemState, updateServiceHealth, waitForServiceHealthy } from '@src/stores/system';

// Widget Store - Dynamic import to avoid circular dependency
// import { widgetStoreActions } from '@stores/widgetStore.svelte';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter

export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

/**
 * Get the in-memory private config if available.
 * Returns null if config hasn't been loaded yet (e.g., during setup).
 * Used by settingsService to avoid filesystem imports when config is already in memory.
 */
export function getPrivateEnv(): InferOutput<typeof privateConfigSchema> | null {
	return privateEnv;
}

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

		// Load both public and private settings in parallel (not sequential)
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

		// Get private config settings (infrastructure settings)
		// Prefer in-memory config (set by initializeWithConfig) over filesystem import
		// This eliminates unnecessary file I/O and Vite cache dependency
		let privateConfig: InferOutput<typeof privateConfigSchema>;
		if (privateEnv) {
			// Use in-memory config when available (post-setup, zero-restart mode)
			logger.debug('Using in-memory private config (bypassing filesystem)');
			privateConfig = privateEnv;
		} else {
			try {
				// Fall back to filesystem import (normal startup)
				logger.debug('Loading private config from filesystem');
				let imported;
				if (process.env.TEST_MODE) {
					const path = '@config/private.test';
					imported = await import(path);
				} else {
					imported = await import('@config/private');
				}
				privateConfig = imported.privateEnv;
			} catch (error) {
				// Private config doesn't exist during setup - this is expected
				logger.trace('Private config not found during setup - this is expected during initial setup', {
					error: error instanceof Error ? error.message : String(error)
				});
				return;
			}
		}

		// Merge private config file settings with database private settings
		// Private config contains infrastructure settings (DB_*, JWT_*, ENCRYPTION_*)
		// Database contains application private settings (SMTP_*, GOOGLE_*, etc.)
		const privateSettings = {
			...privateConfig, // Infrastructure settings from config (in-memory or file)
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
		const mergedPrivate = { ...(parsedPrivate.output as Record<string, unknown>), ...privateDynamic } as InferOutput<typeof privateConfigSchema>;
		await setSettingsCache(mergedPrivate, parsedPublic.output);

		logger.info('✅ System settings loaded and cached from database.');
	} catch (error) {
		logger.error('Failed to load settings from database:', error);
		// Don't throw - invalidate cache and continue with defaults
		await invalidateSettingsCache();
		logger.warn('Settings load failed - system will continue with default configuration');
	}
}

// Load database and authentication adapters with resilience
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

	logger.debug(`🔌 Loading ${config.DB_TYPE} adapters...`);

	// Use DatabaseResilience for adapter loading (handles transient import failures)
	const { getDatabaseResilience } = await import('@src/databases/DatabaseResilience');
	const resilience = getDatabaseResilience({
		maxAttempts: 3, // Retry adapter loading up to 3 times
		initialDelayMs: 500,
		backoffMultiplier: 2,
		maxDelayMs: 5000,
		jitterMs: 200
	});

	try {
		await resilience.executeWithRetry(async () => {
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
		}, 'Database Adapter Loading');

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
		// Check if theme exists before writing (avoid unnecessary DB operation)
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
		logger.debug('Initializing ThemeManager...');
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
	const mediaFolderPath = (await getPublicSetting('MEDIA_FOLDER')) || './mediaFolder';
	if (building) return;
	const fs = await import('node:fs/promises');
	try {
		// Fast stat() check, skip debug logging overhead
		await fs.stat(mediaFolderPath);
		// Folder exists, skip logging for speed
	} catch {
		// If the folder does not exist, create it
		logger.info(`Creating media folder: ${mediaFolderPath}`);
		await fs.mkdir(mediaFolderPath, { recursive: true });
	}
}

// Initialize virtual folders using DatabaseResilience
async function initializeVirtualFolders(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	if (!dbAdapter.systemVirtualFolder) {
		logger.warn('systemVirtualFolder adapter not available, skipping initialization.');
		return;
	}

	// Use DatabaseResilience for automatic retry with exponential backoff
	const { getDatabaseResilience } = await import('@src/databases/DatabaseResilience');
	const resilience = getDatabaseResilience();

	await resilience.executeWithRetry(async () => {
		if (!dbAdapter) throw new Error('dbAdapter is null');
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
			// Create default virtual folder
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
		}
	}, 'Virtual Folders Initialization');
}

// Initialize adapters (instant validation only)
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.');
	// Instant no-op validation (revisions are lazy-loaded on first use)
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
		let privateConfig: InferOutput<typeof privateConfigSchema> | null;
		if (skipSetupCheck) {
			// When called from initializeWithConfig, privateEnv is already set - don't reload
			logger.debug('Skipping private config load - using pre-set configuration');
			privateConfig = privateEnv;
		} else {
			// Normal initialization flow - load from Vite
			privateConfig = await loadPrivateConfig(forceReload);
		}

		// Ensure we have valid config before proceeding
		if (!privateConfig || !privateConfig.DB_TYPE) {
			logger.info('Private config not available – running in setup mode (skipping full initialization).');
			setSystemState('IDLE', 'Running in setup mode');
			return;
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

		//  Run connection + model setup in parallel (overlapping I/O)
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
		logger.info(`Steps 1-2: DB connected & adapters loaded in ${step2And3Time.toFixed(2)}ms`);
		logger.info(`Step 3: Database models setup in ${step2And3Time.toFixed(2)}ms (⚡ parallelized with connection)`);

		// Step 4: Lazy-initialize Server-Side Services (will initialize on first use)
		// WidgetRegistryService and ContentManager are now lazy-loaded for faster startup
		updateServiceHealth('contentManager', 'healthy', 'Will lazy-initialize on first use');
		logger.info('Step 4: Server services (Widgets & Content) will lazy-initialize on first use');

		// Eagerly initialize ContentManager to prevent race conditions on first load
		const { contentManager } = await import('@src/content/ContentManager');
		await contentManager.initialize();
		logger.info('ContentManager eagerly initialized.');

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

		// Settings (required for app configuration)
		const settingsStartTime = performance.now();
		await loadSettingsFromDB();
		const settingsTime = performance.now() - settingsStartTime;

		const authTime = performance.now() - step5StartTime;

		// Run slow I/O operations in parallel
		const parallelStartTime = performance.now();
		updateServiceHealth('cache', 'initializing', 'Initializing media, revisions, and themes...');
		updateServiceHealth('themeManager', 'initializing', 'Initializing theme manager...');

		// Collect timings for all parallel operations
		let mediaTime = 0,
			revisionsTime = 0,
			virtualFoldersTime = 0,
			themesTime = 0,
			widgetsTime = 0;

		await Promise.all([
			(async () => {
				const t = performance.now();
				await initializeMediaFolder();
				mediaTime = performance.now() - t;
			})(),
			(async () => {
				const t = performance.now();
				await initializeRevisions();
				revisionsTime = performance.now() - t;
			})(),
			(async () => {
				const t = performance.now();
				await initializeVirtualFolders();
				virtualFoldersTime = performance.now() - t;
			})(),
			(async () => {
				const t = performance.now();
				await initializeDefaultTheme();
				await initializeThemeManager();
				updateServiceHealth('themeManager', 'healthy', 'Theme manager initialized');
				themesTime = performance.now() - t;
			})(),
			(async () => {
				const t = performance.now();
				updateServiceHealth('widgets', 'initializing', 'Initializing widget store...');
				// Dynamic import to avoid circular dependency with client bundle
				const { widgetStoreActions } = await import('@stores/widgetStore.svelte');
				await widgetStoreActions.initializeWidgets(undefined, dbAdapter);
				updateServiceHealth('widgets', 'healthy', 'Widget store initialized');
				widgetsTime = performance.now() - t;
			})()
		]);

		updateServiceHealth('cache', 'healthy', 'Media, revisions, and virtual folders initialized');

		const parallelTime = performance.now() - parallelStartTime;
		logger.info(
			`Parallel I/O completed in ${parallelTime.toFixed(2)}ms (Media: ${mediaTime.toFixed(2)}ms, Revisions: ${revisionsTime.toFixed(2)}ms, Virtual Folders: ${virtualFoldersTime.toFixed(2)}ms, Themes: ${themesTime.toFixed(2)}ms, Widgets: ${widgetsTime.toFixed(2)}ms)`
		);

		const step5Time = performance.now() - step5StartTime;
		logger.info(
			`Step 5: Critical components initialized in ${step5Time.toFixed(2)}ms (Auth: ${authTime.toFixed(2)}ms, Settings: ${settingsTime.toFixed(2)}ms)`
		);

		// --- Demo Mode Cleanup Service ---
		if (privateConfig?.DEMO) {
			import('@src/utils/demoCleanup').then(({ cleanupExpiredDemoTenants }) => {
				logger.info('🧹 Demo Cleanup Service initialized (Interval: 5m, TTL: 60m)');
				// Run immediately on startup
				cleanupExpiredDemoTenants();
				// Run every 5 minutes
				setInterval(cleanupExpiredDemoTenants, 5 * 60 * 1000);
			});
		}

		isInitialized = true;

		// System is now READY - state will be derived automatically from service health
		const totalTime = performance.now() - systemStartTime;
		logger.info(`🚀 System initialization completed successfully in ${totalTime.toFixed(2)}ms!`);
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

export async function getSystemStatus() {
	const basicStatus = {
		initialized: isInitialized,
		connected: isConnected,
		authReady: !!auth,
		initializing: !!initializationPromise && !isInitialized
	};

	// If not connected, return basic status without health check
	if (!isConnected || !dbAdapter) {
		return basicStatus;
	}

	try {
		// Get database health metrics using DatabaseResilience
		const { getDatabaseResilience } = await import('@src/databases/DatabaseResilience');
		const resilience = getDatabaseResilience();

		// Perform health check with database ping
		const healthResult = await resilience.healthCheck(async () => {
			if (!dbAdapter) throw new Error('dbAdapter is null');
			const start = Date.now();
			// Ping the database by running a lightweight query
			if (dbAdapter.isConnected && dbAdapter.isConnected()) {
				return Date.now() - start;
			}
			throw new Error('Database not connected');
		});

		// Get resilience metrics for additional insights
		const metrics = resilience.getMetrics();

		return {
			...basicStatus,
			health: {
				healthy: healthResult.healthy,
				latency: healthResult.latency,
				message: healthResult.message
			},
			metrics: {
				totalRetries: metrics.totalRetries,
				successfulRetries: metrics.successfulRetries,
				failedRetries: metrics.failedRetries,
				totalReconnections: metrics.totalReconnections,
				successfulReconnections: metrics.successfulReconnections,
				connectionUptime: metrics.connectionUptime,
				averageRecoveryTime: Math.round(metrics.averageRecoveryTime)
			}
		};
	} catch (error) {
		// If health check fails, return basic status with error
		return {
			...basicStatus,
			health: {
				healthy: false,
				latency: -1,
				message: error instanceof Error ? error.message : 'Health check failed'
			}
		};
	}
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
			const authReady = await waitForServiceHealthy('auth', { timeoutMs: 3000 }); // Reduced from 10s to 3s
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
 * Initialize system with provided configuration (in-memory) - MOST EFFICIENT
 * This is the recommended method for zero-restart setup completion.
 * Bypasses filesystem completely by accepting configuration in memory.
 *
 * Use this during setup completion to avoid:
 * - Vite module cache issues
 * - Filesystem read operations
 * - Double initialization
 *
 * @param config - Complete private environment configuration
 * @returns Promise with initialization status
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initializeWithConfig(config: any): Promise<{ status: string; error?: string }> {
	try {
		logger.info('🚀 Initializing system with provided configuration (bypassing Vite cache & filesystem)...');

		// CRITICAL: Set config in memory BEFORE initialization
		privateEnv = config;

		// Clear any existing initialization state
		initializationPromise = null;
		isInitialized = false;
		isConnected = false;
		auth = null;
		setSystemState('IDLE', 'Preparing for initialization with in-memory config');

		logger.debug('In-memory config set successfully', {
			DB_TYPE: config.DB_TYPE,
			DB_HOST: config.DB_HOST ? '***' : 'missing',
			hasJWT: !!config.JWT_SECRET_KEY,
			hasEncryption: !!config.ENCRYPTION_KEY
		});

		// Initialize system with in-memory config
		// skipSetupCheck = true tells initializeSystem to use privateEnv instead of importing
		initializationPromise = initializeSystem(false, true);
		await initializationPromise;

		logger.info('✅ System initialized successfully with in-memory config (zero-restart)');
		return { status: 'success' };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to initialize with in-memory config:', errorMessage);
		initializationPromise = null;
		privateEnv = null; // Clear failed config
		setSystemState('FAILED', `Initialization failed: ${errorMessage}`);
		return { status: 'failed', error: errorMessage };
	}
}

/**
 * Initialize system by loading private.ts from filesystem (bypasses Vite cache).
 * LEGACY METHOD - Use initializeWithConfig() for better performance when config is already in memory.
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
