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
import { publicEnv } from '@src/stores/globalSettings';

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
		logger.debug('Private config not found during setup - this is expected during initial setup', {
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

// Function to clear private config cache (used after setup completion)
export function clearPrivateConfigCache() {
	logger.debug('Clearing private config cache');
	privateEnv = null;
	adaptersLoaded = false;
	logger.debug('Private config cache cleared');
}

// Auth
import { Auth } from '@src/databases/auth';
import { getDefaultSessionStore } from '@src/databases/auth/sessionManager';

// Adapters Interfaces
import type { DatabaseAdapter } from './dbInterface';

// Content Manager
import { contentManager } from '@src/content/ContentManager';

// Settings loader
import { privateConfigSchema, publicConfigSchema } from '@root/config/types';
import { invalidateSettingsCache, setSettingsCache } from '@src/stores/globalSettings';
import { safeParse } from 'valibot';

// Theme
import { DEFAULT_THEME, ThemeManager } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// State Variables
export let dbAdapter: DatabaseAdapter | null = null; // Database adapter

export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state (primarily for external checks if needed)
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

// Create a proper Promise for lazy initialization
let _dbInitPromise: Promise<void> | null = null;
export function getDbInitPromise(): Promise<void> {
	if (!_dbInitPromise) {
		_dbInitPromise = initializeOnRequest();
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
export async function loadSettingsFromDB() {
	try {
		logger.debug('Loading settings from database...');

		// Check if database adapter is available
		if (!dbAdapter || !dbAdapter.systemPreferences) {
			logger.warn('Database adapter not available during settings load. Using empty cache.');
			invalidateSettingsCache();
			return;
		}

		// Get all system settings from database using database-agnostic interface
		// Since we don't have a "getAll" method, we'll use known system setting keys
		const knownSystemKeys = [
			'HOST_DEV',
			'HOST_PROD',
			'SITE_NAME',
			'PASSWORD_LENGTH',
			'DEFAULT_CONTENT_LANGUAGE',
			'AVAILABLE_CONTENT_LANGUAGES',
			'BASE_LOCALE',
			'LOCALES',
			'MEDIA_FOLDER',
			'MEDIA_OUTPUT_FORMAT_QUALITY',
			'IMAGE_SIZES',
			'MAX_FILE_SIZE',
			'BODY_SIZE_LIMIT',
			'USE_ARCHIVE_ON_DELETE',
			'SEASONS',
			'SEASON_REGION',
			'PKG_VERSION',
			'LOG_LEVELS',
			'LOG_RETENTION_DAYS',
			'LOG_ROTATION_SIZE'
		];

		const settingsResult = await dbAdapter.systemPreferences.getMany(knownSystemKeys, 'system');

		if (!settingsResult.success) {
			logger.error('Failed to load settings from database:', settingsResult.error);
			logger.error('Settings keys attempted:', knownSystemKeys);
			logger.error('Database adapter status:', {
				hasAdapter: !!dbAdapter,
				hasSystemPrefs: !!dbAdapter?.systemPreferences,
				hasGetMany: !!dbAdapter?.systemPreferences?.getMany
			});
			throw new Error(`Could not load settings from DB: ${settingsResult.error?.message || 'Unknown error'}`);
		}

		const settings = settingsResult.data || {};

		// Load dynamic private settings that live in DB (feature flags, integrations)
		const privateDynamicKeys = [
			'USE_GOOGLE_OAUTH',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET',
			'USE_REDIS',
			'REDIS_HOST',
			'REDIS_PORT',
			'USE_MAPBOX',
			'MAPBOX_API_TOKEN',
			'SECRET_MAPBOX_API_TOKEN',
			'USE_TIKTOK',
			'TIKTOK_TOKEN',
			'SMTP_HOST',
			'SMTP_PORT',
			'SMTP_EMAIL',
			'SMTP_PASSWORD',
			'USE_2FA',
			'TWO_FACTOR_AUTH_BACKUP_CODES_COUNT'
		];
		const privateDynResult = await dbAdapter.systemPreferences.getMany(privateDynamicKeys, 'system');
		const privateDynamic = privateDynResult.success ? privateDynResult.data || {} : {};

		// If no settings exist (initial setup), use empty objects and skip validation
		if (Object.keys(settings).length === 0) {
			logger.info('No settings found in database (initial setup). Using empty cache.');
			// During initial setup, bypass validation by calling invalidateSettingsCache
			// which sets empty cache without validation
			invalidateSettingsCache();
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

			invalidateSettingsCache();
			return;
		}

		// Populate the cache with validated settings, merging dynamic private flags into unified cache
		const mergedPrivate = { ...(parsedPrivate.output as Record<string, unknown>), ...privateDynamic } as Record<string, unknown>;
		setSettingsCache(mergedPrivate as typeof privateEnv, parsedPublic.output);

		logger.info('✅ System settings loaded and cached from database.');
	} catch (error) {
		logger.error('Failed to load settings from database:', error);
		// In a real-world scenario, you might want to throw this error
		// to prevent the application from starting with invalid settings.
		throw new Error('Could not load settings from DB.');
	}
}

// Load database and authentication adapters
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) {
		logger.debug('Adapters already loaded, skipping');
		return;
	}

	// Load private config when needed (force reload to pick up changes after setup)
	const config = await loadPrivateConfig(true);

	// If private config doesn't exist yet (during setup), we can't load adapters
	if (!config || !config.DB_TYPE) {
		logger.debug('Private config not available yet - skipping adapter loading during setup');
		return;
	}

	logger.debug(`🔌 Loading \x1b[34m${config.DB_TYPE}\x1b[0m adapters...`);

	try {
		switch (config.DB_TYPE) {
			case 'mongodb': {
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
		logger.debug('Initializing \x1b[34mdefault theme\x1b[0m...');

		// Simply try to store the theme - the storeThemes method uses atomic upsert
		// so it will handle both insert (if not exists) and update (if exists) safely
		await dbAdapter.themes.storeThemes([DEFAULT_THEME]);
		logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m initialized successfully.');
	} catch (err) {
		// Log but don't fail - theme initialization is not critical for system startup
		logger.warn(`Theme initialization issue: ${err instanceof Error ? err.message : String(err)}`);
		logger.info('Continuing with system initialization despite theme issue...');
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
	const mediaFolderPath = publicEnv.MEDIA_FOLDER || './mediaFolder';
	if (building) return;
	const fs = await import('node:fs/promises');
	try {
		logger.debug(`Checking media folder: \x1b[34m${mediaFolderPath}\x1b[0m`); // Check if the media folder exists
		await fs.access(mediaFolderPath);
		logger.info(`Media folder already exists: \x1b[34m${mediaFolderPath}\x1b[0m`);
	} catch {
		// If the folder does not exist, create it
		logger.info(`Media folder not found. Creating new folder: \x1b[34m${mediaFolderPath}\x1b[0m`);
		await fs.mkdir(mediaFolderPath, { recursive: true });
		logger.info(`Media folder created successfully: \x1b[34m${mediaFolderPath}\x1b[0m`);
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
				logger.info('No virtual folders found. Creating default root folder...'); // Create a default root folder
				const defaultMediaFolder = publicEnv.MEDIA_FOLDER || 'mediaFolder';
				const rootFolderData = {
					name: defaultMediaFolder,
					path: defaultMediaFolder, // parentId is undefined for root folders
					order: 0,
					type: 'folder' as const
				};
				const creationResult = await dbAdapter.systemVirtualFolder.create(rootFolderData);

				if (!creationResult.success) {
					const error = creationResult.error;
					let errorMessage = 'Unknown error';

					if (error instanceof Error) {
						errorMessage = error.message;
					} else if (error && typeof error === 'object' && 'message' in error) {
						errorMessage = String((error as { message: unknown }).message);
					} else if (error) {
						errorMessage = String(error);
					}

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

			// Success - break the retry loop
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

// Initialize adapters
async function initializeRevisions(): Promise<void> {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.'); // Add any revision-specific setup if needed in the future
	logger.debug('Revisions initialized.');
}

// Core Initialization Logic
async function initializeSystem(forceReload = false): Promise<void> {
	// Prevent re-initialization
	if (isInitialized) {
		logger.debug('System already initialized. Skipping.');
		return;
	}

	const systemStartTime = performance.now();
	logger.info('Starting SvelteCMS System Initialization...');

	try {
		// 1. Check for setup mode first
		const step1StartTime = performance.now();

		// Check if we're in setup mode by trying to load private config
		const privateConfig = await loadPrivateConfig(forceReload);
		const setupModeDetected = !privateConfig || !privateConfig.DB_TYPE;

		logger.debug('Setup mode detection', {
			hasPrivateConfig: !!privateConfig,
			hasDbType: !!privateConfig?.DB_TYPE,
			setupModeDetected
		});

		if (setupModeDetected) {
			logger.info('Private config not available – running in setup mode (skipping full system initialization).');
			// Do NOT mark isConnected / isInitialized; leave system minimal for setup endpoints only
			logger.debug('Setup mode detected – aborting remaining initialization steps (models, themes, content).');
			return;
		}

		// 2. Load Adapters (only if not in setup mode)
		try {
			await loadAdapters();
		} catch (err) {
			logger.error(`Adapter loading failed: ${err instanceof Error ? err.message : String(err)}`);
			throw err;
		}

		// 3. Connect to Database (only if not in setup mode)
		// Declare connectionString outside try block so it's available for reconnection
		let connectionString: string;
		try {
			if (!dbAdapter) throw new Error('Database adapter failed to load.');

			// Build connection string from config
			if (privateConfig.DB_TYPE === 'mongodb') {
				const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
				const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER!)}:${encodeURIComponent(privateConfig.DB_PASSWORD!)}@` : '';
				const host = privateConfig.DB_HOST || 'localhost';
				const port = privateConfig.DB_PORT || 27017;
				const dbName = privateConfig.DB_NAME || 'sveltycms';
				const authSource = hasAuth ? '?authSource=admin' : '';
				connectionString = `mongodb://${authPart}${host}:${port}/${dbName}${authSource}`;
				logger.debug(`Connecting to MongoDB at ${host}:${port}/${dbName} ${hasAuth ? 'with authentication' : 'without authentication'}`);
			} else {
				// For other database types, construct connection string accordingly
				connectionString = ''; // Placeholder for other DB types
			}

			const result = await dbAdapter.connect(connectionString);
			if (!result.success) {
				const dbError = result.error;
				let errorMessage = 'Database connection failed';

				if (dbError) {
					if (typeof dbError === 'object' && 'code' in dbError && 'message' in dbError) {
						errorMessage = `[${dbError.code}] ${dbError.message}`;
					} else if (
						typeof dbError === 'object' &&
						dbError !== null &&
						'message' in dbError &&
						typeof (dbError as { message?: unknown }).message === 'string'
					) {
						errorMessage = (dbError as { message: string }).message;
					} else {
						errorMessage = String(dbError);
					}
				}

				const connectionError = new Error(errorMessage);
				throw connectionError;
			}
		} catch (err) {
			logger.error(`Database connection failed: ${err instanceof Error ? err.message : String(err)}`);
			throw err;
		}
		isConnected = true; // Mark connected after DB connection succeeds
		const step1Time = performance.now() - step1StartTime;
		logger.debug(`\x1b[32mStep 1 completed:\x1b[0m Database connected and adapters loaded in \x1b[32m${step1Time.toFixed(2)}ms\x1b[0m`);

		if (!dbAdapter) {
			throw new Error('Database adapter failed to load.');
		}

		// Verify all required adapter properties exist
		if (!dbAdapter.auth || !dbAdapter.media || !dbAdapter.widgets || !dbAdapter.themes || !dbAdapter.systemPreferences) {
			logger.error('Database adapter is missing required properties', {
				hasAuth: !!dbAdapter.auth,
				hasMedia: !!dbAdapter.media,
				hasWidgets: !!dbAdapter.widgets,
				hasThemes: !!dbAdapter.themes,
				hasSystemPreferences: !!dbAdapter.systemPreferences
			});
			// Force reload adapters and reconnect
			logger.debug('Forcing adapter reload and reconnection...');
			adaptersLoaded = false;
			isConnected = false;
			await loadAdapters();

			// Reconnect the new adapter instance
			const reconnectResult = await dbAdapter.connect(connectionString);
			if (!reconnectResult.success) {
				throw new Error(`Reconnection failed after adapter reload: ${reconnectResult.error}`);
			}
			isConnected = true;

			// Verify again
			if (!dbAdapter) {
				throw new Error('Database adapter still incomplete after reload and reconnection');
			}
			logger.debug('Adapter reloaded and reconnected successfully');
		}

		// 2. Setup Core Database Models (Essential for subsequent steps) - Run in parallel

		const step2StartTime = performance.now();

		try {
			await Promise.all([
				// Auth models are set up via dbAdapter.auth
				dbAdapter.auth.setupAuthModels().then(() => logger.debug('\x1b[34mAuth models\x1b[0m setup complete')),
				dbAdapter.media.setupMediaModels().then(() => logger.debug('\x1b[34mMedia models\x1b[0m setup complete')),
				dbAdapter.widgets.setupWidgetModels().then(() => logger.debug('\x1b[34mWidget models\x1b[0m setup complete')),
				dbAdapter.themes.setupThemeModels().then(() => logger.debug('\x1b[34mTheme models\x1b[0m setup complete')),
				dbAdapter.systemPreferences ? Promise.resolve(logger.debug('\x1b[34mSystem preferences\x1b[0m available')) : Promise.resolve()
			]);
			const step2Time = performance.now() - step2StartTime;
			logger.debug(`\x1b[32mStep 2 completed:\x1b[0m Database models setup in \x1b[32m${step2Time.toFixed(2)}ms\x1b[0m`);
		} catch (modelSetupErr) {
			logger.error(`Database model setup failed: ${modelSetupErr instanceof Error ? modelSetupErr.message : String(modelSetupErr)}`);
			throw modelSetupErr;
		} // 3. Initialize remaining components in parallel

		const step3StartTime = performance.now();

		try {
			// Initialize non-database components first
			await Promise.all([initializeMediaFolder(), initializeRevisions()]);

			// Wait a bit for database to be fully ready, then initialize virtual folders
			// This prevents race conditions when the DB connection is slow
			await new Promise((resolve) => setTimeout(resolve, 100));
			await initializeVirtualFolders();

			// Seed default theme first, then initialize ThemeManager to avoid race conditions
			await initializeDefaultTheme();
			await initializeThemeManager();

			const step3Time = performance.now() - step3StartTime;
			logger.debug(`\x1b[32mStep 3 completed:\x1b[0m System components initialized in \x1b[32m${step3Time.toFixed(2)}ms\x1b[0m`);
		} catch (componentErr) {
			logger.error(`Component initialization failed: ${componentErr instanceof Error ? componentErr.message : String(componentErr)}`);
			throw componentErr;
		} // 4. Initialize ContentManager (loads collection schemas into memory)

		const step4StartTime = performance.now();

		try {
			await contentManager.initialize();
			const step4Time = performance.now() - step4StartTime;
			logger.debug(`\x1b[32mStep 4 completed:\x1b[0m ContentManager initialized in \x1b[32m${step4Time.toFixed(2)}ms\x1b[0m`);
		} catch (contentErr) {
			logger.error(`ContentManager initialization failed: ${contentErr instanceof Error ? contentErr.message : String(contentErr)}`);
			throw contentErr;
		}

		// 4.5. Widget Discovery and Auto-Registration (Drupal-inspired approach)
		const step4_5StartTime = performance.now();
		try {
			// Import widget discovery service
			const { widgetDiscovery } = await import('@src/services/widgetDiscovery');

			// Get current widgets from database using dbAdapter (database agnostic)
			if (!dbAdapter.widgets) {
				throw new Error('Widget database adapter not available');
			}

			const widgetsResult = await dbAdapter.widgets.findAll();
			if (!widgetsResult.success) {
				throw new Error(`Failed to fetch widgets: ${widgetsResult.error?.message || 'Unknown error'}`);
			}

			const dbWidgets = widgetsResult.data || [];
			const dbWidgetsList = dbWidgets.map((w) => ({ name: w.name, isActive: w.isActive }));

			// Discover widgets from filesystem and compare with database
			const discoveryResult = await widgetDiscovery.discoverWidgets(dbWidgetsList);

			// Auto-register new widgets found in filesystem using dbAdapter
			if (discoveryResult.new.length > 0) {
				logger.info(`🆕 Auto-registering ${discoveryResult.new.length} new widgets...`);
				let successCount = 0;
				let failCount = 0;

				for (const newWidget of discoveryResult.new) {
					try {
						await dbAdapter.widgets.register({
							name: newWidget.name,
							isActive: newWidget.isActive,
							instances: '', // Empty string as per Widget interface (schema will convert to Map)
							dependencies: newWidget.metadata.dependencies || []
						});
						successCount++;
					} catch {
						failCount++;
						logger.debug(`Widget ${newWidget.name} already exists or failed to register`);
					}
				}

				if (successCount > 0) {
					logger.info(`✅ Successfully registered ${successCount} new widgets`);
				}
				if (failCount > 0) {
					logger.debug(`⚠️  ${failCount} widgets were already registered or failed`);
				}
			}

			// Log warnings for missing widgets
			if (discoveryResult.missing.length > 0) {
				logger.warn(
					`⚠️  ${discoveryResult.missing.length} widgets are registered in database but missing from filesystem. Collections using these widgets may fail.`
				);
			}

			const step4_5Time = performance.now() - step4_5StartTime;
			logger.debug(`\x1b[32mStep 4.5 completed:\x1b[0m Widget discovery in \x1b[32m${step4_5Time.toFixed(2)}ms\x1b[0m`);
		} catch (widgetErr) {
			logger.error(`Widget discovery failed: ${widgetErr instanceof Error ? widgetErr.message : String(widgetErr)}`);
			// Don't throw - widgets are non-critical for system startup
		}

		// 4.6. Verify Collection-Specific Database Models (create models for each collection schema)
		const step4_6StartTime = performance.now();
		try {
			// Use contentManager to get all loaded collections (schemas)
			const collections = contentManager.getCollections();
			if (!dbAdapter) throw new Error('dbAdapter not available for model verification.');
			// Create models for each collection if needed
			if (collections && collections.length > 0) {
				for (const schema of collections) {
					if (schema._id && dbAdapter.collection?.createModel) {
						await dbAdapter.collection.createModel(schema);
					}
				}
			}
			logger.debug(
				`\x1b[34mContentManager\x1b[0m reports \x1b[34m${collections.length}\x1b[0m collections loaded. \x1b[33mVerification complete\x1b[0m`
			);
			const step4_6Time = performance.now() - step4_6StartTime;
			logger.debug(`\x1b[32mStep 4.6 completed:\x1b[0m Collection models verified in \x1b[32m${step4_6Time.toFixed(2)}ms\x1b[0m`);
		} catch (modelErr) {
			const message = `Error verifying collection models: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}`;
			logger.error(message);
			throw new Error(message);
		}

		// 5. Verify Collection-Specific Database Models (models are now created within ContentManager)

		const step5StartTime = performance.now();
		try {
			const collections = contentManager.getCollections(); // For legacy compatibility, create a collectionMap if needed
			const collectionMap = new Map(collections.map((schema) => [schema._id, schema]));
			if (!dbAdapter) throw new Error('dbAdapter not available for model verification.'); // Since ContentManager now handles model creation, this step is purely for verification.
			// We can simply log that this step is complete, as the critical logic is in ContentManager.
			// If ContentManager failed, initialization would have already stopped.

			const schemas = Array.from(collectionMap.values());
			logger.debug(`\x1b[34mContentManager\x1b[0m reports \x1b[34m${schemas.length}\x1b[0m collections loaded. \x1b[33mVerification complete\x1b[0m`);

			const step5Time = performance.now() - step5StartTime;
			logger.debug(`\x1b[32mStep 5 completed:\x1b[0m Collection models verified in \x1b[32m${step5Time.toFixed(2)}ms\x1b[0m`);
		} catch (modelErr) {
			const message = `Error verifying collection models: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}`;
			logger.error(message);
			throw new Error(message);
		} // 6. Initialize Authentication (after DB adapter is ready)

		const step6StartTime = performance.now();

		if (!dbAdapter) {
			throw new Error('Database adapter not initialized'); // Use Error instead of kit's error
		}

		try {
			// Initialize authentication using dbAdapter instead of authAdapter
			auth = new Auth(dbAdapter, getDefaultSessionStore());
			if (!auth) {
				throw new Error('Auth initialization failed - constructor returned null/undefined');
			} // Verify auth methods are available

			let authMethods: Array<keyof Auth> = [];
			if (auth !== null) {
				authMethods = (Object.keys(auth) as Array<keyof Auth>).filter((key) => typeof (auth as Auth)[key] === 'function');
				logger.debug(
					`Auth instance created with \x1b[34m${authMethods.length}\x1b[0m methods:`,
					authMethods.slice(0, 5).join(', ') + (authMethods.length > 5 ? '...' : '')
				);
				// Test auth functionality
				if (typeof (auth as Auth).validateSession !== 'function') {
					throw new Error('Auth instance missing validateSession method');
				}
			} else {
				throw new Error('Auth instance is null after initialization');
			}

			const step6Time = performance.now() - step6StartTime;
			logger.debug(`\x1b[32mStep 6 completed:\x1b[0m Authentication initialized and verified in \x1b[32m${step6Time.toFixed(2)}ms\x1b[0m`);
		} catch (authErr) {
			logger.error(`Auth initialization failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`);
			throw authErr;
		} // Load settings from the database into the cache
		await loadSettingsFromDB();

		// Set initialization flag
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

// --- Status & Reinitialization Helpers ---

/**
 * Initializes the system on the first non-setup request.
 * This prevents the server from trying to connect to the DB during setup.
 */
export function initializeOnRequest(): Promise<void> {
	const isBuildProcess = typeof process !== 'undefined' && process.argv?.some((arg) => ['build', 'check'].includes(arg));

	if (!building && !isBuildProcess) {
		if (!initializationPromise) {
			logger.debug('Creating system initialization promise on first request...');

			// Check if we're in setup mode before attempting to initialize
			initializationPromise = (async () => {
				// First check if we're in setup mode by checking the private config
				const privateConfig = await loadPrivateConfig();
				const setupModeDetected = !privateConfig || !privateConfig.DB_TYPE || !privateConfig.DB_HOST;

				if (setupModeDetected) {
					logger.info('Setup mode detected - skipping database connection and initialization');
					return Promise.resolve();
				}

				// Only run full initialization if we're not in setup mode
				return initializeSystem();
			})();

			initializationPromise.catch((err) => {
				logger.error(`The main initializationPromise was rejected: ${err instanceof Error ? err.message : String(err)}`);
				logger.error('Clearing initialization promise to allow retry');
				initializationPromise = null;
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

export async function reinitializeSystem(force = false): Promise<{ status: string; error?: string }> {
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
	}

	if (initializationPromise) {
		return { status: 'initialization-in-progress' };
	}

	try {
		logger.info(`Manual reinitialization requested${force ? ' (force)' : ''}`);
		initializationPromise = initializeSystem(force);
		await initializationPromise;
		return { status: 'initialized' };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// Clear the failed promise so retries are possible
		initializationPromise = null;
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
