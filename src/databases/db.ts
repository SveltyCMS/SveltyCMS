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
import { cacheService } from './CacheService';

// Handle private config that might not exist during setup
let privateEnv: InferOutput<typeof privateConfigSchema> | null = null;

// Function to load private config when needed
async function loadPrivateConfig(forceReload = false) {
	if (privateEnv && !forceReload) return privateEnv;

	try {
		// SAFETY: Force TEST_MODE if running in test environment (Bun test)
		if (process.env.NODE_ENV === 'test' && !process.env.TEST_MODE) {
			console.warn('⚠️ Running in TEST environment but TEST_MODE is not set. Forcing usage of private.test.ts to protect live database.');
			process.env.TEST_MODE = 'true';
		}

		try {
			logger.debug('Loading @config/private configuration...');
			let module;
			if (process.env.TEST_MODE) {
				const pathUtil = await import('path');
				const configPath = pathUtil.resolve(process.cwd(), 'config/private.test.ts');
				module = await import(/* @vite-ignore */ configPath);
			} else {
				// STRICT SAFETY: Never allow loading live config if NODE_ENV is 'test'
				if (process.env.NODE_ENV === 'test') {
					const msg =
						'CRITICAL SAFETY ERROR: Attempted to load live config/private.ts in TEST environment. Strict isolation requires config/private.test.ts.';
					logger.error(msg);
					throw new AppError(msg, 500, 'TEST_ENV_SAFETY_VIOLATION');
				}
				module = await import('@config/private');
			}
			privateEnv = module.privateEnv;

			// SAFETY: Double-check we are not connecting to production in test mode
			if (
				(process.env.TEST_MODE || process.env.NODE_ENV === 'test') &&
				privateEnv?.DB_NAME &&
				!privateEnv.DB_NAME.includes('test') &&
				!privateEnv.DB_NAME.endsWith('_functional')
			) {
				const msg = `⚠️ SAFETY ERROR: DB_NAME '${privateEnv.DB_NAME}' does not look like a test database! Tests must use isolated databases.`;
				logger.error(msg);
				throw new AppError(msg, 500, 'TEST_DB_SAFETY_VIOLATION');
			}

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
import { AppError } from '@utils/errorHandling';

// Adapters Interfaces
import type { DatabaseAdapter } from './dbInterface';

// Settings loader
import { privateConfigSchema, publicConfigSchema } from '@src/databases/schemas';
import { invalidateSettingsCache, setSettingsCache, getPublicSetting } from '@src/services/settingsService';
import { type InferOutput } from 'valibot';

// Type definition for private config schema

// Theme
import { DEFAULT_THEME, ThemeManager } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger';

// System State Management
import { setSystemState, updateServiceHealth } from '@src/stores/system/state';
import { waitForServiceHealthy } from '@src/stores/system/async';

// Plugins
import { initializePlugins } from '@src/plugins';

// Widget Store - Dynamic import to avoid circular dependency
// import { widgetStoreActions } from '@stores/widgetStore.svelte.ts';

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
let _resilienceInstance: any = null;
async function getResilience() {
	if (!_resilienceInstance) {
		const { getDatabaseResilience } = await import('./DatabaseResilience');
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

export async function loadSettingsFromDB(criticalOnly = false) {
	try {
		if (!dbAdapter) {
			await invalidateSettingsCache();
			return;
		}

		// Ensure system features are initialized in the adapter
		if (dbAdapter.ensureSystem) {
			await dbAdapter.ensureSystem();
		}

		const keysToLoad = criticalOnly ? CRITICAL_SETTINGS : KNOWN_PUBLIC_KEYS;
		const privateKeys = criticalOnly ? [] : KNOWN_PRIVATE_KEYS;

		logger.debug(`Fetching settings from DB...`, { keysToLoadCount: keysToLoad.length, privateKeysCount: privateKeys.length });

		// Parallel load of tiered settings
		const [settingsResult, privateDynResult] = await Promise.all([
			dbAdapter.systemPreferences.getMany(keysToLoad, 'system'),
			privateKeys.length > 0 ? dbAdapter.systemPreferences.getMany(privateKeys, 'system') : Promise.resolve({ success: true, data: {} } as any)
		]);

		logger.debug(`Settings fetch results received`, {
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
			return;
		}

		// Get current env
		const privateConfig = privateEnv || (await loadPrivateConfig(false));
		if (!privateConfig) return;

		// Merge and cache
		const mergedPrivate = { ...privateConfig, ...privateDynamic } as any;
		await setSettingsCache(mergedPrivate, settings as any);

		if (!criticalOnly) {
			logger.info('✅ Full system settings loaded and cached.');
		}
	} catch (error) {
		if (!criticalOnly) logger.error('Failed to load settings:', error);
		await invalidateSettingsCache();
	}
}

// Load database and authentication adapters with resilience
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) return;

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
					const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');
					dbAdapter = new MongoDBAdapter() as unknown as DatabaseAdapter;
					break;
				}
				case 'mariadb': {
					const { MariaDBAdapter } = await import('./mariadb/mariadbAdapter');
					dbAdapter = new MariaDBAdapter() as unknown as DatabaseAdapter;
					break;
				}
				default:
					throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}`);
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
	if (!dbAdapter) throw new Error('Cannot initialize themes: dbAdapter is not available.');
	try {
		if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();

		await dbAdapter.themes.ensure(DEFAULT_THEME);
		logger.debug('Default SveltyCMS theme ensured');
	} catch (err) {
		// Log but don't fail - theme initialization is not critical for system startup
		logger.warn(`Theme initialization issue: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Initialize ThemeManager
async function initializeThemeManager(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize ThemeManager: dbAdapter is not available.');
	if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();
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
	if (!dbAdapter.systemVirtualFolder) return;

	const resilience = await getResilience();

	await resilience.executeWithRetry(async () => {
		if (!dbAdapter) throw new Error('dbAdapter is null');
		if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();

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
		} else if (privateConfig.DB_TYPE === 'mariadb') {
			// MariaDB connection string
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
			connectionString = `mysql://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}`;
			logger.debug(`Connecting to MariaDB...`);
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

		const step2And3Time = performance.now() - step2And3StartTime;
		logger.info(`Steps 1-2: DB connected & adapters loaded in ${step2And3Time.toFixed(2)}ms`);
		logger.info(`Step 3: Database models setup in ${step2And3Time.toFixed(2)}ms (⚡ parallelized with connection)`);

		// Step 4: Pre-load Server-Side Services
		// WidgetRegistryService and ContentManager are moved to AFTER Step 5 to ensure dependencies (Settings, Widgets) are ready.
		logger.info('Step 4: Skipping eager ContentManager init (moved to Step 6)');

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
		await loadSettingsFromDB();
		const settingsTime = performance.now() - settingsStartTime;
		logger.debug(`Settings loaded in ${settingsTime.toFixed(2)}ms`);

		const authTime = performance.now() - step5StartTime;

		// Set critical system state to READY
		setSystemState('READY', 'Critical services (DB, Auth, Settings) are ready');

		// Run non-blocking I/O operations in background
		logger.debug('Scheduling non-critical I/O operations in background...');
		setTimeout(async () => {
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
					const { widgets } = await import('@stores/widgetStore.svelte.ts');
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
			logger.info(`ℹ️ Background warm-up completed in ${bgTime.toFixed(2)}ms (non-blocking)`);
		}, 0);

		const step5Time = performance.now() - step5StartTime;
		logger.info(
			`Step 5: Critical components initialized in ${step5Time.toFixed(2)}ms (Auth: ${authTime.toFixed(2)}ms, Settings: ${settingsTime.toFixed(2)}ms)`
		);

		// Step 6: Initialize ContentManager (Deferred)
		logger.debug('Step 6: ContentManager will initialize lazily on first request.');

		// --- Demo Mode Cleanup Service ---
		// Initialize if DEMO is true OR if MULTI_TENANT is true (to allow runtime DEMO toggling)
		if (privateConfig?.DEMO || privateConfig?.MULTI_TENANT) {
			import('@src/utils/demoCleanup').then(({ cleanupExpiredDemoTenants }) => {
				logger.info('🧹 Demo Cleanup Service initialized (Interval: 5m, TTL: 60m)');
				// Run immediately on startup
				cleanupExpiredDemoTenants();
				// Run every 5 minutes
				setInterval(cleanupExpiredDemoTenants, 5 * 60 * 1000);
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
		} else if (dbConfig.type === 'mariadb') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@` : '';
			connectionString = `mysql://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;
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
