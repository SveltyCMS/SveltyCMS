import { error } from '@sveltejs/kit';
import { g as getSystemState, f as isSystemReady } from './state.js';
import './logger.js';
import { l as logger } from './logger.server.js';
import { b as dbInitPromise, d as dbAdapter, S as SESSION_COOKIE_NAME, a as auth } from './db.js';
import { isSetupComplete } from './setupCheck.js';
import { dev } from './index3.js';
import { getPrivateSettingSync } from './settingsService.js';
import { p as publicConfigSchema } from './schemas.js';
import { d as dateToISODateString } from './dateUtils.js';
import { safeParse } from 'valibot';
import { g as getAllPermissions } from './permissions.js';
import './crypto.js';
import { cacheService, SESSION_CACHE_TTL_MS } from './CacheService.js';
import { d as defaultRoles$1 } from './defaultRoles.js';
import { i as inlangSettings } from './settings.js';
import { m as metricsService } from './MetricsService.js';
import { R as RateLimiter } from './rateLimiter.js';
import '@isaacs/ttlcache';
import { a as app } from './store.svelte.js';
import { l as locales } from './runtime.js';
import { T as ThemeManager } from './themeManager.js';
import { b as building } from './environment.js';
let initializationState = 'pending';
let initError = null;
let initStartTime = 0;
const INIT_TIMEOUT_MS = 3e4;
const handleSystemState = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const setupComplete = isSetupComplete();
	let systemState = getSystemState();
	const isHealthCheck = pathname.startsWith('/api/system/health') || pathname.startsWith('/api/dashboard/health');
	const isStaticAsset2 = pathname.startsWith('/static') || pathname.startsWith('/assets') || pathname.startsWith('/_');
	if (!isHealthCheck && !isStaticAsset2) {
		logger.debug(
			`[handleSystemState] ${event.request.method} ${pathname}${event.url.search} (Data: ${event.isDataRequest}), state: ${systemState.overallState}, initState: ${initializationState}`
		);
	}
	if (systemState.overallState === 'IDLE') {
		if (initializationState === 'pending') {
			if (setupComplete) {
				initializationState = 'in-progress';
				initStartTime = Date.now();
				logger.info('System is IDLE and setup is complete. Starting initialization...');
				try {
					await Promise.race([
						dbInitPromise,
						new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT_MS))
					]);
					systemState = getSystemState();
					initializationState = 'complete';
					const duration = Date.now() - initStartTime;
					logger.info(`Initialization complete in ${duration}ms. System state: ${systemState.overallState}`);
				} catch (err) {
					initializationState = 'failed';
					initError = err instanceof Error ? err : new Error(String(err));
					logger.error('Initialization failed:', initError);
					throw error(503, 'Service initialization failed. Please check server logs.');
				}
			} else {
				logger.info('System is IDLE and setup is not complete. Skipping DB initialization.');
				initializationState = 'complete';
			}
		} else if (initializationState === 'in-progress') {
			const elapsed = Date.now() - initStartTime;
			if (elapsed > INIT_TIMEOUT_MS) {
				initializationState = 'failed';
				initError = new Error(`Initialization exceeded timeout (${INIT_TIMEOUT_MS}ms)`);
				logger.error('Initialization timeout:', initError);
				throw error(503, 'Service initialization timed out. Please check server logs.');
			}
			logger.debug(`[handleSystemState] Request to ${pathname} waiting for ongoing initialization (${elapsed}ms elapsed)...`);
			try {
				await Promise.race([
					dbInitPromise,
					new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization wait timeout')), INIT_TIMEOUT_MS - elapsed))
				]);
				systemState = getSystemState();
			} catch (err) {
				logger.error('Initialization wait failed:', err);
				throw error(503, 'Service initialization is taking longer than expected.');
			}
		} else if (initializationState === 'failed') {
			logger.error('System initialization previously failed:', initError);
			throw error(503, `Service unavailable: ${initError?.message || 'Unknown initialization error'}`);
		}
	}
	if (systemState.overallState === 'IDLE') {
		const allowedPaths = [
			'/setup',
			'/api/setup',
			'/api/system/health',
			'/api/dashboard/health',
			'/login',
			'/static',
			'/assets',
			'/favicon.ico',
			'/.well-known',
			'/_',
			'/api/system/version',
			'/api/debug'
			// Allow debug endpoints
		];
		const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/' || isLocalizedSetup;
		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during IDLE (setup mode) state.`);
			return resolve(event);
		}
	}
	if (systemState.overallState === 'INITIALIZING') {
		const allowedPaths = [
			'/api/system/health',
			'/api/dashboard/health',
			'/setup',
			'/api/setup',
			'/login',
			'/.well-known',
			'/_',
			'/api/system/version',
			'/api/debug'
		];
		const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || (!setupComplete && pathname === '/') || isLocalizedSetup;
		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during INITIALIZING state.`);
			return resolve(event);
		}
		logger.debug(`Request to ${pathname} waiting for initialization to complete...`);
		try {
			await Promise.race([dbInitPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Init wait timeout')), INIT_TIMEOUT_MS))]);
			systemState = getSystemState();
			logger.debug(`Initialization complete. System state is now: ${systemState.overallState}`);
		} catch (err) {
			logger.error('Initialization wait error:', err);
			throw error(503, 'Service Unavailable: System initialization failed.');
		}
		if (!isSystemReady()) {
			logger.warn(`Request to ${pathname} blocked: System failed to initialize properly.`);
			throw error(503, 'Service Unavailable: The system failed to initialize. Please contact an administrator.');
		}
	}
	const isNowReady = systemState.overallState === 'READY' || systemState.overallState === 'DEGRADED';
	if (!isNowReady) {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup', '/api/system/version', '/api/debug'];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix));
		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during ${systemState.overallState} state.`);
			return resolve(event);
		}
		if (pathname.startsWith('/.well-known/') || pathname.includes('devtools')) {
			logger.trace(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
		} else {
			logger.warn(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
		}
		throw error(503, 'Service Unavailable: The system is starting up. Please try again in a moment.');
	}
	if (systemState.overallState === 'DEGRADED') {
		const degradedServices = Object.entries(systemState.services)
			.filter(([, s]) => s.status === 'unhealthy')
			.map(([name]) => name);
		if (degradedServices.length > 0) {
			event.locals.degradedServices = degradedServices;
			logger.warn(`Request to ${pathname} is proceeding in a DEGRADED state. Unhealthy services: ${degradedServices.join(', ')}`);
		}
	}
	return resolve(event);
};
const DEFAULT_SYSTEM_LANGUAGES = inlangSettings.locales || ['en', 'de'];
const DEFAULT_BASE_LOCALE = inlangSettings.baseLocale;
const DEFAULT_CONTENT_LANGUAGES = DEFAULT_SYSTEM_LANGUAGES;
const DEFAULT_CONTENT_LANGUAGE = DEFAULT_BASE_LOCALE;
const defaultTheme = {
	_id: '670e8b8c4d123456789abcde',
	// MongoDB ObjectId-style string
	path: '',
	// Default path
	name: 'SveltyCMSTheme',
	isActive: false,
	isDefault: true,
	config: {
		tailwindConfigPath: '',
		assetsPath: ''
	},
	createdAt: dateToISODateString(/* @__PURE__ */ new Date()),
	updatedAt: dateToISODateString(/* @__PURE__ */ new Date())
};
const defaultRoles = defaultRoles$1;
async function seedDefaultTheme(dbAdapter2, tenantId) {
	logger.info(`🎨 Checking if default theme needs seeding${tenantId ? ` for tenant ${tenantId}` : ''}...`);
	if (!dbAdapter2 || !dbAdapter2.themes) {
		throw new Error('Database adapter or themes interface not available');
	}
	try {
		const existingThemes = await dbAdapter2.themes.getAllThemes();
		if (Array.isArray(existingThemes) && existingThemes.length > 0) {
			logger.info(`✅ Themes already exist${tenantId ? ` for tenant ${tenantId}` : ''}, skipping theme seeding`);
			return;
		}
		logger.info(`🎨 Seeding default theme${tenantId ? ` for tenant ${tenantId}` : ''}...`);
		const themeToStore = {
			...defaultTheme,
			...(tenantId && { tenantId })
		};
		await dbAdapter2.themes.storeThemes([themeToStore]);
		logger.info(`✅ Default theme seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
	} catch (error2) {
		logger.error(`Failed to seed default theme${tenantId ? ` for tenant ${tenantId}` : ''}:`, error2);
		throw error2;
	}
}
async function seedRoles(dbAdapter2, tenantId) {
	logger.info(`🔐 Seeding default roles${tenantId ? ` for tenant ${tenantId}` : ''}...`);
	if (!dbAdapter2 || !dbAdapter2.auth) {
		throw new Error('Database adapter or auth interface not available');
	}
	try {
		const allPermissions = getAllPermissions();
		const adminPermissions = allPermissions.map((p) => p._id);
		for (const role of defaultRoles) {
			try {
				const roleToCreate = {
					...role,
					permissions: role._id === 'admin' ? adminPermissions : role.permissions,
					...(tenantId && { tenantId })
				};
				await dbAdapter2.auth.createRole(roleToCreate);
				logger.debug(`✅ Role "${role.name}" seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
			} catch (error2) {
				const errorMessage = error2 instanceof Error ? error2.message : String(error2);
				if (errorMessage.includes('duplicate') || errorMessage.includes('E11000')) {
					logger.debug(`ℹ️  Role "${role.name}" already exists${tenantId ? ` for tenant ${tenantId}` : ''}, skipping`);
				} else {
					logger.error(`Failed to seed role "${role.name}"${tenantId ? ` for tenant ${tenantId}` : ''}:`, error2);
					throw error2;
				}
			}
		}
		logger.info(`✅ Default roles seeded successfully${tenantId ? ` for tenant ${tenantId}` : ''}`);
	} catch (error2) {
		logger.error(`Failed to seed roles${tenantId ? ` for tenant ${tenantId}` : ''}:`, error2);
		throw error2;
	}
}
const defaultPublicSettings = [
	// Host configuration
	{ key: 'HOST_DEV', value: 'http://localhost:5173', description: 'Development server URL' },
	{ key: 'HOST_PROD', value: 'https://yourdomain.com', description: 'Production server URL' },
	// Site configuration
	{ key: 'SITE_NAME', value: 'SveltyCMS', description: 'The public name of the website' },
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
	{ key: 'LOG_ROTATION_SIZE', value: 10485760, description: 'Maximum size of a log file in bytes before rotation (10MB)' },
	// Demo Mode
	{ key: 'DEMO', value: false, description: 'Enable demo mode (restricts certain features)' }
];
const defaultPrivateSettings = [
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
	{ key: 'SESSION_CLEANUP_INTERVAL', value: 3e5, description: 'Interval in ms to clean up expired sessions (5 minutes)' },
	{ key: 'MAX_IN_MEMORY_SESSIONS', value: 1e3, description: 'Maximum number of sessions to hold in memory' },
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
	{ key: 'PERMISSIONS', value: ['read', 'write', 'delete', 'admin'], description: 'List of permissions available in the system' }
];
async function seedSettings(dbAdapter2, tenantId, isDemoSeed = false) {
	logger.info(`🌱 Checking which settings need seeding${tenantId ? ` for tenant ${tenantId}` : ''}...`);
	if (!dbAdapter2 || !dbAdapter2.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}
	try {
		await dbAdapter2.systemPreferences.getMany(['HOST_DEV'], 'system');
		logger.debug('Database adapter is accessible');
	} catch (error2) {
		logger.error('Database adapter is not accessible:', error2);
		throw new Error(`Cannot access database adapter: ${error2 instanceof Error ? error2.message : String(error2)}`);
	}
	const allSettings = [...defaultPublicSettings, ...defaultPrivateSettings];
	const privateSettingKeys = new Set(defaultPrivateSettings.map((s) => s.key));
	const allKeys = allSettings.map((s) => s.key);
	let existingSettings = {};
	try {
		const result = await dbAdapter2.systemPreferences.getMany(allKeys, 'system');
		if (result.success && result.data) {
			existingSettings = result.data;
		}
	} catch (error2) {
		logger.debug(`Could not check existing settings for tenant ${tenantId}, will seed all:`, error2);
	}
	const settingsToSeed = allSettings.filter((setting) => !(setting.key in existingSettings));
	if (settingsToSeed.length === 0) {
		logger.info(`✅ All settings already exist${tenantId ? ` for tenant ${tenantId}` : ''}, skipping settings seeding`);
		return;
	}
	logger.info(
		`🌱 Seeding ${settingsToSeed.length} missing settings${tenantId ? ` for tenant ${tenantId}` : ''} (${Object.keys(existingSettings).length} already exist)...`
	);
	const settingsToSet = [];
	for (const setting of settingsToSeed) {
		const category = privateSettingKeys.has(setting.key) ? 'private' : 'public';
		let value = setting.value;
		if (isDemoSeed) {
			if (setting.key === 'DEMO') value = true;
			if (setting.key === 'SEASONS') value = true;
			if (setting.key === 'SEASON_REGION') value = 'Western_Europe';
		}
		settingsToSet.push({
			key: setting.key,
			value,
			// Store the actual value directly
			category,
			// Add category field for proper classification
			scope: 'system',
			...(tenantId && { tenantId })
		});
	}
	try {
		const result = await dbAdapter2.systemPreferences.setMany(settingsToSet);
		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to seed settings');
		}
		logger.info(`✅ Seeded ${settingsToSeed.length} missing settings`);
	} catch (error2) {
		logger.error(`Failed to seed settings${tenantId ? ` for tenant ${tenantId}` : ''}:`, error2);
		throw error2;
	}
	try {
		logger.info('🔄 Populating public settings cache...');
		const publicSettings = {};
		for (const [key, value] of Object.entries(existingSettings)) {
			const isPublic = defaultPublicSettings.some((s) => s.key === key);
			if (isPublic) {
				publicSettings[key] = value.value ?? value;
			}
		}
		for (const setting of settingsToSeed) {
			const isPublic = defaultPublicSettings.some((s) => s.key === setting.key);
			if (isPublic) {
				publicSettings[setting.key] = setting.value;
			}
		}
		const parsedPublic = safeParse(publicConfigSchema, publicSettings);
		if (parsedPublic.success) {
			logger.info('✅ Public settings validated successfully');
		} else {
			logger.warn('Public settings validation failed');
			logger.debug('Public settings validation issues:', parsedPublic.issues);
		}
	} catch (error2) {
		logger.error('Failed to populate settings cache:', error2);
	}
}
async function seedDemoTenant(dbAdapter2, tenantId) {
	logger.info(`🚀 Seeding demo tenant ${tenantId}...`);
	await seedSettings(dbAdapter2, tenantId, true);
	await seedDefaultTheme(dbAdapter2, tenantId);
	await seedRoles(dbAdapter2, tenantId);
	if (dbAdapter2.auth) {
		const result = await dbAdapter2.auth.getRoleById('admin', tenantId);
		const adminRole = result.success ? result.data : null;
		if (adminRole) {
			const email = `demo-${tenantId.substring(0, 8)}@sveltycms.com`;
			const password = 'demo';
			try {
				await dbAdapter2.auth.createUser({
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
const sessionCache = /* @__PURE__ */ new Map();
const sessionCacheRegistry = new FinalizationRegistry((sessionId) => {
	sessionCache.delete(sessionId);
	logger.trace(`Session cache entry GC'd: ${sessionId.substring(0, 8)}...`);
});
const MAX_STRONG_REFS = 100;
const strongRefs = /* @__PURE__ */ new Map();
const lastRefreshAttempt = /* @__PURE__ */ new Map();
const lastRotationAttempt = /* @__PURE__ */ new Map();
const SESSION_ROTATION_INTERVAL_MS = 15 * 60 * 1e3;
const rotationRateLimiter = new RateLimiter({
	IP: [100, 'm'],
	cookie: {
		name: 'session_rotation_limit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY') || 'fallback-dev-secret',
		rate: [100, 'm'],
		preflight: true
	}
});
function getSessionFromCache(sessionId) {
	const now = Date.now();
	const strongRef = strongRefs.get(sessionId);
	if (strongRef && now - strongRef.timestamp < SESSION_CACHE_TTL_MS) {
		return strongRef;
	}
	const weakRef = sessionCache.get(sessionId);
	if (weakRef) {
		const entry = weakRef.deref();
		if (entry && now - entry.timestamp < SESSION_CACHE_TTL_MS) {
			addToStrongRefs(sessionId, entry);
			return entry;
		}
	}
	return null;
}
function setSessionInCache(sessionId, entry) {
	addToStrongRefs(sessionId, entry);
	const weakRef = new WeakRef(entry);
	sessionCache.set(sessionId, weakRef);
	sessionCacheRegistry.register(entry, sessionId);
}
function addToStrongRefs(sessionId, entry) {
	if (strongRefs.has(sessionId)) {
		strongRefs.delete(sessionId);
	}
	strongRefs.set(sessionId, entry);
	if (strongRefs.size > MAX_STRONG_REFS) {
		const firstKey = strongRefs.keys().next().value;
		if (firstKey) {
			strongRefs.delete(firstKey);
		}
	}
}
if (typeof setInterval !== 'undefined') {
	setInterval(
		() => {
			const now = Date.now();
			for (const [sessionId, data] of strongRefs.entries()) {
				if (now - data.timestamp > SESSION_CACHE_TTL_MS) {
					strongRefs.delete(sessionId);
				}
			}
			for (const [sessionId, timestamp] of lastRefreshAttempt.entries()) {
				if (now - timestamp > 3e5) {
					lastRefreshAttempt.delete(sessionId);
				}
			}
			for (const [sessionId, timestamp] of lastRotationAttempt.entries()) {
				if (now - timestamp > SESSION_ROTATION_INTERVAL_MS * 2) {
					lastRotationAttempt.delete(sessionId);
				}
			}
			logger.trace(`Session cache cleanup: ${strongRefs.size} strong refs, ${sessionCache.size} weak refs`);
		},
		5 * 60 * 1e3
	);
}
function getTenantIdFromHostname(hostname) {
	if (!getPrivateSettingSync('MULTI_TENANT')) return null;
	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1') || hostname.startsWith('192.168.')) {
		return 'default';
	}
	const parts = hostname.split('.');
	if (parts.length > 2 && !['www', 'app', 'api', 'cdn', 'static'].includes(parts[0])) {
		return parts[0];
	}
	return null;
}
async function getUserFromSession(sessionId, tenantId) {
	const now = Date.now();
	const memCached = getSessionFromCache(sessionId);
	if (memCached) {
		logger.trace(`Session cache hit (memory): ${sessionId.substring(0, 8)}...`);
		return memCached.user;
	}
	try {
		const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
		const redisCached = await cacheService.get(cacheKey, tenantId);
		if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
			setSessionInCache(sessionId, redisCached);
			logger.trace(`Session cache hit (redis): ${sessionId.substring(0, 8)}...`);
			return redisCached.user;
		}
	} catch (err) {
		logger.warn(`Redis session read failed: ${err instanceof Error ? err.message : String(err)}`);
	}
	const lastAttempt = lastRefreshAttempt.get(sessionId);
	if (lastAttempt && now - lastAttempt < 6e4) return null;
	lastRefreshAttempt.set(sessionId, now);
	if (!auth) {
		const sysState = getSystemState();
		if (sysState.overallState === 'READY' || sysState.overallState === 'DEGRADED') {
			logger.error('Auth service unavailable, skipping session validation.');
		} else {
			logger.debug('Auth service not ready, skipping session validation.');
		}
		return null;
	}
	try {
		const user = await auth.validateSession(sessionId);
		if (user) {
			const sessionData = { user, timestamp: now };
			setSessionInCache(sessionId, sessionData);
			const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
			await cacheService
				.set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1e3), tenantId)
				.catch((err) => logger.warn(`Session cache set failed: ${err.message}`));
			logger.trace(`Session validated from DB: ${sessionId.substring(0, 8)}...`);
			return user;
		}
	} catch (err) {
		logger.error(`Session validation failed for ${sessionId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
	}
	return null;
}
async function handleSessionRotation(event, user, oldSessionId) {
	const now = Date.now();
	const lastRotation = lastRotationAttempt.get(oldSessionId);
	if (lastRotation && now - lastRotation < SESSION_ROTATION_INTERVAL_MS) {
		return;
	}
	if (await rotationRateLimiter.isLimited(event)) {
		logger.debug(`Session rotation rate limited for session ${oldSessionId.substring(0, 8)}...`);
		return;
	}
	try {
		if (!auth?.createSession || !auth?.destroySession) {
			logger.warn('Session rotation not supported by auth adapter');
			return;
		}
		const newSession = await auth.createSession({
			user_id: user._id,
			expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
			// 30 days
			tenantId: event.locals.tenantId
		});
		if (newSession && newSession._id !== oldSessionId) {
			const newSessionId = newSession._id;
			event.cookies.set(SESSION_COOKIE_NAME, newSessionId, {
				path: '/',
				httpOnly: true,
				secure: event.url.protocol === 'https:' || (event.url.hostname !== 'localhost' && !dev),
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 30
				// 30 days
			});
			await auth
				.destroySession(oldSessionId)
				.catch((err) => logger.warn(`Failed to destroy old session ${oldSessionId.substring(0, 8)}: ${err.message}`));
			invalidateSessionCache(oldSessionId, event.locals.tenantId);
			const sessionData = { user, timestamp: now };
			setSessionInCache(newSessionId, sessionData);
			const cacheKey = event.locals.tenantId ? `session:${event.locals.tenantId}:${newSessionId}` : `session:${newSessionId}`;
			await cacheService
				.set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1e3), event.locals.tenantId)
				.catch((err) => logger.warn(`Failed to cache rotated session: ${err.message}`));
			event.locals.session_id = newSessionId;
			lastRotationAttempt.set(newSessionId, now);
			metricsService.incrementAuthValidations();
			logger.info(`Session rotated for user ${user._id}: ${oldSessionId.substring(0, 8)}... → ${newSessionId.substring(0, 8)}...`);
		}
	} catch (err) {
		logger.error(`Session rotation failed for ${oldSessionId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
		if (err instanceof Error && err.message.includes('invalid')) {
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			event.locals.user = null;
			event.locals.session_id = void 0;
			invalidateSessionCache(oldSessionId, event.locals.tenantId);
			throw error(401, 'Session expired. Please log in again.');
		}
	}
}
const handleAuthentication = async ({ event, resolve }) => {
	const { locals, url, cookies } = event;
	const ASSET_REGEX =
		/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;
	if (url.pathname.startsWith('/.well-known/') || url.pathname.startsWith('/_') || ASSET_REGEX.test(url.pathname)) {
		return resolve(event);
	}
	const publicRoutes = ['/login', '/register', '/forgot-password', '/setup', '/api/setup'];
	const isLocalizedPublic = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register|forgot-password)/.test(url.pathname);
	if (publicRoutes.some((r) => url.pathname.startsWith(r)) || isLocalizedPublic) {
		return resolve(event);
	}
	locals.dbAdapter = dbAdapter;
	if (!dbAdapter) {
		logger.warn('Database adapter unavailable; system initializing.');
		return resolve(event);
	}
	const multiTenant = getPrivateSettingSync('MULTI_TENANT');
	const isDemoMode = getPrivateSettingSync('DEMO');
	if (multiTenant) {
		let tenantId = null;
		if (isDemoMode) {
			tenantId = cookies.get('demo_tenant_id') || null;
			if (!tenantId) {
				tenantId = crypto.randomUUID();
				cookies.set('demo_tenant_id', tenantId, {
					path: '/',
					httpOnly: true,
					secure: url.protocol === 'https:' || (url.hostname !== 'localhost' && !dev),
					sameSite: 'lax',
					maxAge: 60 * 20
					// 20 minutes for a demo session
				});
				logger.info(`New demo tenant generated: ${tenantId}`);
				try {
					await seedDemoTenant(dbAdapter, tenantId);
					logger.info(`✅ New demo tenant ${tenantId} seeded successfully.`);
				} catch (e) {
					logger.error(`Failed to seed demo tenant ${tenantId}:`, e);
				}
			} else {
				logger.trace(`Existing demo tenant from cookie: ${tenantId}`);
			}
		} else {
			tenantId = getTenantIdFromHostname(url.hostname);
		}
		if (!tenantId) {
			logger.error(`Tenant not found for hostname: ${url.hostname}`);
			throw error(404, `Tenant not found for hostname: ${url.hostname}`);
		}
		locals.tenantId = tenantId;
		logger.trace(`Tenant identified: ${tenantId}`);
	}
	const sessionId = cookies.get(SESSION_COOKIE_NAME);
	if (sessionId) {
		metricsService.incrementAuthValidations();
		if (!auth) {
			logger.debug('Auth service not ready during session validation - skipping validation but preserving cookie');
			return resolve(event);
		}
		const user = await getUserFromSession(sessionId, locals.tenantId);
		if (user) {
			if (locals.tenantId && user.tenantId && user.tenantId !== locals.tenantId) {
				logger.warn(`Tenant isolation violation: User ${user._id} (tenant: ${user.tenantId}) tried ${locals.tenantId}`);
				metricsService.incrementAuthFailures();
				cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				throw error(403, 'Access denied: Tenant isolation violation');
			}
			locals.user = user;
			locals.session_id = sessionId;
			locals.permissions = user.permissions || [];
			logger.trace(`User authenticated: ${user._id}`);
			try {
				await handleSessionRotation(event, user, sessionId);
			} catch (rotationError) {
				if (rotationError instanceof Error && !rotationError.message.includes('Session expired')) {
					logger.debug(`Non-critical rotation issue: ${rotationError.message}`);
				}
			}
		} else {
			metricsService.incrementAuthFailures();
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			logger.trace(`Invalid session removed: ${sessionId.substring(0, 8)}...`);
		}
	}
	return resolve(event);
};
function invalidateSessionCache(sessionId, tenantId) {
	sessionCache.delete(sessionId);
	strongRefs.delete(sessionId);
	lastRefreshAttempt.delete(sessionId);
	lastRotationAttempt.delete(sessionId);
	const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
	cacheService.delete(cacheKey, tenantId).catch((err) => logger.warn(`Failed to delete session from Redis: ${err.message}`));
	logger.debug(`Session cache invalidated: ${sessionId.substring(0, 8)}...`);
}
function clearSessionRefreshAttempt(sessionId) {
	lastRefreshAttempt.delete(sessionId);
}
function forceSessionRotation(sessionId) {
	lastRotationAttempt.delete(sessionId);
	logger.info(`Forced rotation flag set for session ${sessionId.substring(0, 8)}...`);
}
function clearAllSessionCaches() {
	sessionCache.clear();
	strongRefs.clear();
	lastRefreshAttempt.clear();
	lastRotationAttempt.clear();
	logger.warn('⚠️  All session caches cleared - users will need to re-authenticate');
}
function getSessionCacheStats() {
	return {
		weakRefs: sessionCache.size,
		strongRefs: strongRefs.size,
		pendingRefreshes: lastRefreshAttempt.size,
		pendingRotations: lastRotationAttempt.size,
		maxStrongRefs: MAX_STRONG_REFS
	};
}
function isValidLocale(lang) {
	if (!lang) return false;
	return locales.includes(lang);
}
function safelySetLanguage(cookieName, cookieValue, setter) {
	if (!cookieValue) return false;
	if (!isValidLocale(cookieValue)) {
		logger.warn(`Invalid ${cookieName} cookie value: "${cookieValue}". Supported locales: ${locales.join(', ')}`);
		return false;
	}
	try {
		setter(cookieValue);
		logger.trace(`${cookieName} set to: ${cookieValue}`);
		return true;
	} catch (err) {
		logger.error(`Failed to set ${cookieName} store: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}
const handleLocale = async ({ event, resolve }) => {
	const { cookies } = event;
	if (!app) {
		logger.warn('Language stores not available on server, skipping handleLocale');
		return resolve(event);
	}
	const systemLangCookie = cookies.get('systemLanguage');
	const systemLangSet = safelySetLanguage('systemLanguage', systemLangCookie, (value) => (app.systemLanguage = value));
	if (systemLangCookie && !systemLangSet) {
		logger.debug('Removing invalid systemLanguage cookie');
		cookies.delete('systemLanguage', { path: '/' });
	}
	const contentLangCookie = cookies.get('contentLanguage');
	const contentLangSet = safelySetLanguage('contentLanguage', contentLangCookie, (value) => (app.contentLanguage = value));
	if (contentLangCookie && !contentLangSet) {
		logger.debug('Removing invalid contentLanguage cookie');
		cookies.delete('contentLanguage', { path: '/' });
	}
	return resolve(event);
};
const themeManager = ThemeManager.getInstance();
const handleTheme = async ({ event, resolve }) => {
	const themePreference = event.cookies.get('theme');
	let isDarkMode = false;
	if (themePreference === 'dark') {
		isDarkMode = true;
	} else if (themePreference === 'light') {
		isDarkMode = false;
	} else {
		isDarkMode = false;
	}
	event.locals.darkMode = isDarkMode;
	if (themeManager.isInitialized()) {
		try {
			const currentTheme = await themeManager.getTheme(event.locals.tenantId);
			event.locals.theme = currentTheme;
			event.locals.customCss = currentTheme?.customCss || '';
		} catch (err) {
			const sysState = getSystemState();
			if (sysState.overallState === 'READY' || sysState.overallState === 'DEGRADED') {
				logger.error('Error retrieving custom CSS in handleTheme hook:', err);
			} else {
				logger.debug('ThemeManager not ready, skipping custom CSS.');
			}
			event.locals.theme = null;
			event.locals.customCss = '';
		}
	} else {
		event.locals.theme = null;
		event.locals.customCss = '';
	}
	return resolve(event, {
		transformPageChunk: ({ html }) => {
			const htmlTag = '<html lang="en" dir="ltr">';
			if (themePreference === 'dark') {
				return html.replace(htmlTag, '<html lang="en" dir="ltr" class="dark">');
			}
			return html;
		}
	});
};
const addSecurityHeaders = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		['geolocation=()', 'microphone=()', 'camera=()', 'display-capture=()', 'clipboard-read=()', 'clipboard-write=(self)', 'web-share=(self)'].join(
			', '
		)
	);
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}
	return response;
};
const distributedStore = {
	/**
	 * Gets the current count for a rate limit key
	 */
	async get(key) {
		try {
			const data = await cacheService.get(`ratelimit:${key}`);
			if (data && data.expires > Date.now()) {
				return data.count;
			}
			return void 0;
		} catch (err) {
			logger.warn(`Distributed rate limit store GET failed: ${err instanceof Error ? err.message : String(err)}`);
			return void 0;
		}
	},
	async has(key) {
		return (await this.get(key)) !== void 0;
	},
	/**
	 * Adds/sets a value in the store (required by sveltekit-rate-limiter)
	 */
	async add(key, ttlSeconds) {
		try {
			if (await this.has(key)) {
				return this.increment(key, ttlSeconds);
			}
			const expires = Date.now() + ttlSeconds * 1e3;
			await cacheService.set(`ratelimit:${key}`, { count: 1, expires }, ttlSeconds);
			return 1;
		} catch (err) {
			logger.error(`Distributed rate limit store ADD failed: ${err instanceof Error ? err.message : String(err)}`);
			return 0;
		}
	},
	/**
	 * Increments the counter for a rate limit key
	 */
	async increment(key, ttlSeconds) {
		try {
			const existing = await this.get(key);
			const newCount = (existing || 0) + 1;
			const expires = Date.now() + ttlSeconds * 1e3;
			await cacheService.set(`ratelimit:${key}`, { count: newCount, expires }, ttlSeconds);
			console.log(`[RateLimit] INC ${key}: ${newCount}`);
			return newCount;
		} catch (err) {
			logger.error(`Distributed rate limit store INCREMENT failed: ${err instanceof Error ? err.message : String(err)}`);
			return 1;
		}
	},
	async clear() {
		try {
			await cacheService.delete(`ratelimit:*`);
		} catch (err) {
			logger.error(`Distributed rate limit store CLEAR failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
};
const generalLimiter = new RateLimiter({
	IP: [500, 'm'],
	IPUA: [500, 'm'],
	cookie: {
		name: 'ratelimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY') || 'fallback-dev-secret',
		rate: [500, 'm'],
		preflight: true
	},
	// Enable distributed store if Redis is available
	store: cacheService ? distributedStore : void 0
});
const apiLimiter = new RateLimiter({
	IP: [500, 'm'],
	IPUA: [200, 'm'],
	// Enable distributed store if Redis is available
	store: cacheService ? distributedStore : void 0
});
const authLimiter = new RateLimiter({
	IP: [10, 'm'],
	// 10 requests per minute per IP
	IPUA: [5, 'm'],
	// 5 requests per minute per IP+UA
	store: cacheService ? distributedStore : void 0
});
function getClientIp(event) {
	try {
		const address = event.getClientAddress();
		if (address) return address;
	} catch {}
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) return forwarded.split(',')[0].trim();
	const realIp = event.request.headers.get('x-real-ip');
	if (realIp) return realIp;
	return '127.0.0.1';
}
function isLocalhost(ip) {
	return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
const STATIC_EXTENSIONS = /\.(js|css|map|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/;
function isStaticAsset(pathname) {
	return (
		pathname.startsWith('/static/') ||
		pathname.startsWith('/_app/') ||
		pathname === '/favicon.ico' ||
		pathname === '/robots.txt' ||
		pathname === '/sitemap.xml' ||
		STATIC_EXTENSIONS.test(pathname)
	);
}
const handleRateLimit = async ({ event, resolve }) => {
	const { url } = event;
	const clientIp = getClientIp(event);
	if (building) return resolve(event);
	const bypassLocalhost = event.request.headers.get('x-test-rate-limit-bypass-localhost') === 'true';
	if (isLocalhost(clientIp) && !bypassLocalhost) {
		return resolve(event);
	}
	if (isStaticAsset(url.pathname)) return resolve(event);
	let limiter = generalLimiter;
	if (url.pathname.startsWith('/api/auth')) {
		limiter = authLimiter;
	} else if (url.pathname.startsWith('/api/')) {
		limiter = apiLimiter;
	}
	if (await limiter.isLimited(event)) {
		metricsService.incrementRateLimitViolations();
		logger.warn(
			`Rate limit exceeded for IP: ${clientIp}, endpoint: ${url.pathname}, UA: ${event.request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`
		);
		throw error(429, 'Too Many Requests. Please slow down and try again later.');
	}
	return resolve(event);
};
const APP_THREAT_PATTERNS = [
	// Suspicious parameter patterns (credentials in URL)
	/[?&](password|token|secret|api_key|auth)=[^&]*/i,
	// Bulk operations abuse
	/\/api\/(users|content|collections)\/bulk-(delete|update|create)/i,
	// Administrative endpoint enumeration
	/\/(admin|manage|control-panel|dashboard)\/[^/]*\/(delete|remove|destroy)/i,
	// Known malicious payloads in paths
	/<script[^>]*>|javascript:\s*|data:text\/html|vbscript:/i,
	// Template injection attempts (refined to allow legitimate CMS tokens)
	// Original: /\{\{.*\}\}|\${.*}|<%.*%>/i
	// Refined: We allow {{...}} but block suspicious content within them or in non-token contexts
	// This specifically allows {{user.name}}, {{entry._id}}, etc. but still flags very long or complex expressions
	/(?<!\{\{)\$\{.*\}|(?<!\{\{)<%.*%>|(?<!\{\{)\{\{.*[;<>].*\}\}/i,
	// Command injection patterns
	/;(\s)*(ls|cat|wget|curl|nc|bash|sh|cmd|powershell)/i
];
const ADVANCED_BOT_PATTERNS = [/HeadlessChrome/i, /PhantomJS/i, /Selenium/i, /Puppeteer/i, /WebDriver/i, /Playwright/i, /Nightmare/i, /ZombieJS/i];
const LEGITIMATE_BOT_PATTERNS = [
	/Googlebot/i,
	/Bingbot/i,
	/Slurp/i,
	// Yahoo
	/DuckDuckBot/i,
	/Baiduspider/i,
	/YandexBot/i,
	/facebookexternalhit/i,
	/LinkedInBot/i,
	/Twitterbot/i,
	/WhatsApp/i,
	/TelegramBot/i,
	/Discordbot/i
];
function isLegitimateBot(userAgent) {
	const allowedBots = getPrivateSettingSync('FIREWALL_ALLOWED_BOTS') || [];
	const patterns = [...LEGITIMATE_BOT_PATTERNS, ...allowedBots.map((p) => new RegExp(p, 'i'))];
	return patterns.some((pattern) => pattern.test(userAgent));
}
function isAdvancedBot(userAgent) {
	const blockedBots = getPrivateSettingSync('FIREWALL_BLOCKED_BOTS') || [];
	const patterns = [...ADVANCED_BOT_PATTERNS, ...blockedBots.map((p) => new RegExp(p, 'i'))];
	return patterns.some((pattern) => pattern.test(userAgent));
}
function hasApplicationThreat(pathname, search) {
	const fullPath = pathname + search;
	return APP_THREAT_PATTERNS.some((pattern) => pattern.test(fullPath));
}
function hasSuspiciousPattern(pathname) {
	const pathDepth = pathname.split('/').filter(Boolean).length;
	if (pathDepth > 10) {
		return true;
	}
	if (pathname.includes('/../') || pathname.includes('/./')) {
		return true;
	}
	if (pathname.includes('%2e%2e') || pathname.includes('%252e')) {
		return true;
	}
	return false;
}
const handleFirewall = async ({ event, resolve }) => {
	const { request, url } = event;
	const userAgent = request.headers.get('user-agent') || '';
	const pathname = url.pathname.toLowerCase();
	const search = url.search.toLowerCase();
	const firewallEnabled = getPrivateSettingSync('FIREWALL_ENABLED') ?? true;
	if (!firewallEnabled) return resolve(event);
	if (isAdvancedBot(userAgent) && !isLegitimateBot(userAgent)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Advanced bot detected and blocked: UA=${userAgent.substring(0, 50)}, Path=${pathname}`);
		throw error(403, 'Forbidden: Automated access detected');
	}
	if (hasApplicationThreat(pathname, search)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Application threat detected: IP=${event.getClientAddress()}, Path=${pathname}, UA=${userAgent.substring(0, 50)}`);
		throw error(403, 'Forbidden: Request pattern not allowed');
	}
	if (hasSuspiciousPattern(pathname)) {
		metricsService.incrementSecurityViolations();
		logger.warn(`Suspicious pattern detected: IP=${event.getClientAddress()}, Path=${pathname}`);
		throw error(403, 'Forbidden: Invalid request pattern');
	}
	return resolve(event);
};
export {
	clearAllSessionCaches as a,
	handleRateLimit as b,
	clearSessionRefreshAttempt as c,
	handleFirewall as d,
	isLegitimateBot as e,
	forceSessionRotation as f,
	getSessionCacheStats as g,
	handleAuthentication as h,
	invalidateSessionCache as i,
	isAdvancedBot as j,
	hasApplicationThreat as k,
	hasSuspiciousPattern as l,
	handleSystemState as m,
	handleLocale as n,
	handleTheme as o,
	addSecurityHeaders as p
};
//# sourceMappingURL=handleFirewall.js.map
