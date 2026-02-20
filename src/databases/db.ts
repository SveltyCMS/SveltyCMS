/**
 * @file src/databases/db.ts
 * @description
 * Database and authentication initialization and management module.
 * Responsibilities include:
 * - Loading and initializing database and authentication adapters based on DB_TYPE.
 * - Establishing database connections with a retry mechanism.
 * - Managing initialization of authentication, media, and collection models.
 * - Setting up default roles and permissions.
 *
 * Multi-Tenancy Note:
 * This file handles the one-time global startup of the server. Tenant-specific
 * data scoping is handled by the API endpoints and server hooks.
 *
 * features:
 * - dynamic adapter loading
 * - connection resilience
 * - model auto-initialization
 * - multi-tenant global startup
 */

import { building } from '$app/environment';
import { cacheService } from './cache-service';

// Handle private config that might not exist during setup
import {
	clearPrivateConfigCache as clearPrivateConfigCacheFromState,
	getPrivateEnv as getPrivateEnvFromState,
	loadPrivateConfig as loadPrivateConfigFromState,
	privateEnv,
	setPrivateEnv as setPrivateEnvFromState
} from './config-state';

// Re-export for compatibility
export const getPrivateEnv = getPrivateEnvFromState;
export const loadPrivateConfig = loadPrivateConfigFromState;
export const clearPrivateConfigCache = clearPrivateConfigCacheFromState;
export const setPrivateEnv = setPrivateEnvFromState;

// Note: privateEnv variable is imported but is read-only.
// We use the getter fn or the imported variable directly.

// Function to reset initialization state for self-healing (retries)
export function resetDbInitPromise() {
	logger.warn('Resetting DB initialization promise for retry...');
	_dbInitPromise = null;
	initializationPromise = null;
	adaptersLoaded = false;
	isInitialized = false;
	isConnected = false;
	// We DON'T clear privateEnv to allow retry with same config
}

// Auth
import { Auth } from '@src/databases/auth';
import { getDefaultSessionStore } from '@src/databases/auth/session-manager';
// Settings loader
import { privateConfigSchema, publicConfigSchema } from '@src/databases/schemas';
import { getPublicSetting, invalidateSettingsCache, setSettingsCache, type PublicEnv } from '@src/services/settings-service';
import type { InferOutput } from 'valibot';
// Adapters Interfaces
import type { DatabaseAdapter } from './db-interface';
import type { DatabaseResilience } from './database-resilience';

// Type definition for private config schema

// Theme
import { DEFAULT_THEME, ThemeManager } from '@src/databases/theme-manager';
// Plugins
import { initializePlugins } from '@src/plugins';
import { waitForServiceHealthy } from '@src/stores/system/async';
// System State Management
import { setSystemState, updateServiceHealth } from '@src/stores/system/state';
// System Logger
import { logger } from '@utils/logger';

// Widget Store - Dynamic import to avoid circular dependency
// import { widgetStoreActions } from '@src/stores/widget-store.svelte.ts';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter

export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

// export function getPrivateEnv(): InferOutput<typeof privateConfigSchema> | null {
// 	return privateEnv;
// }

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
	'MULTI_TENANT',
	'DEMO'
]);

const KNOWN_PUBLIC_KEYS = publicConfigSchema && 'entries' in publicConfigSchema ? Object.keys(publicConfigSchema.entries) : [];
const KNOWN_PRIVATE_KEYS =
	privateConfigSchema && 'entries' in privateConfigSchema
		? Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key))
		: [];

if (KNOWN_PUBLIC_KEYS.length === 0 || KNOWN_PRIVATE_KEYS.length === 0) {
	console.error('CRITICAL: Failed to extract setting keys from Valibot schemas!', {
		hasPublicSchema: !!publicConfigSchema,
		hasPublicEntries: publicConfigSchema && 'entries' in publicConfigSchema,
		hasPrivateSchema: !!privateConfigSchema,
		hasPrivateEntries: privateConfigSchema && 'entries' in privateConfigSchema
	});
}

// --- Optimization Constants ---
const CRITICAL_SETTINGS = ['MEDIA_FOLDER', 'MULTI_TENANT', 'DEFAULT_LANGUAGE'];

// --- Resilience Utility (Singleton) ---
let _resilienceInstance: DatabaseResilience | null = null;
async function getResilience() {
	if (!_resilienceInstance) {
		const { getDatabaseResilience } = await import('./database-resilience');
		_resilienceInstance = getDatabaseResilience({
			maxAttempts: 3,
			initialDelayMs: 500,
			backoffMultiplier: 2,
			maxDelayMs: 5000,
			jitterMs: 200
		});
	}
	return _resilienceInstance;
}

export async function loadSettingsFromDB(criticalOnly = false): Promise<boolean> {
	try {
		if (!dbAdapter) {
			await invalidateSettingsCache();
			return false;
		}

		// Ensure system features are initialized in the adapter
		if (dbAdapter.ensureSystem) {
			await dbAdapter.ensureSystem();
		}

		const keysToLoad = criticalOnly ? CRITICAL_SETTINGS : KNOWN_PUBLIC_KEYS;
		const privateKeys = criticalOnly ? [] : KNOWN_PRIVATE_KEYS;

		logger.debug('Fetching settings from DB...', {
			keysToLoadCount: keysToLoad.length,
			privateKeysCount: privateKeys.length
		});

		// Parallel load of tiered settings
		const [settingsResult, privateDynResult] = await Promise.all([
			dbAdapter.systemPreferences.getMany(keysToLoad, 'system'),
			privateKeys.length > 0 ? dbAdapter.systemPreferences.getMany(privateKeys, 'system') : Promise.resolve({ success: true, data: {} })
		]);

		logger.debug('Settings fetch results received', {
			publicSuccess: settingsResult.success,
			privateSuccess: privateDynResult.success
		});

		if (!settingsResult.success) {
			throw new Error(`Could not load settings: ${settingsResult.error?.message}`);
		}

		const settings = settingsResult.data || {};
		const privateDynamic = privateDynResult.success ? privateDynResult.data || {} : {};

		if (Object.keys(settings).length === 0 && !criticalOnly) {
			await invalidateSettingsCache();
			return false;
		}

		// Get current env
		const privateConfig = privateEnv || (await loadPrivateConfig(false));
		if (!privateConfig) {
			return false;
		}

		// Merge and cache
		const mergedPrivate = { ...privateConfig, ...privateDynamic } as InferOutput<typeof privateConfigSchema>;
		await setSettingsCache(mergedPrivate, settings as unknown as PublicEnv);

		// Reconfigure CacheService to reflect potentially new Redis settings
		await cacheService.reconfigure().catch((e) => logger.warn('Failed to reconfigure CacheService:', e));

		if (!criticalOnly) {
			logger.info('✅ Full system settings loaded and cached.');
		}
		return true;
	} catch (error) {
		if (!criticalOnly) {
			logger.error('Failed to load settings:', error);
		}
		await invalidateSettingsCache();
		return false;
	}
}

// Load database and authentication adapters with resilience
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) {
		return;
	}

	const config = privateEnv || (await loadPrivateConfig(false));
	if (!config?.DB_TYPE) {
		updateServiceHealth('database', 'unhealthy', 'No DB_TYPE in config');
		return;
	}

	const resilience = await getResilience();

	try {
		await resilience.executeWithRetry(async () => {
			switch (config.DB_TYPE) {
				case 'mongodb':
				case 'mongodb+srv': {
					const { MongoDBAdapter } = await import('./mongodb/mongo-db-adapter');
					dbAdapter = new MongoDBAdapter() as unknown as DatabaseAdapter;
					break;
				}
				case 'mariadb': {
					const { MariaDBAdapter } = await import('./mariadb/mariadb-adapter');
					dbAdapter = new MariaDBAdapter() as unknown as DatabaseAdapter;
					break;
				}
				case 'postgresql': {
					const { PostgreSQLAdapter } = await import('./postgresql/postgres-adapter');
					dbAdapter = new PostgreSQLAdapter() as unknown as DatabaseAdapter;
					break;
				}
				case 'sqlite': {
					const { SQLiteAdapter } = await import('./sqlite/adapter');
					dbAdapter = new SQLiteAdapter() as unknown as DatabaseAdapter;
					break;
				}
				default:
					throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}`);
			}

			// Apply Webhook Proxy Wrapper
			if (dbAdapter) {
				const { wrapAdapterWithWebhooks } = await import('./webhook-wrapper');
				dbAdapter = await wrapAdapterWithWebhooks(dbAdapter);
			}
		}, 'Database Adapter Loading');

		adaptersLoaded = true;
	} catch (err) {
		adaptersLoaded = false;
		throw err;
	}
}

// Initialize default theme
async function initializeDefaultTheme(): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Cannot initialize themes: dbAdapter is not available.');
	}
	try {
		if (dbAdapter.ensureSystem) {
			await dbAdapter.ensureSystem();
		}

		await dbAdapter.themes.ensure(DEFAULT_THEME);
		logger.debug('Default SveltyCMS theme ensured');
	} catch (err) {
		// Log but don't fail - theme initialization is not critical for system startup
		logger.warn(`Theme initialization issue: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Initialize ThemeManager
async function initializeThemeManager(): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Cannot initialize ThemeManager: dbAdapter is not available.');
	}
	if (dbAdapter.ensureSystem) {
		await dbAdapter.ensureSystem();
	}
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
	if (building) {
		return;
	}
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
	if (!dbAdapter) {
		throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	}
	if (!dbAdapter.systemVirtualFolder) {
		return;
	}

	const resilience = await getResilience();

	await resilience.executeWithRetry(async () => {
		if (!dbAdapter) {
			throw new Error('dbAdapter is null');
		}
		if (dbAdapter.ensureSystem) {
			await dbAdapter.ensureSystem();
		}

		const defaultMediaFolder = (await getPublicSetting('MEDIA_FOLDER')) || 'mediaFolder';
		await dbAdapter.systemVirtualFolder.ensure({
			name: defaultMediaFolder,
			path: defaultMediaFolder,
			order: 0,
			type: 'folder' as const
		});
	}, 'Virtual Folders Initialization');
}

// Initialize adapters (instant validation only)
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Cannot initialize revisions: dbAdapter is not available.');
	}
	// Instant no-op validation (revisions are lazy-loaded on first use)
}

// Core Initialization Logic
async function initializeSystem(forceReload = false, skipSetupCheck = false, awaitBackground = false): Promise<void> {
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
		if (!privateConfig?.DB_TYPE) {
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
			logger.debug('Connecting to MongoDB...');
		} else if (privateConfig.DB_TYPE === 'mongodb+srv') {
			// MongoDB Atlas connection string
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `mongodb+srv://${authPart}${privateConfig.DB_HOST}/${privateConfig.DB_NAME}?retryWrites=true&w=majority`;
			logger.debug('Connecting to MongoDB Atlas (SRV)...');
		} else if (privateConfig.DB_TYPE === 'mariadb') {
			// MariaDB connection string
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `mysql://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}`;
			logger.debug('Connecting to MariaDB...');
		} else if (privateConfig.DB_TYPE === 'sqlite') {
			// SQLite connection string is just the file path
			const path = privateConfig.DB_HOST.endsWith('/') ? privateConfig.DB_HOST : `${privateConfig.DB_HOST}/`;
			connectionString = `${path}${privateConfig.DB_NAME}`;
			logger.debug('Connecting to SQLite...');
		} else if (privateConfig.DB_TYPE === 'postgresql') {
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `postgresql://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}`;
			logger.debug('Connecting to PostgreSQL...');
		} else {
			connectionString = '';
		}

		//  Run connection + simple model setup
		const step2And3StartTime = performance.now();
		const connectionResult = await dbAdapter.connect(connectionString);

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

		// Step 3: Load historical performance metrics (Self-Learning)
		try {
			const { systemStateStore } = await import('@src/stores/system/state');
			const { loadHistoricalMetrics } = await import('@src/stores/system/metrics');
			await loadHistoricalMetrics(systemStateStore);
		} catch (metricsError) {
			logger.warn('[db] Failed to load historical metrics (non-critical):', metricsError);
		}

		const step2And3Time = performance.now() - step2And3StartTime;
		logger.info(`Steps 1-2: DB connected & adapters loaded in ${step2And3Time.toFixed(2)}ms`);
		logger.info(`Step 3: Database models setup in ${step2And3Time.toFixed(2)}ms (⚡ parallelized with connection)`);

		// Step 4: Pre-load Server-Side Services
		//widget-registry-serviceandcontent-managerare moved to AFTER Step 5 to ensure dependencies (Settings, Widgets) are ready.
		logger.info('Step 4: Skipping eagercontent-managerinit (moved to Step 6)');

		// Step 5: Initialize Critical Components (optimized for speed)
		logger.debug('Starting Step 5: Critical components initialization...');
		const step5StartTime = performance.now();

		// Auth (fast, required immediately)
		updateServiceHealth('auth', 'initializing', 'Initializing authentication service...');
		if (dbAdapter?.ensureAuth) {
			await dbAdapter.ensureAuth();
		}
		auth = new Auth(dbAdapter!, getDefaultSessionStore());
		updateServiceHealth('auth', 'healthy', 'Authentication service ready');

		// Settings (required for app configuration)
		logger.debug('Loading settings from database...');
		const settingsStartTime = performance.now();
		const settingsLoaded = await loadSettingsFromDB();
		const settingsTime = performance.now() - settingsStartTime;
		logger.debug(`Settings loaded in ${settingsTime.toFixed(2)}ms`);

		const authTime = performance.now() - step5StartTime;

		// Set critical system state to READY
		setSystemState('READY', 'Critical services (DB, Auth, Settings) are ready');

		// Run non-blocking I/O operations in background
		logger.debug(`Scheduling non-critical I/O operations (awaitBackground: ${awaitBackground})...`);

		const backgroundTask = async () => {
			if (!settingsLoaded) {
				logger.info('System initialized in Setup/Maintenance mode (Settings not loaded). Skipping Plugins & Widgets.');

				// Explicitly mark services as skipped to trigger SETUP state
				updateServiceHealth('widgets', 'skipped', 'Skipped in Setup Mode');
				updateServiceHealth('themeManager', 'skipped', 'Skipped in Setup Mode');
				updateServiceHealth('contentManager', 'skipped', 'Skipped in Setup Mode');

				cacheService.setBootstrapping(false);
				return;
			}

			const backgroundStartTime = performance.now();

			// Mark non-critical services as initializing to trigger WARMING phase
			updateServiceHealth('cache', 'initializing', 'Warming up cache...');
			updateServiceHealth('themeManager', 'initializing', 'Initializing themes...');
			updateServiceHealth('widgets', 'initializing', 'Initializing widgets...');
			updateServiceHealth('contentManager', 'initializing', 'Preparing content manager...');

			if (dbAdapter?.ensureMedia) {
				await dbAdapter.ensureMedia().catch((e) => logger.warn('Media activation issue:', e));
			}

			await Promise.all([
				initializeMediaFolder().catch((e) => logger.warn('Media folder init failed:', e)),
				initializeRevisions().catch((e) => logger.warn('Revisions init failed:', e)),
				initializeVirtualFolders().catch((e) => logger.warn('Virtual folders init failed:', e)),
				(async () => {
					await initializeDefaultTheme();
					await initializeThemeManager();
					updateServiceHealth('themeManager', 'healthy', 'Theme manager initialized');
				})().catch((e) => logger.warn('Theme init failed:', e)),
				(async () => {
					const { widgets } = await import('@src/stores/widget-store.svelte.ts');
					await widgets.initialize(undefined, dbAdapter!);
					updateServiceHealth('widgets', 'healthy', 'Widget store initialized');
				})().catch((e) => logger.warn('Widget init failed:', e)),
				(async () => {
					updateServiceHealth('cache', 'healthy', 'System cache warmed up');
				})()
			]);

			// Step 7: Initialize Plugins
			if (dbAdapter) {
				await initializePlugins(dbAdapter).catch((e) => logger.warn('Plugins init failed:', e));
			}

			// Finalize lazy services
			updateServiceHealth('contentManager', 'healthy', 'ContentManager ready (lazy)');

			// FINAL: Signal end of bootstrapping
			cacheService.setBootstrapping(false);

			const bgTime = performance.now() - backgroundStartTime;
			logger.info(`ℹ️ Background warm-up completed in ${bgTime.toFixed(2)}ms`);
		};

		if (awaitBackground) {
			await backgroundTask();
		} else {
			setTimeout(backgroundTask, 0);
		}

		const step5Time = performance.now() - step5StartTime;
		logger.info(
			`Step 5: Critical components initialized in ${step5Time.toFixed(2)}ms (Auth: ${authTime.toFixed(2)}ms, Settings: ${settingsTime.toFixed(2)}ms)`
		);

		// Step 6: Initializecontent-manager(Deferred)
		logger.debug('Step 6:ContentManager will initialize lazily on first request.');

		// --- Demo Mode Cleanup Service ---
		// Initialize if DEMO is true OR if MULTI_TENANT is true (to allow runtime DEMO toggling)
		if (privateConfig?.DEMO || privateConfig?.MULTI_TENANT) {
			import('@src/utils/demo-cleanup').then(({ cleanupExpiredDemoTenants }) => {
				logger.info('Demo Cleanup Service initialized (Interval: 5m, Session: 20m, Cleanup TTL: 60m)');
				// Delay initial run to allow background services to finish initializing
				setTimeout(() => {
					cleanupExpiredDemoTenants().catch((err) => logger.warn('[Demo Cleanup] Initial run failed:', err));
				}, 10_000);
				// Run every 5 minutes
				setInterval(
					() => {
						cleanupExpiredDemoTenants().catch((err) => logger.warn('[Demo Cleanup] Periodic run failed:', err));
					},
					5 * 60 * 1000
				);
			});
		}

		isInitialized = true;

		// Explicitly set system state to READY after all services are initialized
		setSystemState('READY', 'All critical services initialized successfully');

		const totalTime = performance.now() - systemStartTime;
		logger.info(`🚀 System initialization READY in ${totalTime.toFixed(2)}ms (Background tasks still running)`);
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
		} else if (dbConfig.type === 'mongodb+srv') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@` : '';
			connectionString = `mongodb+srv://${authPart}${dbConfig.host}/${dbConfig.name}?retryWrites=true&w=majority`;
		} else if (dbConfig.type === 'mariadb') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@` : '';
			connectionString = `mysql://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;
		} else if (dbConfig.type === 'postgresql') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@` : '';
			connectionString = `postgresql://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;
		} else if (dbConfig.type === 'sqlite') {
			const path = dbConfig.host.endsWith('/') ? dbConfig.host : `${dbConfig.host}/`;
			connectionString = `${path}${dbConfig.name}`;
			if (!dbAdapter) {
				const { SQLiteAdapter } = await import('./sqlite/adapter');
				dbAdapter = new SQLiteAdapter() as unknown as DatabaseAdapter;
			}
		} else {
			return {
				success: false,
				error: `Database type '${dbConfig.type}' not supported yet`
			};
		}

		// Connect to database
		const connectionResult = await dbAdapter.connect(connectionString);
		if (!connectionResult.success) {
			return {
				success: false,
				error: connectionResult.error?.message || 'Connection failed'
			};
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

	if (!(building || isBuildProcess)) {
		if (!initializationPromise || forceInit) {
			logger.debug('Creating system initialization promise...');

			initializationPromise = (async () => {
				// Check if private config exists and is valid
				const privateConfig = await loadPrivateConfig(forceInit);
				if (!(privateConfig?.DB_TYPE && privateConfig.DB_HOST)) {
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
	if (!(isConnected && dbAdapter)) {
		return basicStatus;
	}

	try {
		// Get database health metrics using DatabaseResilience
		const { getDatabaseResilience } = await import('@src/databases/database-resilience');
		const resilience = getDatabaseResilience();

		// Perform health check with database ping
		const healthResult = await resilience.healthCheck(async () => {
			if (!dbAdapter) {
				throw new Error('dbAdapter is null');
			}
			const start = Date.now();
			// Ping the database by running a lightweight query
			if (dbAdapter.isConnected?.()) {
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
		logger.info(`Manual reinitialization requested${force ? ' (force)' : ''}${waitForAuth ? '' : ' (skip auth wait)'}`);
		initializationPromise = initializeSystem(force);
		await initializationPromise;

		// Optionally wait for auth service to be ready (skip during setup to avoid blocking)
		if (waitForAuth) {
			logger.info('Waiting for auth service to become available after reinitialization...');
			const authReady = await waitForServiceHealthy('auth', {
				timeoutMs: 3000
			}); // Reduced from 10s to 3s
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
/**
 * Initialize system by providing raw configuration object (zero-restart re-initialization).
 *
 * Use this during setup or when configuration changes dynamically without restart.
 *
 * @param config - Raw private configuration object
 * @param options - Additional initialization options
 * @returns Promise with initialization status
 */
export async function initializeWithConfig(
	config: InferOutput<typeof privateConfigSchema>,
	options?: {
		multiTenant?: boolean;
		demoMode?: boolean;
		awaitBackground?: boolean;
	}
): Promise<{ status: string; error?: string }> {
	try {
		logger.info('🚀 Initializing system with provided configuration (bypassing Vite cache & filesystem)...');

		// CRITICAL: Merge explicit modes into config
		if (options?.multiTenant !== undefined) {
			config.MULTI_TENANT = options.multiTenant;
		}
		if (options?.demoMode !== undefined) {
			config.DEMO = options.demoMode;
		}

		// CRITICAL: Set config in memory BEFORE initialization
		setPrivateEnv(config);

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
			hasEncryption: !!config.ENCRYPTION_KEY,
			MULTI_TENANT: config.MULTI_TENANT,
			DEMO: config.DEMO,
			awaitBackground: options?.awaitBackground
		});

		// Initialize system with in-memory config
		// skipSetupCheck = true tells initializeSystem to use privateEnv instead of importing
		initializationPromise = initializeSystem(false, true, options?.awaitBackground);
		await initializationPromise;

		logger.info('✅ System initialized successfully with in-memory config (zero-restart)');
		return { status: 'success' };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to initialize with in-memory config:', errorMessage);
		initializationPromise = null;
		setPrivateEnv(null); // Clear failed config
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
export async function initializeWithFreshConfig(): Promise<{
	status: string;
	error?: string;
}> {
	// Clear any existing initialization
	logger.info('Initializing system with fresh config from filesystem (bypassing Vite cache)...');
	initializationPromise = null;
	isInitialized = false;
	isConnected = false;
	auth = null;
	setPrivateEnv(null); // Clear cache to force reload
	setSystemState('IDLE', 'Preparing for initialization with fresh config');

	try {
		// Force reload private.ts from filesystem (bypasses Vite's module cache)
		const freshConfig = await loadPrivateConfig(true);

		if (!freshConfig?.DB_TYPE) {
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
		setPrivateEnv(null); // Clear failed config
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

	if (!dbConfig?.type) {
		throw new Error('Database configuration is required');
	}

	const supportedTypes = ['mongodb', 'mongodb+srv', 'sqlite', 'mariadb', 'postgresql'];
	if (!supportedTypes.includes(dbConfig.type)) {
		throw new Error(`Database type '${dbConfig.type}' is not supported for seeding yet`);
	}

	try {
		let tempAdapter: DatabaseAdapter;

		if (dbConfig.type === 'mongodb' || dbConfig.type === 'mongodb+srv') {
			const { MongoDBAdapter } = await import('./mongodb/mongo-db-adapter');
			tempAdapter = new MongoDBAdapter() as unknown as DatabaseAdapter;
		} else if (dbConfig.type === 'mariadb') {
			const { MariaDBAdapter } = await import('./mariadb/mariadb-adapter');
			tempAdapter = new MariaDBAdapter() as unknown as DatabaseAdapter;
		} else if (dbConfig.type === 'postgresql') {
			const { PostgreSQLAdapter } = await import('./postgresql/postgres-adapter');
			tempAdapter = new PostgreSQLAdapter() as unknown as DatabaseAdapter;
		} else {
			const { SQLiteAdapter } = await import('./sqlite/sqlite-adapter');
			tempAdapter = new SQLiteAdapter() as unknown as DatabaseAdapter;
		}

		// Build connection string like the test endpoint does
		const { buildDatabaseConnectionString } = await import('@src/routes/setup/utils');
		const connectionString = buildDatabaseConnectionString({
			type: dbConfig.type as 'mongodb' | 'mongodb+srv' | 'sqlite' | 'mariadb' | 'postgresql',
			host: dbConfig.host,
			port: Number(dbConfig.port),
			name: dbConfig.name,
			user: dbConfig.user ?? '',
			password: dbConfig.password ?? ''
		});

		const options = dbConfig.type.startsWith('mongodb')
			? {
					user: dbConfig.user || undefined,
					pass: dbConfig.password || undefined,
					dbName: dbConfig.name,
					authSource: connectionString.startsWith('mongodb+srv://') ? undefined : 'admin',
					retryWrites: true,
					serverSelectionTimeoutMS: 15_000,
					maxPoolSize: 1 // Use a minimal pool for seeding
				}
			: {};

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
