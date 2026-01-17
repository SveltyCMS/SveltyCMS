import { p as publicConfigSchema, a as privateConfigSchema } from './schemas.js';
import { logger } from './logger.js';
const KNOWN_PUBLIC_KEYS = Object.keys(publicConfigSchema.entries);
const INFRASTRUCTURE_KEYS = /* @__PURE__ */ new Set([
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
const KNOWN_PRIVATE_KEYS = Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key));
const cache = {
	loaded: false,
	loadedAt: 0,
	// Timestamp for TTL
	private: {},
	public: {},
	TTL: 5 * 60 * 1e3
	// 5 minutes TTL
};
let pkgVersionPromise = null;
async function loadPkgVersion() {
	if (!pkgVersionPromise) {
		pkgVersionPromise = import('./package.js').then((pkg) => pkg.version || '0.0.0').catch(() => '0.0.0');
	}
	return pkgVersionPromise;
}
async function loadSettingsCache() {
	const now = Date.now();
	if (cache.loaded && now - cache.loadedAt > cache.TTL) {
		cache.loaded = false;
		logger.debug('Settings cache invalidated (TTL expired)');
	}
	if (cache.loaded) {
		return cache;
	}
	try {
		const { dbAdapter, getPrivateEnv } = await import('./db.js').then((n) => n.e);
		if (!dbAdapter?.systemPreferences) {
			logger.warn('Database adapter not yet initialized, using empty settings cache');
			cache.loaded = true;
			cache.loadedAt = Date.now();
			cache.public.PKG_VERSION = await loadPkgVersion();
			return cache;
		}
		const [publicResult, privateResult] = await Promise.all([
			dbAdapter.systemPreferences.getMany(KNOWN_PUBLIC_KEYS, 'system'),
			dbAdapter.systemPreferences.getMany(KNOWN_PRIVATE_KEYS, 'system')
		]);
		if (!publicResult.success) {
			throw new Error(`Failed to load public settings: ${publicResult.error?.message || 'Unknown error'}`);
		}
		const publicSettings = publicResult.data || {};
		const privateDynamic = privateResult.success ? privateResult.data || {} : {};
		const inMemoryConfig = getPrivateEnv();
		let privateConfig;
		if (inMemoryConfig) {
			privateConfig = inMemoryConfig;
		} else {
			try {
				const configModule = '@config/private';
				const { privateEnv } = await import(
					/* @vite-ignore */
					configModule
				);
				privateConfig = privateEnv;
			} catch (error) {
				logger.trace('Private config not found during setup - this is expected during initial setup', {
					error: error instanceof Error ? error.message : String(error)
				});
				privateConfig = {};
			}
		}
		const mergedPrivate = {
			...privateConfig,
			...privateDynamic
		};
		cache.private = mergedPrivate;
		cache.public = publicSettings;
		cache.public.PKG_VERSION = await loadPkgVersion();
		cache.loaded = true;
		cache.loadedAt = Date.now();
		return cache;
	} catch (error) {
		const { logger: logger2 } = await import('./logger.js');
		logger2.error('Failed to load settings cache:', error);
		cache.public.PKG_VERSION = await loadPkgVersion();
		throw error;
	}
}
async function invalidateSettingsCache() {
	const pkgVersion = await loadPkgVersion();
	cache.loaded = false;
	cache.loadedAt = 0;
	cache.private = {};
	cache.public = { PKG_VERSION: pkgVersion };
	logger.debug('Settings cache manually invalidated');
}
async function setSettingsCache(newPrivate, newPublic) {
	cache.private = newPrivate;
	cache.public = { ...newPublic, PKG_VERSION: await loadPkgVersion() };
	cache.loaded = true;
}
async function getPrivateSetting(key) {
	const { private: privateEnv } = await loadSettingsCache();
	return privateEnv[key];
}
async function getPublicSetting(key) {
	const { public: publicEnv } = await loadSettingsCache();
	return publicEnv[key];
}
async function getUntypedSetting(key, scope) {
	const { public: publicEnv, private: privateEnv } = await loadSettingsCache();
	{
		if (publicEnv[key] !== void 0) {
			return publicEnv[key];
		}
	}
	{
		if (privateEnv[key] !== void 0) {
			return privateEnv[key];
		}
	}
	return void 0;
}
function getPublicSettingSync(key) {
	return cache.public[key];
}
function getPrivateSettingSync(key) {
	return cache.private[key];
}
async function getAllSettings() {
	const { public: publicEnv, private: privateEnv } = await loadSettingsCache();
	return {
		public: { ...publicEnv },
		private: { ...privateEnv }
	};
}
export {
	getAllSettings,
	getPrivateSetting,
	getPrivateSettingSync,
	getPublicSetting,
	getPublicSettingSync,
	getUntypedSetting,
	invalidateSettingsCache,
	loadSettingsCache,
	setSettingsCache
};
//# sourceMappingURL=settingsService.js.map
