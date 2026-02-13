/**
 * @file src/routes/setup/seed.ts
 * @description Functions for seeding the database with initial data (settings, themes, collections)
 * during the setup process.
 *
 * This replaces the static configuration files with database settings.
 * Uses database-agnostic interfaces for compatibility across different database engines.
 *
 * Collection Seeding Strategy:
 * - seedCollectionsForSetup(): Lightweight version for setup that directly reads compiled
 * collections from filesystem and creates models. Bypasses ContentManager to avoid
 * global dbAdapter dependency issues during setup mode.
 * - This allows ContentManager to have collections pre-cached when system fully initializes,
 * resulting in faster redirects and better UX after setup completion.
 */

import { publicConfigSchema } from '@src/databases/schemas';
import type { DatabaseId } from '@src/content/types';
import type { DatabaseAdapter, Theme } from '@src/databases/dbInterface';
import { invalidateSettingsCache } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';
import { dateToISODateString } from '@utils/dateUtils';
import { safeParse } from 'valibot';
import { getAllPermissions } from '@src/databases/auth';
import { defaultRoles as importedDefaultRoles } from '@src/databases/auth/defaultRoles';
import { generateCategoryNodesFromPaths } from '@src/content/utils';
import type { ContentNode, Schema } from '@src/content/types';

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from '@root/project.inlang/settings.json';
import { setupManager } from './setupManager';

// ============================================================================
// EXPORTED DEFAULTS - Loaded from project.inlang/settings.json
// ============================================================================

export const DEFAULT_SYSTEM_LANGUAGES = inlangSettings.locales || ['en', 'de'];
export const DEFAULT_BASE_LOCALE = inlangSettings.baseLocale || 'en';
export const DEFAULT_CONTENT_LANGUAGES = DEFAULT_SYSTEM_LANGUAGES;
export const DEFAULT_CONTENT_LANGUAGE = DEFAULT_BASE_LOCALE;

// ============================================================================

// Type for setting data in snapshots
interface SettingData {
	value: unknown;
	visibility?: 'public' | 'private';
	category?: 'public' | 'private';
	description?: string;
}

// Default theme that matches the ThemeManager's DEFAULT_THEME
const defaultTheme: Theme = {
	_id: '670e8b8c4d123456789abcde' as DatabaseId, // MongoDB ObjectId-style string
	path: '', // Default path
	name: 'SveltyCMSTheme',

	isActive: false,
	isDefault: true,
	config: {
		tailwindConfigPath: '',
		assetsPath: ''
	},
	createdAt: dateToISODateString(new Date()),
	updatedAt: dateToISODateString(new Date())
};

// Re-export defaultRoles from shared module for backward compatibility
export const defaultRoles = importedDefaultRoles;

// Seeds the default theme into the database
export async function seedDefaultTheme(dbAdapter: DatabaseAdapter, tenantId?: string): Promise<void> {
	logger.info(`🎨 Checking if default theme needs seeding${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!dbAdapter || !dbAdapter.themes) {
		throw new Error('Database adapter or themes interface not available');
	}

	try {
		// Check if themes already exist
		const existingThemes = await dbAdapter.themes.getAllThemes();
		if (Array.isArray(existingThemes) && existingThemes.length > 0) {
			logger.info(`✅ Themes already exist${tenantId ? ` for tenant ${tenantId}` : ''}, skipping theme seeding`);
			return;
		}

		// Seed the default theme
		logger.info(`🎨 Seeding default theme${tenantId ? ` for tenant ${tenantId}` : ''}...`);
		const themeToStore = {
			...defaultTheme,
			...(tenantId && { tenantId })
		};
		await dbAdapter.themes.storeThemes([themeToStore]);
		logger.info(`✅ Default theme seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
	} catch (error) {
		logger.error(`Failed to seed default theme${tenantId ? ` for tenant ${tenantId}` : ''}:`, error);
		throw error;
	}
}

/**
 * Seeds default roles into the database
 * Roles are now stored in database for dynamic management via UI
 * Admin role gets all available permissions automatically
 */
export async function seedRoles(dbAdapter: DatabaseAdapter, tenantId?: string): Promise<void> {
	logger.info(`🔐 Seeding default roles${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!dbAdapter || !dbAdapter.auth) {
		throw new Error('Database adapter or auth interface not available');
	}

	try {
		// Get all available permissions for admin role
		const allPermissions = getAllPermissions();
		const adminPermissions = allPermissions.map((p) => p._id);

		// Seed all default roles in parallel
		const rolePromises = defaultRoles.map(async (role) => {
			try {
				// Admin role gets all permissions
				// For tenant-scoped roles, generate unique IDs to avoid
				// primary key collisions with roles from other tenants
				const roleToCreate = {
					...role,
					_id: tenantId ? crypto.randomUUID() : role._id,
					permissions: role._id === 'admin' ? adminPermissions : role.permissions,
					...(tenantId && { tenantId })
				};

				const result = await dbAdapter.auth.createRole(roleToCreate);
				// createRole returns DatabaseResult — check success instead of relying on exceptions
				if (result && 'success' in result && !result.success) {
					logger.warn(
						`Role "${role.name}" creation returned failure${tenantId ? ` for tenant ${tenantId}` : ''}: ${result.error?.message || 'unknown'}`
					);
				} else {
					logger.debug(`✅ Role "${role.name}" seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
				}
			} catch (error) {
				// Skip if role already exists (duplicate key error)
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (errorMessage.includes('duplicate') || errorMessage.includes('E11000') || errorMessage.includes('ER_DUP_ENTRY')) {
					logger.debug(`ℹ️  Role "${role.name}" already exists${tenantId ? ` for tenant ${tenantId}` : ''}, skipping`);
				} else {
					logger.error(`Failed to seed role "${role.name}"${tenantId ? ` for tenant ${tenantId}` : ''}:`, error);
					throw error;
				}
			}
		});

		await Promise.all(rolePromises);

		logger.info(`✅ Default roles seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
	} catch (error) {
		logger.error(`Failed to seed roles${tenantId ? ` for tenant ${tenantId}` : ''}:`, error);
		throw error;
	}
}

/**
 * Seeds collections from filesystem into database
 * This bypasses ContentManager to avoid global dbAdapter dependency during setup
 *
 * @returns Information about the first collection (for faster redirects)
 */
export async function seedCollectionsForSetup(
	dbAdapter: DatabaseAdapter,
	tenantId?: string
): Promise<{ firstCollection: { name: string; path: string } | null }> {
	const overallStart = performance.now();
	logger.info(`📦 Seeding collections from filesystem${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!dbAdapter || !dbAdapter.collection) {
		throw new Error('Database adapter or collection interface not available');
	}

	let firstCollection: { name: string; path: string } | null = null;

	try {
		// Import the collection scanner directly to avoid ContentManager
		const { scanCompiledCollections } = await import('@src/content/collectionScanner');

		const scanStart = performance.now();
		const collections = (await scanCompiledCollections()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
		const scanTime = performance.now() - scanStart;
		logger.debug(`⏱️  Collection scan: ${scanTime.toFixed(2)}ms (found ${collections.length}, sorted alphabetically)`);

		if (collections.length === 0) {
			logger.info('ℹ️  No collections found in filesystem, skipping collection seeding');
			return { firstCollection: null };
		}

		logger.info(`Found ${collections.length} collections to seed`);

		let successCount = 0;
		let skipCount = 0;
		const totalCollections = collections.length;
		const modelCreationStart = performance.now();

		// Register collections in batches to optimize database operations
		const BATCH_SIZE = 50;
		for (let i = 0; i < collections.length; i += BATCH_SIZE) {
			const batch = collections.slice(i, i + BATCH_SIZE);
			const batchPromises = batch.map(async (schema) => {
				try {
					const createStart = performance.now();
					// Try to create the collection model in database
					// Setting force=false (default) to use the new idempotency check
					await dbAdapter.collection.createModel(schema);

					const createTime = performance.now() - createStart;
					logger.info(`✅ Created collection model: ${schema.name || 'unknown'} (${createTime.toFixed(0)}ms)`);
					successCount++;

					// Capture the first collection for redirect (deterministic from sorted array)
					if (!firstCollection && collections.length > 0 && collections[0].path && collections[0].name) {
						firstCollection = {
							name: collections[0].name,
							path: collections[0].path
						};
						logger.debug(`First collection identified: ${firstCollection.name} at ${firstCollection.path}`);
					}

					setupManager.updateProgress(successCount + skipCount, totalCollections);
				} catch (error) {
					// Collection might already exist or have schema issues
					const errorMessage = error instanceof Error ? error.message : String(error);
					if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
						logger.debug(`Collection '${schema.name || 'unknown'}' already exists, skipping`);
						skipCount++;
					} else {
						logger.error(`❌ Failed to create collection '${schema.name || 'unknown'}'${tenantId ? ` for tenant ${tenantId}` : ''}: ${errorMessage}`);
					}
				}
			});

			await Promise.all(batchPromises);
			logger.debug(`📦 Seeded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(collections.length / BATCH_SIZE)}`);
		}

		setupManager.updateProgress(totalCollections, totalCollections);

		const modelCreationTime = performance.now() - modelCreationStart;

		// Step 5: PERSISTENCE - Populate contentNodes table so ContentManager sees them immediately
		// This ensures skipReconciliation: true in ContentManager works correctly after setup.
		try {
			logger.info('🌳 Generating category nodes and mapping structure...');
			const categoryNodes = generateCategoryNodesFromPaths(collections as Schema[]);
			const updates: { path: string; changes: Partial<ContentNode> }[] = [];

			// Add Category Nodes
			for (const [path, node] of categoryNodes.entries()) {
				updates.push({
					path,
					changes: {
						name: node.name,
						nodeType: 'category',
						order: 0,
						translations: []
					} as any
				});
			}

			// Add Collection Nodes
			for (const schema of collections) {
				if (!schema.path) continue;
				updates.push({
					path: schema.path,
					changes: {
						_id: schema._id as any,
						name: schema.name || schema._id,
						nodeType: 'collection',
						order: schema.order || 0,
						icon: schema.icon,
						translations: schema.translations || [],
						collectionDef: schema
					} as any
				});
			}

			if (updates.length > 0) {
				logger.info(`💾 Persisting ${updates.length} content nodes to database...`);
				const structResult = await dbAdapter.content.nodes.bulkUpdate(updates);
				if (structResult.success) {
					logger.info(`✅ Successfully persisted ${structResult.data.length} content nodes.`);
				} else {
					logger.warn('⚠️ Failed to persist content nodes:', structResult.message);
				}
			}
		} catch (structError) {
			logger.warn('⚠️ Error building/persisting content structure:', structError);
		}

		const overallTime = performance.now() - overallStart;

		logger.info(`✅ Collections seeding completed: ${successCount} created, ${skipCount} skipped`);
		logger.info(`⏱️  Model creation time: ${modelCreationTime.toFixed(2)}ms`);
		logger.info(`⏱️  Total seed time: ${overallTime.toFixed(2)}ms`);

		return { firstCollection };
	} catch (error) {
		const overallTime = performance.now() - overallStart;
		if (error instanceof Error) {
			logger.error(`Failed to seed collections after ${overallTime.toFixed(2)}ms: ${error.message}`);
			if (error.stack) {
				logger.debug('Stack trace:', error.stack);
			}
		} else {
			// Enhanced error logging for non-Error objects
			logger.error(`Failed to seed collections after ${overallTime.toFixed(2)}ms. Error type: ${typeof error}`);
			if (typeof error === 'object') {
				try {
					logger.error(`Error object: ${JSON.stringify(error)}`);
				} catch {
					logger.error('Could not stringify error object');
				}
			} else {
				logger.error(`Error value: ${String(error)}`);
			}
		}
		// Don't throw - collections can be created later through the UI
		logger.warn('Continuing setup without collection seeding...');
		return { firstCollection: null };
	}
}

/**
 * Seeds demo records for the standard collections (Posts, Menu, etc.)
 * This adds actual content entries so the CMS doesn't look empty after setup.
 */
export async function seedDemoRecords(dbAdapter: DatabaseAdapter, collections: Schema[], tenantId?: string): Promise<void> {
	logger.info(`📝 Seeding demo records${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!dbAdapter || !dbAdapter.crud) {
		logger.warn('CRUD interface not available, skipping demo record seeding');
		return;
	}

	try {
		for (const schema of collections) {
			const collectionId = schema._id;
			if (!collectionId) continue;

			// Seed "Posts" as a demo
			if (schema.name === 'Posts') {
				const posts = [
					{
						title: 'Welcome to SveltyCMS',
						content: 'This is your first post, created automatically during setup.',
						status: 'published',
						author: 'Admin',
						...(tenantId && { tenantId })
					},
					{
						title: 'Modern CMS Architecture',
						content: 'SveltyCMS uses Svelte 5 runes and a database-agnostic adapter pattern.',
						status: 'published',
						author: 'Admin',
						...(tenantId && { tenantId })
					}
				];

				// Use insertMany to trigger the new dynamic table + packData logic
				await dbAdapter.crud.insertMany(collectionId, posts);
				logger.info(`✅ Seeded ${posts.length} demo posts into ${collectionId}`);
			}

			// Seed "Menu" as a demo
			if (schema.name === 'Menu') {
				const menuItems = [
					{ label: 'Home', url: '/', order: 1, ...(tenantId && { tenantId }) },
					{ label: 'Blog', url: '/blog', order: 2, ...(tenantId && { tenantId }) },
					{ label: 'Contact', url: '/contact', order: 3, ...(tenantId && { tenantId }) }
				];
				await dbAdapter.crud.insertMany(collectionId, menuItems);
				logger.info(`✅ Seeded ${menuItems.length} demo menu items into ${collectionId}`);
			}
		}
	} catch (error) {
		logger.error('Failed to seed demo records:', error);
		// Don't block setup
	}
}

// Initialize system from setup using database-agnostic interface
export async function initSystemFromSetup(
	adapter: DatabaseAdapter,
	tenantId?: string,
	isDemoSeed = false
): Promise<{ firstCollection: { name: string; path: string } | null }> {
	logger.info(`🚀 Starting system initialization from setup${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!adapter) {
		throw new Error('Database adapter not available. Database must be initialized first.');
	}

	// Run seeding steps in parallel for maximum performance
	const [seedResults] = await Promise.all([
		(async () => {
			const result = await seedCollectionsForSetup(adapter, tenantId);
			if (isDemoSeed) {
				const { scanCompiledCollections } = await import('@src/content/collectionScanner');
				const collections = await scanCompiledCollections();
				await seedDemoRecords(adapter, collections, tenantId);
			}
			return result;
		})(),
		seedSettings(adapter, tenantId, isDemoSeed),
		seedDefaultTheme(adapter, tenantId),
		seedRoles(adapter, tenantId)
	]);

	// Invalidate the settings cache and reload from database
	invalidateSettingsCache();
	const { loadSettingsFromDB } = await import('@src/databases/db');
	await loadSettingsFromDB();

	logger.info(`✅ System initialization completed${tenantId ? ` for tenant ${tenantId}` : ''}`);

	return seedResults;
}

// Initialize system with separate critical (sync) and content (async) phases
// Used for instant setup completion
export async function initSystemFast(
	adapter: DatabaseAdapter,
	tenantId?: string,
	isDemoSeed = false
): Promise<{
	criticalPromise: Promise<void>;
	backgroundTask: () => Promise<void>;
}> {
	// Critical: Settings, Default Theme, Roles (needed for Admin User creation)
	const criticalPromise = (async () => {
		logger.info(`🚀 Starting critical system initialization${tenantId ? ` for tenant ${tenantId}` : ''}...`);

		if (!adapter) throw new Error('Database adapter not available.');

		await Promise.all([seedSettings(adapter, tenantId, isDemoSeed), seedDefaultTheme(adapter, tenantId), seedRoles(adapter, tenantId)]);

		// Reload settings immediately
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('@src/databases/db');
		await loadSettingsFromDB();

		logger.info(`✅ Critical system initialization completed${tenantId ? ` for tenant ${tenantId}` : ''}`);
	})();

	// Background: Heavy content seeding (can happen after redirect)
	const backgroundTask = async () => {
		if (!adapter) return;
		await seedCollectionsForSetup(adapter, tenantId);
	};

	return { criticalPromise, backgroundTask };
}

// Default public settings that were previously in config/public.ts
export const defaultPublicSettings: Array<{ key: string; value: unknown; description?: string }> = [
	// Host configuration
	{ key: 'HOST_DEV', value: 'http://localhost:5173', description: 'Development server URL' },
	{ key: 'HOST_PROD', value: 'https://yourdomain.com', description: 'Production server URL' },

	// Site configuration
	{ key: 'SITE_NAME', value: 'SveltyCMS', description: 'The public name of the website' },
	{ key: 'TIMEZONE', value: 'UTC', description: 'Default timezone for the system' },
	{ key: 'PASSWORD_LENGTH', value: 8, description: 'Minimum required length for user passwords' },

	// Language Configuration
	{ key: 'DEFAULT_CONTENT_LANGUAGE', value: DEFAULT_CONTENT_LANGUAGE, description: 'Default language for content' },
	{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: DEFAULT_CONTENT_LANGUAGES, description: 'List of available content languages' },
	{ key: 'BASE_LOCALE', value: DEFAULT_BASE_LOCALE, description: 'Default/base locale for the CMS interface' },
	{ key: 'LOCALES', value: DEFAULT_SYSTEM_LANGUAGES, description: 'List of available interface locales' },

	// Media configuration
	{ key: 'MEDIA_STORAGE_TYPE', value: 'local', description: 'Type of media storage (local, s3, r2, cloudinary)' },
	{ key: 'MEDIA_FOLDER', value: './mediaFolder', description: 'Server path where media files are stored' },
	{ key: 'MEDIA_OUTPUT_FORMAT_QUALITY', value: { format: 'webp', quality: 80 }, description: 'Image format and quality settings' },
	{ key: 'IMAGE_SIZES', value: { sm: 600, md: 900, lg: 1200 }, description: 'Image sizes for automatic resizing' },
	{ key: 'MAX_FILE_SIZE', value: 10485760, description: 'Maximum file size for uploads in bytes (10MB)' },
	{ key: 'BODY_SIZE_LIMIT', value: 10485760, description: 'Body size limit for server requests in bytes (10MB)' },
	{ key: 'USE_ARCHIVE_ON_DELETE', value: true, description: 'Enable archiving instead of permanent deletion' },

	// Seasons Icons for login page
	{ key: 'SEASONS', value: true, description: 'Enable seasonal themes on the login page' },
	{ key: 'SEASON_REGION', value: 'Western_Europe', description: 'Region for determining seasonal themes' },

	// Default Theme Configuration
	// The ID will be generated by the database adapter and set after insertion
	{ key: 'DEFAULT_THEME_ID', value: '', description: 'ID of the default theme (set by adapter)' },
	{ key: 'DEFAULT_THEME_NAME', value: 'SveltyCMSTheme', description: 'Name of the default theme' },
	{ key: 'DEFAULT_THEME_PATH', value: '', description: 'Path to the default theme CSS file' },
	{ key: 'DEFAULT_THEME_IS_DEFAULT', value: true, description: 'Whether the default theme is the default theme' },

	// Advanced Settings
	{ key: 'EXTRACT_DATA_PATH', value: './exports/data.json', description: 'File path for exported collection data' },
	{ key: 'PKG_VERSION', value: '1.0.0', description: 'Application version (can be overridden, but usually read from package.json)' },

	// NOTE: PKG_VERSION is read dynamically from package.json at runtime, not stored in DB
	// This ensures version always reflects the installed package and helps detect outdated installations

	// Logging
	{
		key: 'LOG_LEVELS',
		value: ['info', 'warn', 'error', 'debug'],
		description: 'Active logging levels (none, info, warn, error, debug, fatal, trace)'
	},
	{ key: 'LOG_RETENTION_DAYS', value: 30, description: 'Number of days to keep log files' },
	{ key: 'LOG_ROTATION_SIZE', value: 10485760, description: 'Maximum size of a log file in bytes before rotation (10MB)' }

	// NOTE: DEMO mode is controlled exclusively via config/private.ts (INFRASTRUCTURE_KEYS).
	// Do NOT add a DEMO key here — it would create a split-brain where the server
	// reads private config (true) but the client reads the DB-seeded default (false).
];

/**
 * Default private settings that were previously in config/private.ts
 * Note: Sensitive settings like API keys should be set via GUI or CLI
 * Database config, JWT keys, and encryption keys are handled separately in private config files
 */
export const defaultPrivateSettings: Array<{ key: string; value: unknown; description?: string }> = [
	// Security / 2FA
	{ key: 'USE_2FA', value: false, description: 'Enable Two-Factor Authentication globally' },
	{ key: 'TWO_FACTOR_AUTH_BACKUP_CODES_COUNT', value: 10, description: 'Backup codes count for 2FA (1-50)' },

	// Telemetry (Privacy)
	{ key: 'SVELTYCMS_TELEMETRY', value: true, description: 'Enable SveltyCMS telemetry tracking' },

	// SMTP config
	{ key: 'SMTP_HOST', value: '', description: 'SMTP server host for sending emails' },
	{ key: 'SMTP_PORT', value: 587, description: 'SMTP server port' },
	{ key: 'SMTP_EMAIL', value: '', description: 'Email address to send from' },
	{ key: 'SMTP_PASSWORD', value: '', description: 'Password for the SMTP email account' },

	// Google OAuth
	{ key: 'USE_GOOGLE_OAUTH', value: false, description: 'Enable Google OAuth for login' },
	{ key: 'GOOGLE_CLIENT_ID', value: '', description: 'Google OAuth Client ID' },
	{ key: 'GOOGLE_CLIENT_SECRET', value: '', description: 'Google OAuth Client Secret' },

	// Redis config
	{ key: 'USE_REDIS', value: false, description: 'Enable Redis for caching' },
	{ key: 'REDIS_HOST', value: 'localhost', description: 'Redis server host address' },
	{ key: 'REDIS_PORT', value: 6379, description: 'Redis server port number' },
	{ key: 'REDIS_PASSWORD', value: '', description: 'Password for Redis server' },

	// Cache TTL Configuration (in seconds)
	{ key: 'CACHE_TTL_SCHEMA', value: 600, description: 'TTL for schema/collection definitions (10 minutes)' },
	{ key: 'CACHE_TTL_WIDGET', value: 600, description: 'TTL for widget data (10 minutes)' },
	{ key: 'CACHE_TTL_THEME', value: 300, description: 'TTL for theme configurations (5 minutes)' },
	{ key: 'CACHE_TTL_CONTENT', value: 180, description: 'TTL for content data (3 minutes)' },
	{ key: 'CACHE_TTL_MEDIA', value: 300, description: 'TTL for media metadata (5 minutes)' },
	{ key: 'CACHE_TTL_SESSION', value: 86400, description: 'TTL for user session data (24 hours)' },
	{ key: 'CACHE_TTL_USER', value: 60, description: 'TTL for user permissions (1 minute)' },
	{ key: 'CACHE_TTL_API', value: 300, description: 'TTL for API responses (5 minutes)' },

	// Session configuration
	{ key: 'SESSION_CLEANUP_INTERVAL', value: 300000, description: 'Interval in ms to clean up expired sessions (5 minutes)' },
	{ key: 'MAX_IN_MEMORY_SESSIONS', value: 1000, description: 'Maximum number of sessions to hold in memory' },
	{ key: 'DB_VALIDATION_PROBABILITY', value: 0.1, description: 'Probability (0-1) of validating a session against the DB' },
	{ key: 'SESSION_EXPIRATION_SECONDS', value: 86400, description: 'Duration in seconds until a session expires (24 hours)' },

	// Mapbox config
	{ key: 'USE_MAPBOX', value: false, description: 'Enable Mapbox integration' },
	{ key: 'MAPBOX_API_TOKEN', value: '', description: 'Public Mapbox API token (for client-side use)' },
	{ key: 'SECRET_MAPBOX_API_TOKEN', value: '', description: 'Secret Mapbox API token (for server-side use)' },

	// Other APIs
	{ key: 'GOOGLE_API_KEY', value: '', description: 'Google API Key for services like Maps and YouTube' },
	{ key: 'TWITCH_TOKEN', value: '', description: 'API token for Twitch integration' },
	{ key: 'USE_TIKTOK', value: false, description: 'Enable TikTok integration' },
	{ key: 'TIKTOK_TOKEN', value: '', description: 'API token for TikTok integration' },

	// Server configuration
	{ key: 'SERVER_PORT', value: 5173, description: 'Port for the application server' },

	// Roles and Permissions (previously required in private config)
	{ key: 'ROLES', value: ['admin', 'editor', 'viewer'], description: 'List of user roles available in the system' },
	{ key: 'PERMISSIONS', value: ['read', 'write', 'delete', 'admin'], description: 'List of permissions available in the system' },

	// Live Preview
	{ key: 'PREVIEW_SECRET', value: '', description: 'Secret for live preview handshake (auto-generated via /api/system/preview-secret)' }
];

/**
 * Seeds the database with default settings using database-agnostic interface.
 * This should be called during initial setup or when resetting to defaults.
 * Note: Database config and security keys are handled in private config files, not in DB
 * Only seeds settings that don't already exist (smart seeding).
 * @param dbAdapter Database adapter to use for operations
 */
export async function seedSettings(dbAdapter: DatabaseAdapter, tenantId?: string, isDemoSeed = false): Promise<void> {
	logger.info(`🌱 Checking which settings need seeding${tenantId ? ` for tenant ${tenantId}` : ''}...`);

	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	// Test database accessibility
	try {
		// Try a simple getMany operation to test connectivity
		await dbAdapter.systemPreferences.getMany(['HOST_DEV'], 'system');
		logger.debug('Database adapter is accessible');
	} catch (error) {
		logger.error('Database adapter is not accessible:', error);
		throw new Error(`Cannot access database adapter: ${error instanceof Error ? error.message : String(error)}`);
	}

	const allSettings = [...defaultPublicSettings, ...defaultPrivateSettings];

	// Create a Set of private setting keys for efficient lookup
	const privateSettingKeys = new Set(defaultPrivateSettings.map((s) => s.key));

	// Check which settings already exist
	const allKeys = allSettings.map((s) => s.key);
	let existingSettings: Record<string, unknown> = {};

	try {
		const result = await dbAdapter.systemPreferences.getMany(allKeys, 'system');
		if (result.success && result.data) {
			existingSettings = result.data;
		}
	} catch (error) {
		logger.debug(`Could not check existing settings for tenant ${tenantId}, will seed all:`, error);
	}

	// Filter out settings that already exist
	const settingsToSeed = allSettings.filter((setting) => !(setting.key in existingSettings));

	if (settingsToSeed.length === 0) {
		logger.info(`✅ All settings already exist${tenantId ? ` for tenant ${tenantId}` : ''}, skipping settings seeding`);
		return;
	}

	logger.info(
		`🌱 Seeding ${settingsToSeed.length} missing settings${tenantId ? ` for tenant ${tenantId}` : ''} (${Object.keys(existingSettings).length} already exist)...`
	);

	// Prepare settings for batch operation with category
	const settingsToSet: Array<{
		key: string;
		value: unknown;
		category: 'public' | 'private';
		scope: 'user' | 'system';
		userId?: DatabaseId;
		tenantId?: string;
	}> = [];

	for (const setting of settingsToSeed) {
		// Determine category based on whether the setting is in the private list
		const category = privateSettingKeys.has(setting.key) ? 'private' : 'public';

		let value = setting.value;

		// Override DEMO, SEASONS, SEASON_REGION if isDemoSeed
		if (isDemoSeed) {
			if (setting.key === 'DEMO') value = true;
			if (setting.key === 'SEASONS') value = true;
			if (setting.key === 'SEASON_REGION') value = 'Western_Europe';
		}

		settingsToSet.push({
			key: setting.key,
			value: value, // Store the actual value directly
			category, // Add category field for proper classification
			scope: 'system',
			...(tenantId && { tenantId })
		});
	}

	// Use batch operation for better performance
	try {
		const result = await dbAdapter.systemPreferences.setMany(settingsToSet);

		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to seed settings');
		}

		logger.info(`✅ Seeded ${settingsToSeed.length} missing settings`);
	} catch (error) {
		logger.error(`Failed to seed settings${tenantId ? ` for tenant ${tenantId}` : ''}:`, error);
		throw error;
	}

	// Populate public settings cache immediately after seeding
	// Private settings will be loaded later when the app starts and reads the private config file
	try {
		logger.info('🔄 Populating public settings cache...');

		// Only organize public settings for immediate cache population
		const publicSettings: Record<string, unknown> = {};

		// Add existing public settings first
		for (const [key, value] of Object.entries(existingSettings)) {
			const isPublic = defaultPublicSettings.some((s) => s.key === key);
			if (isPublic) {
				publicSettings[key] = (value as { value?: unknown }).value ?? value;
			}
		}

		// Add/overwrite with new seeded settings
		for (const setting of settingsToSeed) {
			const isPublic = defaultPublicSettings.some((s) => s.key === setting.key);
			if (isPublic) {
				publicSettings[setting.key] = setting.value;
			}
		}

		// Validate public settings
		const parsedPublic = safeParse(publicConfigSchema, publicSettings);

		if (parsedPublic.success) {
			// Private settings will be loaded when the app starts normally
			logger.info('✅ Public settings validated successfully');
		} else {
			logger.warn('Public settings validation failed');
			// Filter out expected undefined errors for cleaner logs if needed, or just log issues
			logger.debug('Public settings validation issues:', parsedPublic.issues);
		}
	} catch (error) {
		logger.error('Failed to populate settings cache:', error);
		// Don't throw here - seeding was successful, cache population is just an optimization
	}
}

/**
 * Exports all current settings to a JSON file using database-agnostic interface.
 * This creates a settings snapshot for project templates.
 */
type SettingsSnapshot = {
	version: string;
	exportedAt: string;
	settings: Record<string, { value: unknown; category: string; description: string }>;
};

export async function exportSettingsSnapshot(dbAdapter: DatabaseAdapter): Promise<SettingsSnapshot> {
	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	// Get all system settings - we'll need to implement a method to get all settings
	// For now, we'll get the known settings keys
	const allSettingKeys = [...defaultPublicSettings, ...defaultPrivateSettings].map((s) => s.key);

	const settingsResult = await dbAdapter.systemPreferences.getMany(allSettingKeys, 'system');

	if (!settingsResult.success) {
		throw new Error(`Failed to export settings: ${settingsResult.error?.message}`);
	}

	const snapshot: SettingsSnapshot = {
		version: '1.0.0',
		exportedAt: new Date().toISOString(),
		settings: {}
	};

	// Transform the settings data
	for (const [key, settingData] of Object.entries(settingsResult.data)) {
		if (settingData && typeof settingData === 'object' && 'data' in settingData) {
			const data = settingData as { data: SettingData };
			snapshot.settings[key] = {
				value: data.data.value,
				category: data.data.category || 'public',
				description: data.data.description || ''
			};
		}
	}

	return snapshot;
}

/**
 * Imports settings from a snapshot file using database-agnostic interface.
 * This allows restoring settings from a project template.
 */
export async function importSettingsSnapshot(snapshot: Record<string, unknown>, dbAdapter: DatabaseAdapter): Promise<void> {
	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	if (!snapshot.settings) {
		throw new Error('Invalid settings snapshot format');
	}

	logger.info('📥 Importing settings snapshot...');

	const settingsToSet: Array<{
		key: string;
		value: unknown;
		scope: 'user' | 'system';
		userId?: DatabaseId;
	}> = [];

	for (const [key, settingData] of Object.entries(snapshot.settings)) {
		const data = settingData as SettingData;
		settingsToSet.push({
			key,
			value: {
				data: data.value,
				category: data.category || 'public',
				description: data.description || '',
				isGlobal: true,
				updatedAt: new Date()
			},
			scope: 'system'
		});
	}

	const result = await dbAdapter.systemPreferences.setMany(settingsToSet);

	if (!result.success) {
		throw new Error(`Failed to import settings: ${result.error?.message}`);
	}

	logger.info('✅ Settings snapshot imported successfully');
}

/**
 * Seeds a demo tenant with default settings, theme, roles, and a user.
 */
export async function seedDemoTenant(dbAdapter: DatabaseAdapter, tenantId: string): Promise<void> {
	logger.info(`🚀 Seeding demo tenant ${tenantId}...`);

	// 1. Seed Settings (Force Demo Mode)
	await seedSettings(dbAdapter, tenantId, true);

	// 2. Seed Default Theme
	await seedDefaultTheme(dbAdapter, tenantId);

	// 3. Seed Roles
	await seedRoles(dbAdapter, tenantId);

	// 4. Create Admin User
	// We need to import auth service or use dbAdapter.auth directly
	if (dbAdapter.auth) {
		const result = await dbAdapter.auth.getRoleById('admin', tenantId);
		const adminRole = result.success ? result.data : null;
		if (adminRole) {
			const email = `demo-${tenantId.substring(0, 8)}@sveltycms.com`;
			const password = 'demo'; // Simple password for demo
			try {
				await dbAdapter.auth.createUser({
					email,
					password,
					role: adminRole._id,
					username: 'Demo Admin',
					tenantId
				});
				logger.info(`✅ Demo admin user created: ${email}`);
			} catch (e) {
				logger.warn(`Demo user creation failed (might exist): ${e instanceof Error ? e.message : String(e)}`);
			}
		}
	}

	logger.info(`✅ Demo tenant ${tenantId} seeded successfully.`);
}
