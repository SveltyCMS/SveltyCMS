/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description Finalizes the initial CMS setup (one‑time destructive operation unless force=true).
 * @summary
 *  - Connects using provided DB credentials
 *  - (Force) Wipes all existing database data (dropDatabase with per‑collection fallback)
 *  - Persists system + feature + API key settings (public & private visibility)
 *  - Creates or updates the admin user (idempotent)
 *  - Generates a 32‑byte random key for any missing secrets (e.g. JWT)
 *  - Invalidates & reloads global settings cache
 *  - Creates an authenticated session (auto‑login) for the admin user when auth is ready
 *  - Updates `config/private.ts` with DB credentials if they differ
 *  - Writes an installation marker `config/.installed`
 *  - Emits structured logs with a correlationId for traceability
 *
 * Request Body (JSON):
 *  {
 *    database: { type, host, port, name, user, password },
 *    system: { siteName, hostDev, hostProd, defaultLanguage, availableLanguages, mediaFolder, useGoogleOAuth?, useRedis?, useMapbox? },
 *    apiKeys?: { googleClientId?, googleClientSecret?, redisHost?, redisPort?, redisPassword?, mapboxApiToken?, secretMapboxApiToken? },
 *    admin: { username, email, password, confirmPassword },
 *    force?: boolean // optional: re‑run setup even if already completed (will wipe data)
 *  }
 *
 * Success Response (200):
 *  { success: true, message: string, redirectPath: string, loggedIn: boolean }
 * Failure Responses:
 *  409 Setup already completed (when force not supplied)
 *  500 Generic / validation / DB errors
 *
 */

import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { connectToMongoDBWithConfig } from '@src/databases/mongodb/dbconnect';
import { getPublicSettings, invalidateSettingsCache, loadGlobalSettings } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { hashPassword } from '@src/utils/password';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';

// Interface definitions for better type safety
interface DatabaseConfig {
	type: string;
	host: string;
	port: number;
	name: string;
	user: string;
	password: string;
}

interface SystemConfig {
	siteName: string;
	hostDev: string;
	hostProd: string;
	defaultLanguage: string;
	availableLanguages: string[];
	mediaFolder: string;
	useGoogleOAuth?: boolean;
	useRedis?: boolean;
	useMapbox?: boolean;
}

interface ApiKeysConfig {
	googleClientId?: string;
	googleClientSecret?: string;
	redisHost?: string;
	redisPort?: string;
	redisPassword?: string;
	mapboxApiToken?: string;
	secretMapboxApiToken?: string;
}

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const setupData = await request.json();
		const { database, admin, system, apiKeys, force } = setupData as {
			database: DatabaseConfig;
			admin: AdminConfig;
			system: SystemConfig;
			apiKeys?: ApiKeysConfig;
			force?: boolean;
		};

		// Sanitize & early-validate admin user BEFORE any destructive operations (e.g. dropping DB)
		const rawAdmin: unknown = admin;
		const adminObj = rawAdmin && typeof rawAdmin === 'object' ? (rawAdmin as Record<string, unknown>) : {};
		const adminSanitized: AdminConfig = {
			username: String(adminObj.username ?? ''),
			email: String(adminObj.email ?? ''),
			password: String(adminObj.password ?? ''),
			confirmPassword: String(adminObj.confirmPassword ?? '')
		};
		const adminValidation = safeParse(setupAdminSchema, adminSanitized);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid admin user data: ${issues}` }, { status: 400 });
		}

		const correlationId = randomBytes(6).toString('hex');
		logger.info('Starting setup completion process', {
			correlationId,
			db: { host: database.host, name: database.name, user: database.user },
			force: !!force
		});

		// Step 1: Ensure database connection is established
		logger.info('Connecting to MongoDB...', { correlationId });
		await connectToMongoDBWithConfig(database);
		logger.info('MongoDB connection established', { correlationId });

		// Step 2: Clear any existing data from database
		logger.info('Clearing existing database data...', { correlationId });
		await clearExistingDatabase({ correlationId });
		logger.info('Database cleared of old data', { correlationId });

		// Clear any cached settings to ensure we start fresh
		try {
			invalidateSettingsCache();
			logger.info('Settings cache cleared', { correlationId });
		} catch (e) {
			logger.warn('Could not clear settings cache', { correlationId, error: e instanceof Error ? e.message : String(e) });
		}

		// Step 2b: Check if setup is already completed (after clearing database)
		// This prevents re-running setup if it was already completed successfully
		if (!force) {
			try {
				// Check if the setup marker file exists
				const fs = await import('fs/promises');
				const path = await import('path');
				const markerPath = path.resolve(process.cwd(), 'config', '.installed');
				const markerExists = await fs
					.access(markerPath)
					.then(() => true)
					.catch(() => false);

				logger.info('Checking setup marker file', { correlationId, markerPath, markerExists });

				if (markerExists) {
					logger.info('Setup marker file exists, setup already completed', { correlationId });
					return json(
						{
							success: false,
							error: 'Setup already completed. Pass force=true to re-run (this will wipe data).'
						},
						{ status: 409 }
					);
				}

				// Also check for .svelty_installed in root
				const sveltyMarkerPath = path.resolve(process.cwd(), '.svelty_installed');
				const sveltyMarkerExists = await fs
					.access(sveltyMarkerPath)
					.then(() => true)
					.catch(() => false);

				logger.info('Checking Svelty marker file', { correlationId, sveltyMarkerPath, sveltyMarkerExists });

				if (sveltyMarkerExists) {
					logger.info('Svelty marker file exists, setup already completed', { correlationId });
					return json(
						{
							success: false,
							error: 'Setup already completed. Pass force=true to re-run (this will wipe data).'
						},
						{ status: 409 }
					);
				}
			} catch (e) {
				// Not fatal – continue
				logger.warn('Could not check setup marker file; continuing', { correlationId, error: e instanceof Error ? e.message : String(e) });
			}
		}

		// Step 3: Save all settings to database
		logger.info('Saving settings to database...', { correlationId });
		await saveSettingsToDatabase(system, apiKeys || {});
		logger.info('Settings saved to database', { correlationId });

		// Step 4: Create admin user
		logger.info('Creating/updating admin user...', { correlationId, admin: adminSanitized.email });
		await createAdminUser(adminSanitized, correlationId);
		logger.info('Admin user processed', { correlationId });

		// Step 5: Invalidate settings cache and reload from database
		logger.info('Invalidating settings cache...', { correlationId });
		invalidateSettingsCache();

		// Force reload the settings from database (with error handling)
		try {
			await loadGlobalSettings();
			const settings = getPublicSettings();
			logger.info('Settings cache reloaded & verified', {
				correlationId,
				SETUP_COMPLETED: settings.SETUP_COMPLETED,
				SITE_NAME: settings.SITE_NAME
			});

			// Ensure the settings are properly loaded by checking a few key settings
			const siteName = getPublicSetting('SITE_NAME');
			const setupCompleted = getPublicSetting('SETUP_COMPLETED');
			logger.info('Key settings verification', {
				correlationId,
				siteName,
				setupCompleted,
				cacheLoaded: true
			});
		} catch (loadError) {
			logger.warn('Could not reload settings cache, continuing anyway', {
				correlationId,
				error: loadError instanceof Error ? loadError.message : String(loadError)
			});
		}

		// Step 6: Update private config file with database settings (do this BEFORE response)
		logger.info('Updating private config file...', { correlationId });
		try {
			logger.info('About to call updatePrivateConfig with database config', {
				correlationId,
				dbType: database.type,
				dbHost: database.host,
				dbPort: database.port,
				dbName: database.name,
				dbUser: database.user
			});

			// Test file write capability first
			const fs = await import('fs/promises');
			const path = await import('path');
			const testPath = path.resolve(process.cwd(), 'config/private.ts');
			logger.info('Testing file write capability', { testPath });

			// Try to write a test content first
			const testContent = `// Test content - ${new Date().toISOString()}`;
			await fs.writeFile(testPath, testContent);
			logger.info('Test write successful');

			// Read it back to verify
			const readBack = await fs.readFile(testPath, 'utf8');
			logger.info('Test read back', { readBack });

			await updatePrivateConfig(database);
			logger.info('Private config updated successfully', { correlationId });
			
			// Clear private config cache to ensure new config is loaded
			try {
				const { clearPrivateConfigCache } = await import('@src/databases/db');
				clearPrivateConfigCache();
				logger.info('Private config cache cleared', { correlationId });
			} catch (cacheError) {
				logger.warn('Could not clear private config cache', {
					correlationId,
					error: cacheError instanceof Error ? cacheError.message : String(cacheError)
				});
			}

			// Step 6a: Disable setup mode after config is updated
			logger.info('Disabling setup mode...', { correlationId });
			try {
				const { disableSetupMode } = await import('@src/stores/globalSettings');
				disableSetupMode();
				logger.info('Setup mode disabled successfully', { correlationId });

				// Force reinitialize the config service to pick up the new configuration
				const { config } = await import('@src/lib/config.server');
				await config.forceReinitialize();
				logger.info('Config service reinitialized successfully', { correlationId });
			} catch (setupModeError) {
				logger.warn('Could not disable setup mode or reinitialize config', {
					correlationId,
					error: setupModeError instanceof Error ? setupModeError.message : String(setupModeError)
				});
			}
		} catch (error) {
			logger.error('Error updating private config', { correlationId, error: error instanceof Error ? error.message : String(error) });
			// Don't fail the setup for config file issues
		}

		// Step 6b: Small delay to ensure settings are properly cached
		logger.info('Waiting for settings to be properly cached...', { correlationId });
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Step 6c: Trigger system reinitialization to load new configuration
		logger.info('Triggering system reinitialization...', { correlationId });
		try {
			const { reinitializeSystem, getSystemStatus } = await import('@src/databases/db');
			const result = await reinitializeSystem(true);
			logger.info('System reinitialization result', { correlationId, result });

			// Check system status after reinitialization
			const status = getSystemStatus();
			logger.info('System status after reinitialization', { correlationId, status });

			if (status.authReady) {
				logger.info('Authentication system is ready after reinitialization', { correlationId });
			} else {
				logger.warn('Authentication system is NOT ready after reinitialization', { correlationId, status });
			}
		} catch (reinitError) {
			logger.warn('System reinitialization failed, but continuing with setup', {
				correlationId,
				error: reinitError instanceof Error ? reinitError.message : String(reinitError)
			});
		}

		// Step 6d: Wait for auth system to be ready before proceeding
		logger.info('Waiting for auth system to be ready...', { correlationId });
		try {
			const { auth } = await import('@src/databases/db');
			let authReady = false;
			const maxWaitTime = 30000; // 30 seconds
			const startTime = Date.now();

			while (!authReady && Date.now() - startTime < maxWaitTime) {
				if (auth && typeof auth.validateSession === 'function') {
					authReady = true;
					logger.info('Auth system is ready', { correlationId, waitTime: Date.now() - startTime });
				} else {
					logger.debug('Auth system not ready yet, waiting...', { correlationId, elapsed: Date.now() - startTime });
					await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
				}
			}

			if (!authReady) {
				logger.warn('Auth system not ready after waiting', { correlationId, maxWaitTime });
			}
		} catch (authWaitError) {
			logger.warn('Error waiting for auth system', {
				correlationId,
				error: authWaitError instanceof Error ? authWaitError.message : String(authWaitError)
			});
		}

		// Step 7: Write setup marker file (do this BEFORE response)
		logger.info('Writing setup marker file...', { correlationId });
		try {
			const fs = await import('fs/promises');
			const path = await import('path');
			const markerPath = path.resolve(process.cwd(), 'config', '.installed');
			await fs.mkdir(path.dirname(markerPath), { recursive: true });
			await fs.writeFile(markerPath, JSON.stringify({ completedAt: new Date().toISOString(), correlationId }));
			logger.info('Setup marker written to config/.installed', { correlationId });
		} catch (markerErr) {
			logger.warn('Failed to write setup marker', { correlationId, error: markerErr instanceof Error ? markerErr.message : String(markerErr) });
			// Don't fail the setup for marker file issues
		}

		// Step 8: Auto-create session for the admin user so they're logged in immediately
		interface SessionCookieMeta {
			name: string;
			value: string;
			attributes?: Record<string, unknown>;
		}
		let sessionCookie: SessionCookieMeta | null = null;
		try {
			// Lazy import auth system pieces (db.ts) AFTER settings saved & adapters loaded via subsequent init cycle
			const { auth } = await import('@src/databases/db');
			if (auth) {
				const userAdapter = new UserAdapter();
				const adminUser = await userAdapter.getUserByEmail({ email: admin.email });
				if (adminUser?._id) {
					const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
					// create session directly through auth (handles store)
					const session = await auth.createSession({ user_id: adminUser._id, expires: expiresAt });
					sessionCookie = auth.createSessionCookie(session._id) as SessionCookieMeta;
					cookies.set(sessionCookie.name, sessionCookie.value, { ...(sessionCookie.attributes || {}), path: '/' });
					logger.info('Admin session created during setup completion', { correlationId });
				}
			} else {
				logger.warn('Auth not yet initialized during setup completion – admin auto-login skipped', { correlationId });
			}
		} catch (sessErr) {
			logger.warn('Failed to auto-login admin user after setup', {
				correlationId,
				error: sessErr instanceof Error ? sessErr.message : String(sessErr)
			});
		}

		// Step 8b: Clear private config cache to force reload after setup completion
		try {
			const { clearPrivateConfigCache, reinitializeSystem } = await import('@src/databases/db');
			clearPrivateConfigCache();
			logger.info('Private config cache cleared for reinitialization', { correlationId });

			// Reinitialize the system with the new configuration
			const reinitResult = await reinitializeSystem(true);
			logger.info('System reinitialization result', { correlationId, result: reinitResult });
		} catch (cacheErr) {
			logger.warn('Failed to clear private config cache or reinitialize system', {
				correlationId,
				error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
			});
		}

		// Step 9 (response): Provide redirect path hint to first collection
		let redirectPath = '/';
		try {
			// Use the same redirect logic as the login page to ensure language prefix is included
			const { contentManager } = await import('@src/content/ContentManager');
			const first = contentManager.getFirstCollection();
			if (first?.path) {
				// Get the default language from settings
				const { getPublicSetting } = await import('@src/stores/globalSettings');
				const defaultLanguage = getPublicSetting('DEFAULT_CONTENT_LANGUAGE') || 'en';
				// Ensure the collection path has a leading slash
				const collectionPath = first.path.startsWith('/') ? first.path : `/${first.path}`;
				redirectPath = `/${defaultLanguage}${collectionPath}`;
			}
		} catch {
			// swallow – auto-login is optional
		}
		const response = json({
			success: true,
			message: 'Setup completed successfully',
			redirectPath,
			loggedIn: !!sessionCookie
		});

		return response;
	} catch (error) {
		logger.error('Setup completion error', { error: error instanceof Error ? error.message : String(error) });
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during setup'
			},
			{ status: 500 }
		);
	}
};

async function updatePrivateConfig(dbConfig: DatabaseConfig) {
	const fs = await import('fs/promises');
	const path = await import('path');

	const configPath = path.resolve(process.cwd(), 'config/private.ts');
	logger.info('updatePrivateConfig: Starting update', { configPath });

	// Only update if file already exists; do NOT create (template copy happens in vite.config)
	const exists = await fs
		.access(configPath)
		.then(() => true)
		.catch(() => false);

	logger.info('updatePrivateConfig: File exists check', { configPath, exists });

	if (!exists) {
		logger.warn('⚠️ Skipping private config update – file missing (should have been created from template earlier).');
		return;
	}

	let configContent = await fs.readFile(configPath, 'utf8');
	logger.info('updatePrivateConfig: Current file content length', { contentLength: configContent.length });
	logger.debug('updatePrivateConfig: Current file content', { content: configContent });

	// Ensure header comment matches simplified format (optional)
	configContent = configContent.replace(
		/\/\*\*[\s\S]*?@description[\s\S]*?\*\/\n/,
		`/**\n * @file config/private.ts\n * @description Private configuration file - will be populated during setup\n */\n\n`
	);

	// Check if we need to add database configuration fields
	const hasDbFields = /DB_HOST:\s*['"`][^'"`]*['"`]/.test(configContent);

	if (!hasDbFields) {
		// The file doesn't have database fields, so we need to add them
		// Find the createPrivateConfig call and add the database fields
		const createConfigMatch = configContent.match(/createPrivateConfig\(\{([\s\S]*?)\}\);/);
		if (createConfigMatch) {
			const configBody = createConfigMatch[1];
			const newConfigBody = configBody.replace(
				/(\s*\/\/ If you have any essential static private config, add here\. Otherwise, leave empty\.\s*)/,
				`	// Database Configuration
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port},
	DB_NAME: '${dbConfig.name}',
	DB_USER: '${dbConfig.user}',
	DB_PASSWORD: '${dbConfig.password}',

	// Security Keys
	JWT_SECRET_KEY: '${generateRandomKey()}',
	ENCRYPTION_KEY: '${generateRandomKey()}',

	// Multi-tenancy
	MULTI_TENANT: false,

$1`
			);
			configContent = configContent.replace(createConfigMatch[0], `createPrivateConfig({${newConfigBody}});`);
		} else {
			// Fallback: replace the entire content
			configContent = `/**
 * @file config/private.ts
 * @description Private configuration file - will be populated during setup
 */

import { createPrivateConfig } from './types.ts';

export const privateEnv = createPrivateConfig({
	// Database Configuration
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port},
	DB_NAME: '${dbConfig.name}',
	DB_USER: '${dbConfig.user}',
	DB_PASSWORD: '${dbConfig.password}',

	// Security Keys
	JWT_SECRET_KEY: '${generateRandomKey()}',
	ENCRYPTION_KEY: '${generateRandomKey()}',

	// Multi-tenancy
	MULTI_TENANT: false,

	// If you have any essential static private config, add here. Otherwise, leave empty.
});
`;
		}
	} else {
		// The file has database fields, so we can replace them
		configContent = configContent
			.replace(/DB_TYPE:\s*['"][^'"]*['"]/, `DB_TYPE: '${dbConfig.type}'`)
			.replace(/DB_HOST:\s*['"][^'"]*['"]/, `DB_HOST: '${dbConfig.host}'`)
			.replace(/DB_PORT:\s*\d+/, `DB_PORT: ${dbConfig.port}`)
			.replace(/DB_NAME:\s*['"][^'"]*['"]/, `DB_NAME: '${dbConfig.name}'`)
			.replace(/DB_USER:\s*['"][^'"]*['"]/, `DB_USER: '${dbConfig.user}'`)
			.replace(/DB_PASSWORD:\s*['"][^'"]*['"]/, `DB_PASSWORD: '${dbConfig.password}'`);

		// If JWT secret empty in file, inject one (search for JWT_SECRET_KEY: '' or undefined)
		if (/JWT_SECRET_KEY:\s*['"]{2}/.test(configContent)) {
			configContent = configContent.replace(/JWT_SECRET_KEY:\s*['"]{2}/, `JWT_SECRET_KEY: '${generateRandomKey()}'`);
		}

		// Add ENCRYPTION_KEY if it doesn't exist
		if (!/ENCRYPTION_KEY:\s*['"`][^'"`]+['"`]/.test(configContent)) {
			// Add ENCRYPTION_KEY after JWT_SECRET_KEY
			configContent = configContent.replace(/(JWT_SECRET_KEY:\s*['"`][^'"`]+['"`])/, `$1,\n\tENCRYPTION_KEY: '${generateRandomKey()}'`);
		}
	}

	logger.info('updatePrivateConfig: About to write file', { configPath, contentLength: configContent.length });
	await fs.writeFile(configPath, configContent);
	logger.info('updatePrivateConfig: File written successfully', { configPath });

	// Verify the file was written correctly
	const verifyContent = await fs.readFile(configPath, 'utf8');
	logger.info('updatePrivateConfig: Verification - file content length after write', { contentLength: verifyContent.length });
	logger.debug('updatePrivateConfig: Verification - file content after write', { content: verifyContent });
}

// Helper function to generate random keys for JWT and encryption
function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Clear all existing collections from the database to ensure a clean setup
 */
async function clearExistingDatabase(opts: { correlationId: string }): Promise<void> {
	const { correlationId } = opts;
	try {
		if (mongoose.connection.readyState !== 1) {
			throw new Error('MongoDB connection not established');
		}
		// Faster dropDatabase approach; fall back to per-collection if it fails (e.g., lacking perms)
		try {
			await mongoose.connection.db.dropDatabase();
			logger.info('Database dropped via dropDatabase()', { correlationId });
			return;
		} catch (dropErr) {
			logger.warn('dropDatabase() failed, attempting per-collection clear', {
				correlationId,
				error: dropErr instanceof Error ? dropErr.message : String(dropErr)
			});
		}
		const collections = await mongoose.connection.db.listCollections().toArray();
		logger.info('Clearing collections individually', { correlationId, count: collections.length });
		for (const collection of collections) {
			try {
				await mongoose.connection.db.dropCollection(collection.name);
				logger.debug('Dropped collection', { correlationId, name: collection.name });
			} catch (error) {
				if ((error as Error).message?.includes('ns not found')) {
					logger.debug('Collection already absent', { correlationId, name: collection.name });
				} else {
					logger.error('Error dropping collection', {
						correlationId,
						name: collection.name,
						error: error instanceof Error ? error.message : String(error)
					});
					throw error;
				}
			}
		}
		logger.info('Database cleared (per-collection mode)', { correlationId });
	} catch (error) {
		logger.error('Error clearing database', { correlationId, error: error instanceof Error ? error.message : String(error) });
		throw error;
	}
}

async function saveSettingsToDatabase(system: SystemConfig, apiKeys: ApiKeysConfig) {
	// NOTE: Database credentials are intentionally NOT persisted here. They live only in config/private.ts
	// (written by updatePrivateConfig) to keep them out of the runtime settings collection.
	// Only non‑DB system + feature flags + API tokens (if provided) are stored below.
	const settings = [
		// Setup completion marker (public so it can be checked)
		{ key: 'SETUP_COMPLETED', value: true, visibility: 'public' },
		{ key: 'SETUP_COMPLETED_AT', value: new Date().toISOString(), visibility: 'private' },

		// Public settings
		{ key: 'SITE_NAME', value: system.siteName, visibility: 'public' },
		{ key: 'HOST_DEV', value: system.hostDev, visibility: 'public' },
		{ key: 'HOST_PROD', value: system.hostProd, visibility: 'public' },
		{ key: 'DEFAULT_CONTENT_LANGUAGE', value: system.defaultLanguage, visibility: 'public' },
		{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: system.availableLanguages, visibility: 'public' },
		{ key: 'BASE_LOCALE', value: system.defaultLanguage, visibility: 'public' }, // Set base locale to default language
		{ key: 'LOCALES', value: system.availableLanguages, visibility: 'public' }, // Set locales to available languages
		{ key: 'MEDIA_FOLDER', value: system.mediaFolder, visibility: 'public' },

		// Essential settings with defaults
		{ key: 'PASSWORD_LENGTH', value: 8, visibility: 'public' },
		{ key: 'MAX_FILE_SIZE', value: 10485760, visibility: 'public' }, // 10MB
		{ key: 'BODY_SIZE_LIMIT', value: 10485760, visibility: 'public' }, // 10MB
		{ key: 'DEMO', value: false, visibility: 'public' },
		{ key: 'SEASONS', value: false, visibility: 'public' },
		{ key: 'SEASON_REGION', value: 'Western_Europe', visibility: 'public' },

		// Image processing defaults
		{ key: 'IMAGE_SIZES', value: { sm: 320, md: 640, lg: 1024, xl: 1920 }, visibility: 'public' },
		{ key: 'MEDIA_OUTPUT_FORMAT_QUALITY', value: { format: 'webp', quality: 80 }, visibility: 'public' },

		// Logging defaults
		{ key: 'LOG_RETENTION_DAYS', value: 30, visibility: 'private' },
		{ key: 'LOG_LEVELS', value: ['error', 'warn', 'info'], visibility: 'private' },

		// Private settings
		{ key: 'USE_GOOGLE_OAUTH', value: system.useGoogleOAuth, visibility: 'private' },
		{ key: 'USE_REDIS', value: system.useRedis, visibility: 'private' },
		{ key: 'USE_MAPBOX', value: system.useMapbox, visibility: 'private' },

		// API keys (private)
		{ key: 'GOOGLE_CLIENT_ID', value: apiKeys?.googleClientId ?? undefined, visibility: 'private' },
		{ key: 'GOOGLE_CLIENT_SECRET', value: apiKeys?.googleClientSecret ?? undefined, visibility: 'private' },
		{ key: 'REDIS_HOST', value: apiKeys?.redisHost ?? undefined, visibility: 'private' },
		{ key: 'REDIS_PORT', value: apiKeys?.redisPort ?? undefined, visibility: 'private' },
		{ key: 'REDIS_PASSWORD', value: apiKeys?.redisPassword ?? undefined, visibility: 'private' },
		{ key: 'MAPBOX_API_TOKEN', value: apiKeys?.mapboxApiToken ?? undefined, visibility: 'private' },
		{ key: 'SECRET_MAPBOX_API_TOKEN', value: apiKeys?.secretMapboxApiToken ?? undefined, visibility: 'private' }
	];

	// Remove entries with undefined (unset optional secrets) to avoid cluttering the collection
	const filtered = settings.filter((s) => s.value !== undefined);

	// Use the dedicated SystemSettingModel for key-value settings
	const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');
	for (const setting of filtered) {
		await SystemSettingModel.updateOne(
			{ key: setting.key, scope: 'system' },
			{
				$set: {
					key: setting.key,
					value: setting.value,
					scope: 'system',
					visibility: setting.visibility,
					isGlobal: true,
					updatedAt: new Date()
				}
			},
			{ upsert: true }
		);
	}
}

async function createAdminUser(admin: AdminConfig, correlationId?: string) {
	logger.debug('Processing admin user', { correlationId, email: admin.email });
	if (!admin.username || !admin.email || !admin.password) {
		throw new Error('Admin user information is incomplete');
	}
	if (typeof admin.email !== 'string' || !admin.email.trim() || !admin.email.includes('@')) {
		throw new Error('Admin email is missing or invalid.');
	}

	// Validate admin user data against centralized schema
	const validationResult = safeParse(setupAdminSchema, admin);
	if (!validationResult.success) {
		const errors = validationResult.issues.map((issue) => issue.message).join(', ');
		throw new Error(`Invalid admin user data: ${errors}`);
	}

	// Hash the password using the centralized password utility
	const hashedPassword = await hashPassword(admin.password);

	// Use the user adapter
	const userAdapter = new UserAdapter();

	// Check if user already exists
	const existingUser = await userAdapter.getUserByEmail({ email: admin.email });

	if (existingUser) {
		// User exists, update their information
		const updatedData = {
			username: admin.username,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			updatedAt: new Date()
		};

		const result = await userAdapter.updateUserAttributes(existingUser._id, updatedData);
		logger.info('Admin user updated', { correlationId, email: admin.email });
		return result;
	} else {
		// User doesn't exist, create new one
		const userData = {
			username: admin.username,
			email: admin.email,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const result = await userAdapter.createUser(userData);
		if (!result) {
			throw new Error('Failed to create admin user');
		}

		logger.info('Admin user created', { correlationId, email: admin.email });
		return result;
	}
}
