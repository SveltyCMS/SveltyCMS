import { b as building } from './environment.js';
import { dev } from './index3.js';
import { error } from '@sveltejs/kit';
import { c as corePermissions } from './permissions.js';
import { logger } from './logger.js';
import { d as dateToISODateString, i as isoDateStringToDate } from './dateUtils.js';
import { getPrivateSettingSync, invalidateSettingsCache, setSettingsCache, getPublicSetting } from './settingsService.js';
import { h as hashPassword, v as verifyPassword } from './crypto.js';
import { cacheService } from './CacheService.js';
import { p as publicConfigSchema, a as privateConfigSchema } from './schemas.js';
import { safeParse } from 'valibot';
import { D as DEFAULT_THEME, T as ThemeManager } from './themeManager.js';
const SESSION_COOKIE_NAME = 'auth_sessions';
class Auth {
	db;
	sessionStore;
	permissions = [...corePermissions];
	constructor(db2, sessionStore) {
		this.db = db2;
		this.sessionStore = sessionStore;
	}
	get authInterface() {
		return this.db.auth;
	}
	// Combined Performance-Optimized Methods (wrapper for db.auth methods)
	async createUserAndSession(userData, sessionData) {
		return this.db.auth.createUserAndSession(userData, sessionData);
	}
	async deleteUserAndSessions(user_id, tenantId) {
		return this.db.auth.deleteUserAndSessions(user_id, tenantId);
	}
	async blockUsers(userIds, tenantId) {
		return this.db.auth.blockUsers(userIds, tenantId);
	}
	async unblockUsers(userIds, tenantId) {
		return this.db.auth.unblockUsers(userIds, tenantId);
	}
	// Permission management
	getPermissions() {
		return this.permissions;
	}
	addPermission(permission) {
		const exists = this.permissions.some((p) => p._id === permission._id);
		if (!exists) {
			this.permissions.push(permission);
		}
	}
	// User management
	async createUser(userData, oauth = false) {
		try {
			const { email, password, tenantId } = userData;
			if (!email || (!oauth && !password)) {
				throw error(400, 'Email and password are required');
			}
			if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
				throw error(400, 'Tenant ID is required in multi-tenant mode');
			}
			const normalizedEmail = email.toLowerCase();
			let hashedPassword;
			if (!oauth && password) {
				hashedPassword = await hashPassword(password);
			}
			const result = await this.db.auth.createUser({ ...userData, email: normalizedEmail, password: hashedPassword });
			if (!result || !result.success || !result.data || !result.data._id) {
				throw error(500, 'User creation failed');
			}
			return result.data;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			throw error(500, `Failed to create user: ${errMsg}`);
		}
	}
	async getUserById(user_id, tenantId) {
		const result = await this.db.auth.getUserById(user_id, tenantId);
		if (result && typeof result === 'object' && result !== null && 'success' in result) {
			const r = result;
			if (r.success && r.data) {
				return r.data;
			}
			return null;
		}
		return result ?? null;
	}
	async getUserByEmail(criteria) {
		const result = await this.db.auth.getUserByEmail(criteria);
		if (result && typeof result === 'object' && result !== null && 'success' in result) {
			const r = result;
			if (r.success === true) {
				const userData = 'data' in r ? r.data : null;
				return userData ?? null;
			}
			return null;
		}
		return result ?? null;
	}
	async updateUser(userId, updates, tenantId) {
		const result = await this.db.auth.updateUserAttributes(userId, updates, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to update user');
		}
	}
	async deleteUser(user_id, tenantId) {
		const user = await this.getUserById(user_id, tenantId);
		const result = await this.db.auth.deleteUser(user_id, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to delete user');
		}
		const cacheKey = `user:id:${user_id}`;
		await cacheService.delete(cacheKey, tenantId);
		if (user?.email) {
			const emailCacheKey = `user:email:${user.email.toLowerCase()}`;
			await cacheService.delete(emailCacheKey, tenantId);
		}
	}
	async getAllUsers(options) {
		const result = await this.db.auth.getAllUsers(options);
		if (result && result.success) {
			return result.data;
		}
		return [];
	}
	async getUserCount(filter) {
		const result = await this.db.auth.getUserCount(filter);
		if (result && result.success) {
			return result.data;
		}
		return 0;
	}
	async createSession(sessionData) {
		const sr = await this.db.auth.createSession(sessionData);
		let session = null;
		if (sr && typeof sr === 'object' && sr !== null && 'success' in sr) {
			const sessionResult = sr;
			if (!sessionResult || !sessionResult.success) {
				throw error(500, 'Session creation failed');
			}
			session = sessionResult.data;
		} else {
			session = sr;
		}
		if (!session) throw error(500, 'Session creation failed');
		const ur = await this.db.auth.getUserById(sessionData.user_id, sessionData.tenantId);
		let user = null;
		if (ur && typeof ur === 'object' && ur !== null && 'success' in ur) {
			const userResult = ur;
			if (userResult && userResult.success && userResult.data) {
				user = userResult.data;
			}
		} else {
			user = ur ?? null;
		}
		if (!user) {
			throw error(404, `User not found for ID: ${sessionData.user_id}`);
		}
		await this.sessionStore.set(session._id, user, sessionData.expires);
		return session;
	}
	async validateSession(session_id) {
		const result = await this.db.auth.validateSession(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}
	async destroySession(session_id) {
		await this.db.auth.deleteSession(session_id);
		await this.sessionStore.delete(session_id);
	}
	async getSessionTokenData(session_id) {
		const result = await this.db.auth.getSessionTokenData(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}
	async rotateToken(oldToken, expires) {
		if (!this.db.auth.rotateToken) throw error(500, 'Token rotation not supported');
		const result = await this.db.auth.rotateToken(oldToken, expires);
		if (result && result.success) {
			return result.data;
		}
		throw error(500, 'Token rotation failed');
	}
	async getAllRoles(tenantId) {
		return this.db.auth.getAllRoles(tenantId);
	}
	async getAllTokens(filter) {
		const result = await this.db.auth.getAllTokens(filter);
		return result;
	}
	/**
	 * Create a token for a user.
	 * @param tokenData - Token creation data including user_id, expires, type, and optional tenantId
	 * @returns The created token string
	 */
	async createToken(tokenData) {
		const user = await this.getUserById(tokenData.user_id, tokenData.tenantId);
		if (!user) throw new Error('User not found');
		const result = await this.db.auth.createToken({
			user_id: tokenData.user_id,
			email: user.email.toLowerCase(),
			expires: tokenData.expires,
			type: tokenData.type,
			tenantId: tokenData.tenantId
		});
		if (typeof result === 'string') return result;
		if (result && result.success && typeof result.data === 'string') return result.data;
		if (result && !result.success && result.error?.message) throw new Error(result.error.message);
		throw new Error('Failed to create token');
	}
	// Token management wrappers for interface completeness
	async updateToken(token_id, tokenData, tenantId) {
		const result = await this.db.auth.updateToken(token_id, tokenData, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to update token' : result.message || 'Failed to update token');
	}
	async deleteTokens(token_ids, tenantId) {
		const result = await this.db.auth.deleteTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to delete tokens' : result.message || 'Failed to delete tokens');
	}
	async blockTokens(token_ids, tenantId) {
		const result = await this.db.auth.blockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to block tokens' : result.message || 'Failed to block tokens');
	}
	async unblockTokens(token_ids, tenantId) {
		const result = await this.db.auth.unblockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to unblock tokens' : result.message || 'Failed to unblock tokens');
	}
	async getTokenByValue(token, tenantId) {
		const result = await this.db.auth.getTokenByValue(token, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to get token' : result.message || 'Failed to get token');
	}
	async validateToken(token, user_id, type = 'access', tenantId) {
		const result = await this.db.auth.validateToken(token, user_id, type, tenantId);
		if (result && result.success && result.data) {
			return { success: true, message: result.data.message ?? 'Token validated' };
		}
		return { success: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
	}
	async validateRegistrationToken(token, tenantId) {
		const result = await this.db.auth.validateToken(token, void 0, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			const tokenResult = await this.db.auth.getTokenByValue(token, tenantId);
			const tokenDoc = tokenResult && tokenResult.success ? tokenResult.data : null;
			return { isValid: true, message: result.data.message, details: tokenDoc ?? void 0 };
		} else {
			return { isValid: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
		}
	}
	async consumeToken(token, user_id, type = 'access', tenantId) {
		const result = await this.db.auth.consumeToken(token, user_id, type, tenantId);
		if (result && result.success) {
			return result.data;
		}
		return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
	}
	async consumeRegistrationToken(token, tenantId) {
		const result = await this.db.auth.consumeToken(token, void 0, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			return result.data;
		} else {
			return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
		}
	}
	async authenticate(email, password, tenantId) {
		try {
			const user = await this.getUserByEmail({ email, tenantId });
			if (!user) {
				logger.debug('User not found for authentication', { email, tenantId });
				return null;
			}
			if (!user.password) {
				logger.debug('User has no password field', { email, tenantId, userId: user._id });
				return null;
			}
			const isValid = await verifyPassword(password, user.password);
			logger.debug('Password verification result', { email, isValid });
			if (!isValid) {
				logger.warn('Password authentication failed', { email });
				return null;
			}
			const expiresAt = dateToISODateString(new Date(Date.now() + 24 * 60 * 60 * 1e3));
			const session = await this.createSession({ user_id: user._id, expires: expiresAt, tenantId });
			await this.sessionStore.set(session._id, user, expiresAt);
			return { user, sessionId: session._id };
		} catch (err) {
			logger.error(`Authentication error: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}
	async logOut(session_id) {
		await this.destroySession(session_id);
	}
	async checkUser(fields) {
		if (fields.email) {
			const result = await this.db.auth.getUserByEmail({ email: fields.email, tenantId: fields.tenantId });
			if (result && result.success) {
				return result.data;
			}
			return null;
		} else if (fields.user_id) {
			const result = await this.db.auth.getUserById(fields.user_id, fields.tenantId);
			if (result && result.success) {
				return result.data;
			}
			return null;
		}
		return null;
	}
	async updateUserAttributes(user_id, attributes, tenantId) {
		if (attributes.password && typeof window === 'undefined') {
			attributes.password = await hashPassword(attributes.password);
		}
		if (attributes.email === null) {
			attributes.email = void 0;
		}
		const result = await this.db.auth.updateUserAttributes(user_id, attributes, tenantId);
		if (result && result.success) {
			return result.data;
		}
		throw error(500, 'Failed to update user attributes');
	}
	createSessionCookie(sessionId) {
		return {
			name: SESSION_COOKIE_NAME,
			value: sessionId,
			attributes: {
				httpOnly: true,
				secure: !dev,
				sameSite: 'strict',
				maxAge: 24 * 60 * 60,
				path: '/'
			}
		};
	}
	async invalidateAllUserSessions(user_id, tenantId) {
		await this.db.auth.invalidateAllUserSessions(user_id, tenantId);
	}
	async getActiveSessions(user_id, tenantId) {
		try {
			const result = await this.db.auth.getActiveSessions(user_id, tenantId);
			if (result && result.success) {
				return { success: true, data: result.data };
			}
			return { success: false, data: [], message: 'Failed to retrieve active sessions' };
		} catch (err) {
			logger.error(`Error getting active sessions: ${err instanceof Error ? err.message : String(err)}`);
			return { success: false, data: [], message: err instanceof Error ? err.message : 'Unknown error' };
		}
	}
	async getAllActiveSessions(tenantId) {
		try {
			const result = await this.db.auth.getAllActiveSessions(tenantId);
			if (result && result.success) {
				return { success: true, data: result.data };
			}
			return { success: false, data: [], message: 'Failed to retrieve all active sessions' };
		} catch (err) {
			logger.error(`Error getting all active sessions: ${err instanceof Error ? err.message : String(err)}`);
			return { success: false, data: [], message: err instanceof Error ? err.message : 'Unknown error' };
		}
	}
	async updateUserPassword(email, password, tenantId) {
		const user = await this.getUserByEmail({ email, tenantId });
		if (!user) {
			return { status: false, message: 'User not found' };
		}
		const hashedPassword = await hashPassword(password);
		await this.updateUser(user._id, { password: hashedPassword }, tenantId);
		return { status: true };
	}
}
class InMemorySessionManager {
	sessions = /* @__PURE__ */ new Map();
	async get(session_id) {
		const session = this.sessions.get(session_id);
		if (!session) return null;
		if (/* @__PURE__ */ new Date() > session.expiresAt) {
			this.sessions.delete(session_id);
			return null;
		}
		return session.user;
	}
	async set(session_id, user, expiration) {
		const expirationDate = isoDateStringToDate(expiration);
		this.sessions.set(session_id, { user, expiresAt: expirationDate });
	}
	async delete(session_id) {
		this.sessions.delete(session_id);
	}
	async deletePattern(pattern) {
		let deletedCount = 0;
		const regex = new RegExp(pattern.replace(/\*/g, '.*'));
		for (const [sessionId] of this.sessions) {
			if (regex.test(sessionId)) {
				this.sessions.delete(sessionId);
				deletedCount++;
			}
		}
		return deletedCount;
	}
	async validateWithDB(session_id, dbValidationFn) {
		const memoryUser = await this.get(session_id);
		if (memoryUser) {
			return memoryUser;
		}
		const dbUser = await dbValidationFn(session_id);
		if (dbUser) {
			const expiration = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
			await this.set(session_id, dbUser, expiration);
		}
		return dbUser;
	}
	async close() {
		this.sessions.clear();
	}
	// Cleanup expired sessions
	cleanup() {
		const now = /* @__PURE__ */ new Date();
		for (const [sessionId, session] of this.sessions) {
			if (now > session.expiresAt) {
				this.sessions.delete(sessionId);
			}
		}
	}
}
function createSessionManager(redisClient) {
	{
		logger.info('Creating in-memory session manager');
		return new InMemorySessionManager();
	}
}
let defaultManager = null;
function getDefaultSessionManager() {
	if (!defaultManager) {
		defaultManager = createSessionManager();
	}
	return defaultManager;
}
const getDefaultSessionStore = getDefaultSessionManager;
let privateEnv = null;
async function loadPrivateConfig(forceReload = false) {
	if (privateEnv && !forceReload) return privateEnv;
	try {
		logger.debug('Loading @config/private configuration...');
		let module;
		const isTestMode = typeof process !== 'undefined' && process.env?.TEST_MODE;
		if (isTestMode) {
			const pathUtil = await import('path');
			let workspaceRoot = process.cwd();
			if (
				workspaceRoot.endsWith('apps/setup') ||
				workspaceRoot.endsWith('apps/setup/') ||
				workspaceRoot.endsWith('apps/cms') ||
				workspaceRoot.endsWith('apps/cms/')
			) {
				workspaceRoot = pathUtil.resolve(workspaceRoot, '../../');
			}
			const configPath = pathUtil.resolve(workspaceRoot, 'config/private.test.ts');
			module = await import(
				/* @vite-ignore */
				configPath
			);
		} else {
			module = await import('./private.js');
		}
		privateEnv = module.privateEnv;
		logger.debug('Private config loaded successfully', {
			hasConfig: !!privateEnv,
			dbType: privateEnv?.DB_TYPE,
			dbHost: privateEnv?.DB_HOST ? '***' : 'missing'
		});
		return privateEnv;
	} catch (error2) {
		logger.trace('Private config not found during setup - this is expected during initial setup', {
			error: error2 instanceof Error ? error2.message : String(error2)
		});
		return null;
	}
}
function clearPrivateConfigCache(keepPrivateEnv = false) {
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
let _systemStateModule = null;
async function loadSystemStateModule() {
	if (!_systemStateModule) {
		_systemStateModule = await import('./index8.js');
	}
	return _systemStateModule;
}
const setSystemState = async (status, message) => {
	logger.debug(`[SystemState] ${status}: ${message}`);
	try {
		const mod = await loadSystemStateModule();
		mod.setSystemState(status, message);
	} catch (err) {
		logger.warn('Failed to update system state:', err);
	}
};
const updateServiceHealth = async (service, status, message, error2) => {
	logger.debug(`[ServiceHealth] ${service} ${status}: ${message}`);
	try {
		const mod = await loadSystemStateModule();
		mod.updateServiceHealth(service, status, message || '', error2);
	} catch (err) {
		logger.warn('Failed to update service health:', err);
	}
};
const waitForServiceHealthy = async () => true;
let dbAdapter = null;
let auth = null;
let isConnected = false;
let isInitialized = false;
let initializationPromise = null;
function getPrivateEnv() {
	return privateEnv;
}
let _dbInitPromise = null;
function getDbInitPromise(forceInit = false) {
	if (!_dbInitPromise || forceInit) {
		_dbInitPromise = initializeOnRequest(forceInit);
	}
	return _dbInitPromise;
}
const dbInitPromise = getDbInitPromise();
let adaptersLoaded = false;
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
const KNOWN_PUBLIC_KEYS = Object.keys(publicConfigSchema.entries);
const KNOWN_PRIVATE_KEYS = Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key));
async function loadSettingsFromDB() {
	try {
		if (!dbAdapter || !dbAdapter.systemPreferences) {
			logger.warn('Database adapter not available during settings load. Using empty cache.');
			await invalidateSettingsCache();
			return;
		}
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
		if (Object.keys(settings).length === 0) {
			logger.info('No settings found in database (initial setup). Using empty cache.');
			await invalidateSettingsCache();
			return;
		}
		const publicSettings = settings;
		const databasePrivateSettings = {};
		let privateConfig;
		if (privateEnv) {
			logger.debug('Using in-memory private config (bypassing filesystem)');
			privateConfig = privateEnv;
		} else {
			try {
				logger.debug('Loading private config from filesystem');
				let imported;
				const isTestMode = typeof process !== 'undefined' && process.env?.TEST_MODE;
				if (isTestMode) {
					const path = '@config/private.test';
					imported = await import(
						/* @vite-ignore */
						path
					);
				} else {
					imported = await import('./private.js');
				}
				privateConfig = imported.privateEnv;
			} catch (error2) {
				logger.trace('Private config not found during setup - this is expected during initial setup', {
					error: error2 instanceof Error ? error2.message : String(error2)
				});
				return;
			}
		}
		const privateSettings = {
			...privateConfig,
			// Infrastructure settings from config (in-memory or file)
			...databasePrivateSettings
			// Application settings from database
		};
		const parsedPublic = safeParse(publicConfigSchema, publicSettings);
		const parsedPrivate = safeParse(privateConfigSchema, privateSettings);
		if (!parsedPublic.success || !parsedPrivate.success) {
			logger.debug('Settings validation failed during startup - likely first run or setup mode');
			if (!parsedPublic.success) {
				logger.debug('Public settings validation issues:', parsedPublic.issues);
			}
			if (!parsedPrivate.success) {
				logger.debug('Private settings validation issues:', parsedPrivate.issues);
			}
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
			return;
		}
		const mergedPrivate = { ...parsedPrivate.output, ...privateDynamic };
		await setSettingsCache(mergedPrivate, parsedPublic.output);
		logger.info('✅ System settings loaded and cached from database.');
	} catch (error2) {
		logger.error('Failed to load settings from database:', error2);
		await invalidateSettingsCache();
		logger.warn('Settings load failed - system will continue with default configuration');
	}
}
async function loadAdapters() {
	if (adaptersLoaded && dbAdapter) {
		logger.debug('Adapters already loaded, skipping');
		return;
	}
	logger.debug('Loading adapters - checking privateEnv', {
		hasPrivateEnv: !!privateEnv,
		dbType: privateEnv?.DB_TYPE
	});
	const config = privateEnv || (await loadPrivateConfig(false));
	if (!config?.DB_TYPE) {
		logger.debug('No DB_TYPE in config; cannot load adapters. Skipping adapter loading during setup.', { config });
		updateServiceHealth('database', 'unhealthy', 'No DB_TYPE in config', 'Missing database configuration');
		return;
	}
	logger.debug(`🔌 Loading ${config.DB_TYPE} adapters...`);
	const { getDatabaseResilience } = await import('./DatabaseResilience.js');
	const resilience = getDatabaseResilience({
		maxAttempts: 3,
		// Retry adapter loading up to 3 times
		initialDelayMs: 500,
		backoffMultiplier: 2,
		maxDelayMs: 5e3,
		jitterMs: 200
	});
	try {
		await resilience.executeWithRetry(async () => {
			switch (config.DB_TYPE) {
				case 'mongodb':
				case 'mongodb+srv': {
					logger.debug('Importing MongoDB adapter...');
					const mongoAdapterModule = await import('./mongoDBAdapter.js');
					if (!mongoAdapterModule || !mongoAdapterModule.MongoDBAdapter) {
						throw new Error('MongoDBAdapter is not exported correctly from mongoDBAdapter.ts');
					}
					const { MongoDBAdapter } = mongoAdapterModule;
					dbAdapter = new MongoDBAdapter();
					logger.debug('MongoDB adapter created');
					break;
				}
				case 'mariadb': {
					logger.debug('Importing MariaDB adapter...');
					const mariadbAdapterModule = await import('./mariadbAdapter.js');
					if (!mariadbAdapterModule || !mariadbAdapterModule.MariaDBAdapter) {
						throw new Error('MariaDBAdapter is not exported correctly from mariadbAdapter.ts');
					}
					const { MariaDBAdapter } = mariadbAdapterModule;
					dbAdapter = new MariaDBAdapter();
					logger.debug('MariaDB adapter created');
					break;
				}
				default:
					logger.error(`Unsupported DB_TYPE: ${config.DB_TYPE}. Supported types: mongodb, mongodb+srv, mariadb`);
					throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}. Supported types: mongodb, mongodb+srv, mariadb`);
			}
		}, 'Database Adapter Loading');
		adaptersLoaded = true;
		logger.debug('All adapters loaded successfully');
	} catch (err) {
		const message = `Error loading adapters: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		adaptersLoaded = false;
		throw new Error(message);
	}
}
async function initializeDefaultTheme() {
	if (!dbAdapter) throw new Error('Cannot initialize themes: dbAdapter is not available.');
	try {
		const existingThemes = await dbAdapter.themes.getAllThemes();
		const themeExists = existingThemes.some((t) => t.name === DEFAULT_THEME.name && t.isDefault);
		if (!themeExists) {
			await dbAdapter.themes.storeThemes([DEFAULT_THEME]);
			logger.debug('Default SveltyCMS theme initialized');
		}
	} catch (err) {
		logger.warn(`Theme initialization issue: ${err instanceof Error ? err.message : String(err)}`);
	}
}
async function initializeThemeManager() {
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
async function initializeMediaFolder() {
	const mediaFolderPath = (await getPublicSetting('MEDIA_FOLDER')) || './mediaFolder';
	if (building) return;
	const fs = await import('node:fs/promises');
	try {
		await fs.stat(mediaFolderPath);
	} catch {
		logger.info(`Creating media folder: ${mediaFolderPath}`);
		await fs.mkdir(mediaFolderPath, { recursive: true });
	}
}
async function initializeVirtualFolders() {
	if (!dbAdapter) throw new Error('Cannot initialize virtual folders: dbAdapter is not available.');
	if (!dbAdapter.systemVirtualFolder) {
		logger.warn('systemVirtualFolder adapter not available, skipping initialization.');
		return;
	}
	const { getDatabaseResilience } = await import('./DatabaseResilience.js');
	const resilience = getDatabaseResilience();
	await resilience.executeWithRetry(async () => {
		if (!dbAdapter) throw new Error('dbAdapter is null');
		if (dbAdapter.isConnected && !dbAdapter.isConnected()) {
			throw new Error('Database connection lost - reconnection required');
		}
		const systemVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();
		if (!systemVirtualFoldersResult.success) {
			const error2 = systemVirtualFoldersResult.error;
			let errorMessage = 'Unknown error';
			if (error2 instanceof Error) {
				errorMessage = error2.message;
			} else if (error2 && typeof error2 === 'object' && 'message' in error2) {
				errorMessage = String(error2.message);
			} else if (error2) {
				errorMessage = String(error2);
			}
			throw new Error(`Failed to get virtual folders: ${errorMessage}`);
		}
		const systemVirtualFolders = systemVirtualFoldersResult.data;
		if (systemVirtualFolders.length === 0) {
			const defaultMediaFolder = (await getPublicSetting('MEDIA_FOLDER')) || 'mediaFolder';
			const creationResult = await dbAdapter.systemVirtualFolder.create({
				name: defaultMediaFolder,
				path: defaultMediaFolder,
				order: 0,
				type: 'folder'
			});
			if (!creationResult.success) {
				const error2 = creationResult.error;
				const errorMessage = error2 instanceof Error ? error2.message : String(error2);
				throw new Error(`Failed to create root virtual folder: ${errorMessage}`);
			}
		}
	}, 'Virtual Folders Initialization');
}
async function initializeRevisions() {
	if (!dbAdapter) throw new Error('Cannot initialize revisions: dbAdapter is not available.');
}
async function initializeSystem(forceReload = false, skipSetupCheck = false) {
	if (isInitialized) {
		logger.debug('System already initialized. Skipping.');
		return;
	}
	const systemStartTime = performance.now();
	logger.info('Starting SvelteCMS System Initialization...');
	await setSystemState('INITIALIZING', 'Starting system initialization');
	try {
		let privateConfig;
		if (skipSetupCheck) {
			logger.debug('Skipping private config load - using pre-set configuration');
			privateConfig = privateEnv;
		} else {
			privateConfig = await loadPrivateConfig(forceReload);
		}
		if (!privateConfig || !privateConfig.DB_TYPE) {
			logger.info('Private config not available – running in setup mode (skipping full initialization).');
			await setSystemState('IDLE', 'Running in setup mode');
			return;
		}
		updateServiceHealth('database', 'initializing', 'Loading database adapter...');
		await loadAdapters();
		if (!dbAdapter) {
			updateServiceHealth('database', 'unhealthy', 'Database adapter failed to load');
			throw new Error('Database adapter failed to load.');
		}
		let connectionString;
		if (privateConfig.DB_TYPE === 'mongodb') {
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER)}:${encodeURIComponent(privateConfig.DB_PASSWORD)}@` : '';
			connectionString = `mongodb://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}${hasAuth ? '?authSource=admin' : ''}`;
			logger.debug(`Connecting to MongoDB...`);
		} else if (privateConfig.DB_TYPE === 'mongodb+srv') {
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER)}:${encodeURIComponent(privateConfig.DB_PASSWORD)}@` : '';
			connectionString = `mongodb+srv://${authPart}${privateConfig.DB_HOST}/${privateConfig.DB_NAME}?retryWrites=true&w=majority`;
			logger.debug(`Connecting to MongoDB Atlas (SRV)...`);
		} else if (privateConfig.DB_TYPE === 'mariadb') {
			const hasAuth = privateConfig.DB_USER && privateConfig.DB_PASSWORD;
			const authPart = hasAuth ? `${encodeURIComponent(privateConfig.DB_USER)}:${encodeURIComponent(privateConfig.DB_PASSWORD)}@` : '';
			connectionString = `mysql://${authPart}${privateConfig.DB_HOST}:${privateConfig.DB_PORT}/${privateConfig.DB_NAME}`;
			logger.debug(`Connecting to MariaDB...`);
		} else {
			connectionString = '';
		}
		const step2And3StartTime = performance.now();
		const [connectionResult] = await Promise.all([
			dbAdapter.connect(connectionString),
			// Step 3: Setup Core Database Models (runs in parallel with connection)
			// Models can be set up while connection is establishing
			(async () => {
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
		logger.info('Step 4: Skipping eager ContentManager init (moved to Step 6)');
		logger.debug('Starting Step 5: Critical components initialization...');
		const step5StartTime = performance.now();
		logger.debug('Initializing Auth service...');
		updateServiceHealth('auth', 'initializing', 'Initializing authentication service...');
		if (!dbAdapter) {
			logger.error('Cannot initialize Auth: dbAdapter is null');
			throw new Error('Database adapter not initialized');
		}
		auth = new Auth(dbAdapter, getDefaultSessionStore());
		if (!auth) {
			logger.error('Auth constructor returned null/undefined');
			updateServiceHealth('auth', 'unhealthy', 'Auth initialization failed');
			throw new Error('Auth initialization failed');
		}
		logger.debug('Auth service initialized successfully');
		updateServiceHealth('auth', 'healthy', 'Authentication service ready');
		logger.debug('Loading settings from database...');
		const settingsStartTime = performance.now();
		await loadSettingsFromDB();
		const settingsTime = performance.now() - settingsStartTime;
		logger.debug(`Settings loaded in ${settingsTime.toFixed(2)}ms`);
		const authTime = performance.now() - step5StartTime;
		logger.debug('Starting parallel I/O operations...');
		const parallelStartTime = performance.now();
		updateServiceHealth('cache', 'initializing', 'Initializing media, revisions, and themes...');
		updateServiceHealth('themeManager', 'initializing', 'Initializing theme manager...');
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
				const { widgets } = await import('./widgetStore.svelte.js');
				await widgets.initialize(void 0, dbAdapter);
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
		logger.info('Step 5: Database and core components initialized.');
		if (privateConfig?.DEMO) {
			import('./demoCleanup.js').then(({ cleanupExpiredDemoTenants }) => {
				logger.info('🧹 Demo Cleanup Service initialized (Interval: 5m, TTL: 60m)');
				cleanupExpiredDemoTenants();
				setInterval(cleanupExpiredDemoTenants, 5 * 60 * 1e3);
			});
		}
		isInitialized = true;
		await setSystemState('READY', 'All critical services initialized successfully');
		const totalTime = performance.now() - systemStartTime;
		logger.info(`🚀 System initialization completed successfully in ${totalTime.toFixed(2)}ms!`);
	} catch (err) {
		const message = `CRITICAL: System initialization failed: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, err);
		isInitialized = false;
		isConnected = false;
		auth = null;
		await setSystemState('FAILED', message);
		throw new Error(message);
	}
}
async function initializeForSetup(dbConfig) {
	try {
		logger.info('Initializing minimal database connection for setup mode...');
		if (!adaptersLoaded) {
			await loadAdapters();
		}
		if (!dbAdapter) {
			return { success: false, error: 'Failed to load database adapter' };
		}
		let connectionString;
		if (dbConfig.type === 'mongodb') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user)}:${encodeURIComponent(dbConfig.password)}@` : '';
			connectionString = `mongodb://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}${hasAuth ? '?authSource=admin' : ''}`;
		} else if (dbConfig.type === 'mariadb') {
			const hasAuth = dbConfig.user && dbConfig.password;
			const authPart = hasAuth ? `${encodeURIComponent(dbConfig.user)}:${encodeURIComponent(dbConfig.password)}@` : '';
			connectionString = `mysql://${authPart}${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;
		} else {
			return { success: false, error: `Database type '${dbConfig.type}' not supported yet` };
		}
		const connectionResult = await dbAdapter.connect(connectionString);
		if (!connectionResult.success) {
			return { success: false, error: connectionResult.error?.message || 'Connection failed' };
		}
		isConnected = true;
		logger.info('✅ Minimal database connection established for setup');
		return { success: true };
	} catch (error2) {
		const message = error2 instanceof Error ? error2.message : String(error2);
		logger.error('Failed to initialize database for setup:', message);
		return { success: false, error: message };
	}
}
function initializeOnRequest(forceInit = false) {
	const isBuildProcess = typeof process !== 'undefined' && process.argv?.some((arg) => ['build', 'check'].includes(arg));
	if (!building && !isBuildProcess) {
		if (!initializationPromise || forceInit) {
			logger.debug('Creating system initialization promise...');
			initializationPromise = (async () => {
				const privateConfig = await loadPrivateConfig(forceInit);
				if (!privateConfig || !privateConfig.DB_TYPE || !privateConfig.DB_HOST) {
					logger.info('Private config not available – skipping initialization (setup mode)');
					return Promise.resolve();
				}
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
async function getSystemStatus() {
	const basicStatus = {
		initialized: isInitialized,
		connected: isConnected,
		authReady: !!auth,
		initializing: !!initializationPromise && !isInitialized
	};
	if (!isConnected || !dbAdapter) {
		return basicStatus;
	}
	try {
		const { getDatabaseResilience } = await import('./DatabaseResilience.js');
		const resilience = getDatabaseResilience();
		const healthResult = await resilience.healthCheck(async () => {
			if (!dbAdapter) throw new Error('dbAdapter is null');
			const start = Date.now();
			if (dbAdapter.isConnected && dbAdapter.isConnected()) {
				return Date.now() - start;
			}
			throw new Error('Database not connected');
		});
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
	} catch (error2) {
		return {
			...basicStatus,
			health: {
				healthy: false,
				latency: -1,
				message: error2 instanceof Error ? error2.message : 'Health check failed'
			}
		};
	}
}
function getAuth() {
	return auth;
}
async function reinitializeSystem(force = false, waitForAuth = true) {
	if (isInitialized && !force) {
		return { status: 'already-initialized' };
	}
	if (force) {
		logger.info('Force reinitialization requested - clearing existing initialization promise and reloading config');
		initializationPromise = null;
		isInitialized = false;
		isConnected = false;
		auth = null;
		await loadPrivateConfig(true);
		await setSystemState('IDLE', 'Preparing for reinitialization');
	}
	if (initializationPromise) {
		return { status: 'initialization-in-progress' };
	}
	try {
		logger.info(`Manual reinitialization requested${force ? ' (force)' : ''}${!waitForAuth ? ' (skip auth wait)' : ''}`);
		initializationPromise = initializeSystem(force);
		await initializationPromise;
		if (waitForAuth) {
			logger.info('Waiting for auth service to become available after reinitialization...');
			const authReady = await waitForServiceHealthy('auth', { timeoutMs: 3e3 });
			if (!authReady) {
				logger.warn('Auth service not ready after timeout, but will continue');
			}
		} else {
			logger.info('Skipping auth readiness wait (setup mode)');
		}
		return { status: 'initialized' };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		initializationPromise = null;
		return { status: 'failed', error: message };
	}
}
async function initializeWithConfig(config) {
	try {
		logger.info('🚀 Initializing system with provided configuration (bypassing Vite cache & filesystem)...');
		privateEnv = config;
		initializationPromise = null;
		isInitialized = false;
		isConnected = false;
		auth = null;
		await setSystemState('IDLE', 'Preparing for initialization with in-memory config');
		logger.debug('In-memory config set successfully', {
			DB_TYPE: config.DB_TYPE,
			DB_HOST: config.DB_HOST ? '***' : 'missing',
			hasJWT: !!config.JWT_SECRET_KEY,
			hasEncryption: !!config.ENCRYPTION_KEY
		});
		initializationPromise = initializeSystem(false, true);
		await initializationPromise;
		logger.info('✅ System initialized successfully with in-memory config (zero-restart)');
		return { status: 'success' };
	} catch (error2) {
		const errorMessage = error2 instanceof Error ? error2.message : String(error2);
		logger.error('Failed to initialize with in-memory config:', errorMessage);
		initializationPromise = null;
		privateEnv = null;
		await setSystemState('FAILED', `Initialization failed: ${errorMessage}`);
		return { status: 'failed', error: errorMessage };
	}
}
async function initializeWithFreshConfig() {
	logger.info('Initializing system with fresh config from filesystem (bypassing Vite cache)...');
	initializationPromise = null;
	isInitialized = false;
	isConnected = false;
	auth = null;
	privateEnv = null;
	await setSystemState('IDLE', 'Preparing for initialization with fresh config');
	try {
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
		initializationPromise = initializeSystem(false, true);
		await initializationPromise;
		logger.info('✅ System initialized successfully with fresh config');
		return { status: 'initialized' };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Failed to initialize with fresh config:', message);
		initializationPromise = null;
		privateEnv = null;
		return { status: 'failed', error: message };
	}
}
function getDb() {
	return dbAdapter;
}
async function initConnection(dbConfig) {
	if (!dbConfig || !dbConfig.type) {
		throw new Error('Database configuration is required');
	}
	if (dbConfig.type !== 'mongodb') {
		throw new Error(`Database type '${dbConfig.type}' is not supported for seeding yet`);
	}
	try {
		const { MongoDBAdapter } = await import('./mongoDBAdapter.js');
		const tempAdapter = new MongoDBAdapter();
		const { buildDatabaseConnectionString } = await import('./database.js');
		const connectionString = buildDatabaseConnectionString({
			type: dbConfig.type,
			host: dbConfig.host,
			port: Number(dbConfig.port),
			name: dbConfig.name,
			user: dbConfig.user ?? '',
			password: dbConfig.password ?? ''
		});
		const isAtlas = connectionString.startsWith('mongodb+srv://');
		const options = {
			user: dbConfig.user || void 0,
			pass: dbConfig.password || void 0,
			dbName: dbConfig.name,
			authSource: isAtlas ? void 0 : 'admin',
			retryWrites: true,
			serverSelectionTimeoutMS: 15e3,
			maxPoolSize: 1
			// Use a minimal pool for seeding
		};
		const connectResult = await tempAdapter.connect(connectionString, options);
		if (!connectResult.success) {
			throw new Error(`Database connection failed: ${connectResult.error?.message || 'Unknown error'}`);
		}
		dbAdapter = tempAdapter;
		logger.info('Database connection initialized for seeding');
	} catch (error2) {
		logger.error('Failed to initialize database connection for seeding:', error2);
		throw error2;
	}
}
const db = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			get auth() {
				return auth;
			},
			clearPrivateConfigCache,
			get dbAdapter() {
				return dbAdapter;
			},
			dbInitPromise,
			getAuth,
			getDb,
			getDbInitPromise,
			getPrivateEnv,
			getSystemStatus,
			initConnection,
			initializeForSetup,
			initializeOnRequest,
			initializeWithConfig,
			initializeWithFreshConfig,
			get isConnected() {
				return isConnected;
			},
			loadSettingsFromDB,
			reinitializeSystem
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export { SESSION_COOKIE_NAME as S, auth as a, dbInitPromise as b, getPrivateEnv as c, dbAdapter as d, db as e, getDb as g, reinitializeSystem as r };
//# sourceMappingURL=db.js.map
