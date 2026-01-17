import { error, redirect } from '@sveltejs/kit';
import { getPrivateSettingSync } from './settingsService.js';
import { a as hasPermissionByAction } from './permissions.js';
import { a as auth } from './db.js';
import { cacheService, USER_COUNT_CACHE_TTL_MS, USER_COUNT_CACHE_TTL_S, USER_PERM_CACHE_TTL_MS, USER_PERM_CACHE_TTL_S } from './CacheService.js';
import { l as logger } from './logger.server.js';
let userCountCache = null;
const rolesCache = /* @__PURE__ */ new Map();
function isPublicRoute(pathname) {
	const publicRoutes = ['/login', '/register', '/forgot-password', '/setup', '/api/sendMail', '/api/setup', '/api/system/version', '/api/user/login'];
	return publicRoutes.some((route) => pathname.startsWith(route));
}
function isOAuthRoute(pathname) {
	return pathname.startsWith('/login') && pathname.includes('OAuth');
}
async function getCachedUserCount(tenantId) {
	const now = Date.now();
	if (userCountCache && now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS) {
		return userCountCache.count;
	}
	try {
		const cached = await cacheService.get('userCount', tenantId);
		if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
			userCountCache = cached;
			return cached.count;
		}
	} catch {}
	try {
		if (!auth) return -1;
		const filter = getPrivateSettingSync('MULTI_TENANT') && tenantId ? { tenantId } : {};
		const count = await auth.getUserCount(filter);
		const cacheData = { count, timestamp: now };
		userCountCache = cacheData;
		await cacheService.set('userCount', cacheData, USER_COUNT_CACHE_TTL_S, tenantId);
		return count;
	} catch (err) {
		logger.warn(`User count query failed: ${err instanceof Error ? err.message : String(err)}`);
		return -1;
	}
}
async function getCachedRoles(tenantId) {
	const now = Date.now();
	const key = tenantId || 'global';
	const cached = rolesCache.get(key);
	if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) {
		return cached.data;
	}
	try {
		if (!auth) {
			logger.debug('Database adapter not initialized - roles unavailable');
			return [];
		}
		const data = await auth.getAllRoles(tenantId);
		if (!data || data.length === 0) {
			logger.debug('No roles found in database', { tenantId });
			return [];
		}
		const cacheData = { data, timestamp: now };
		rolesCache.set(key, cacheData);
		await cacheService.set(`roles:${key}`, cacheData, USER_PERM_CACHE_TTL_S, tenantId);
		return data;
	} catch (err) {
		logger.error(`Failed to fetch roles from database: ${err instanceof Error ? err.message : String(err)}`);
		return [];
	}
}
const handleAuthorization = async ({ event, resolve }) => {
	const { url, locals } = event;
	const { user } = locals;
	const pathname = url.pathname;
	const isApi = pathname.startsWith('/api/');
	const isPublic = isPublicRoute(pathname);
	const ASSET_REGEX =
		/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;
	if (pathname.startsWith('/.well-known/') || pathname.startsWith('/_') || ASSET_REGEX.test(pathname)) {
		return resolve(event);
	}
	if (isPublic) {
		locals.isAdmin = false;
		locals.hasManageUsersPermission = false;
		locals.isFirstUser = false;
		return resolve(event);
	}
	const userCount = await getCachedUserCount(locals.tenantId);
	locals.isFirstUser = userCount === 0;
	const rolesData = await getCachedRoles(locals.tenantId);
	locals.roles = rolesData;
	const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
	if (rolesData.length === 0 && !pathname.startsWith('/setup') && !pathname.startsWith('/api/setup') && !isLocalizedSetup) {
		logger.warn('No roles found in database - redirecting to setup', { pathname, tenantId: locals.tenantId });
		if (isApi) {
			throw error(503, 'Service Unavailable: System not initialized. Please run setup.');
		}
		throw redirect(302, '/setup');
	}
	if (user) {
		const userRole = rolesData.find((r) => r._id === user.role);
		const isAdmin = !!userRole?.isAdmin;
		locals.isAdmin = isAdmin;
		locals.hasManageUsersPermission = isAdmin || hasPermissionByAction(user, 'manage', 'user', void 0, rolesData);
		if (isPublic && !isOAuthRoute(pathname) && !isApi) {
			throw redirect(302, '/');
		}
	} else {
		locals.isAdmin = false;
		locals.hasManageUsersPermission = false;
		if (!isPublic && !locals.isFirstUser) {
			if (isApi) throw error(401, 'Unauthorized');
			throw redirect(302, '/login');
		}
	}
	if (isOAuthRoute(pathname)) {
		logger.trace('OAuth route detected, passing through');
	}
	return resolve(event);
};
function invalidateUserCountCache(tenantId) {
	userCountCache = null;
	cacheService.delete('userCount', tenantId).catch((err) => logger.error(`Failed to invalidate user count: ${err.message}`));
	logger.debug('User count cache invalidated');
}
function invalidateRolesCache(tenantId) {
	const key = tenantId || 'global';
	rolesCache.delete(key);
	cacheService.delete(`roles:${key}`, tenantId).catch((err) => logger.error(`Failed to invalidate roles cache: ${err.message}`));
	logger.debug(`Roles cache invalidated (tenant: ${tenantId || 'global'})`);
}
export { handleAuthorization, invalidateRolesCache, invalidateUserCountCache };
//# sourceMappingURL=handleAuthorization.js.map
