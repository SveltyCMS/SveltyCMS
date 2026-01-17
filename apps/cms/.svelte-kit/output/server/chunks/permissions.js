import { logger } from './logger.js';
import { P as PermissionType, a as PermissionAction } from './types.js';
const corePermissions = [
	// System permissions
	{ _id: 'system:dashboard', name: 'Dashboard Access', action: PermissionAction.ACCESS, type: PermissionType.SYSTEM },
	{ _id: 'system:admin', name: 'Admin Access', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	{ _id: 'system:settings', name: 'Settings Management', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	// Dashboard resource permissions
	{ _id: 'dashboard:read', name: 'Dashboard Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'dashboard' },
	{ _id: 'dashboard:write', name: 'Dashboard Write Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'dashboard' },
	{ _id: 'dashboard:update', name: 'Dashboard Update Access', action: PermissionAction.UPDATE, type: PermissionType.SYSTEM, contextId: 'dashboard' },
	// SendMail resource permissions
	{ _id: 'sendMail:write', name: 'Send Mail Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'sendMail' },
	// Permissions management resource permissions
	{ _id: 'permissions:update', name: 'Update Permissions', action: PermissionAction.UPDATE, type: PermissionType.SYSTEM, contextId: 'permissions' },
	// System preferences resource permissions
	{
		_id: 'systemPreferences:read',
		name: 'Read System Preferences',
		action: PermissionAction.READ,
		type: PermissionType.SYSTEM,
		contextId: 'systemPreferences'
	},
	{
		_id: 'systemPreferences:write',
		name: 'Write System Preferences',
		action: PermissionAction.WRITE,
		type: PermissionType.SYSTEM,
		contextId: 'systemPreferences'
	},
	// Search resource permissions
	{ _id: 'search:read', name: 'Search Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'search' },
	// GraphQL resource permissions
	{ _id: 'graphql:read', name: 'GraphQL API Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'graphql' },
	// Media resource permissions
	{ _id: 'media:read', name: 'Media Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'media' },
	{ _id: 'media:write', name: 'Media Write Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'media' },
	{ _id: 'media:delete', name: 'Media Delete Access', action: PermissionAction.DELETE, type: PermissionType.SYSTEM, contextId: 'media' },
	// User management permissions
	{ _id: 'user:create', name: 'User Create Access', action: PermissionAction.CREATE, type: PermissionType.SYSTEM, contextId: 'user' },
	{ _id: 'user:read', name: 'User Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'user' },
	{ _id: 'user:update', name: 'User Update Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'user' },
	{ _id: 'user:delete', name: 'User Delete Access', action: PermissionAction.DELETE, type: PermissionType.SYSTEM, contextId: 'user' },
	// --- NEW: Tenant management permissions (for multi-tenant mode) ---
	{ _id: 'tenant:create', name: 'Create Tenants', action: PermissionAction.CREATE, type: PermissionType.SYSTEM, contextId: 'tenant' },
	{ _id: 'tenant:read', name: 'Read Tenants', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'tenant' },
	{ _id: 'tenant:update', name: 'Update Tenants', action: PermissionAction.UPDATE, type: PermissionType.SYSTEM, contextId: 'tenant' },
	{ _id: 'tenant:delete', name: 'Delete Tenants', action: PermissionAction.DELETE, type: PermissionType.SYSTEM, contextId: 'tenant' },
	{ _id: 'tenant:manage', name: 'Manage Tenants', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'tenant' },
	// System resource permissions (used by tokens, themes, content-structure, etc.)
	{ _id: 'system:read', name: 'System Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'system' },
	{ _id: 'system:write', name: 'System Write Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'system' },
	{ _id: 'system:delete', name: 'System Delete Access', action: PermissionAction.DELETE, type: PermissionType.SYSTEM, contextId: 'system' },
	// Users resource permissions (used by avatar management, user listing, etc.)
	{ _id: 'users:read', name: 'Users Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'users' },
	{ _id: 'users:write', name: 'Users Write Access', action: PermissionAction.WRITE, type: PermissionType.SYSTEM, contextId: 'users' },
	{ _id: 'users:delete', name: 'Users Delete Access', action: PermissionAction.DELETE, type: PermissionType.SYSTEM, contextId: 'users' },
	// Collections management permissions
	{ _id: 'collections:read', name: 'Collections Read Access', action: PermissionAction.READ, type: PermissionType.SYSTEM, contextId: 'collections' },
	{
		_id: 'collections:write',
		name: 'Collections Write Access',
		action: PermissionAction.WRITE,
		type: PermissionType.SYSTEM,
		contextId: 'collections'
	},
	{
		_id: 'collections:create',
		name: 'Collections Create Access',
		action: PermissionAction.CREATE,
		type: PermissionType.SYSTEM,
		contextId: 'collections'
	},
	{
		_id: 'collections:update',
		name: 'Collections Update Access',
		action: PermissionAction.UPDATE,
		type: PermissionType.SYSTEM,
		contextId: 'collections'
	},
	{
		_id: 'collections:delete',
		name: 'Collections Delete Access',
		action: PermissionAction.DELETE,
		type: PermissionType.SYSTEM,
		contextId: 'collections'
	},
	// API permissions
	{ _id: 'api:graphql', name: 'GraphQL API Access', action: PermissionAction.ACCESS, type: PermissionType.SYSTEM },
	{ _id: 'api:collections', name: 'Collections API Access', action: PermissionAction.ACCESS, type: PermissionType.SYSTEM },
	{ _id: 'api:export', name: 'Export API Access', action: PermissionAction.EXECUTE, type: PermissionType.SYSTEM },
	{
		_id: 'api:user',
		name: 'User API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to all API endpoints under /api/user/.'
	},
	{
		_id: 'api:sendMail',
		name: 'Send Mail API Access',
		action: PermissionAction.EXECUTE,
		type: PermissionType.SYSTEM,
		description: 'Grants access to send emails via the API.'
	},
	{ _id: 'api:exportData', name: 'Export Api Data', action: PermissionAction.EXECUTE, type: PermissionType.SYSTEM, contextId: 'api/exportData' },
	{
		_id: 'api:query',
		name: 'Query API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the query API endpoint.'
	},
	{
		_id: 'api:systemPreferences',
		name: 'System Preferences API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the system preferences API endpoints.'
	},
	{
		_id: 'api:systemInfo',
		name: 'System Info API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the system information API endpoints.'
	},
	{
		_id: 'api:userActivity',
		name: 'User Activity API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the user activity API endpoint for dashboard widgets.'
	},
	{
		_id: 'api:media',
		name: 'Media API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the media API endpoints.'
	},
	{
		_id: 'api:widgets',
		name: 'Widget API Access',
		action: PermissionAction.ACCESS,
		type: PermissionType.SYSTEM,
		description: 'Grants access to the widget management API endpoints.'
	},
	// Collection permissions
	{ _id: 'collection:create', name: 'Create Collection Entries', action: PermissionAction.CREATE, type: PermissionType.COLLECTION },
	{ _id: 'collection:read', name: 'Read Collection Entries', action: PermissionAction.READ, type: PermissionType.COLLECTION },
	{ _id: 'collection:update', name: 'Update Collection Entries', action: PermissionAction.UPDATE, type: PermissionType.COLLECTION },
	{ _id: 'collection:delete', name: 'Delete Collection Entries', action: PermissionAction.DELETE, type: PermissionType.COLLECTION },
	// Content permissions
	{ _id: 'content:editor', name: 'Content Editor', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	{ _id: 'content:builder', name: 'Content Builder', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	{ _id: 'content:images', name: 'Image Management', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	// User management permissions (consolidated)
	{ _id: 'user:manage', name: 'Manage Users', action: PermissionAction.MANAGE, type: PermissionType.USER },
	{
		_id: 'user.create',
		name: 'Create User Tokens',
		action: PermissionAction.CREATE,
		type: PermissionType.USER,
		contextId: 'user.create',
		description: 'Allows creating new user registration tokens.'
	},
	// Configuration permissions - matching your original permissionConfigs
	{
		_id: 'config:collectionManagement',
		name: 'Collection Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.CONFIGURATION,
		contextId: 'config/collectionManagement'
	},
	{
		_id: 'config:collectionbuilder',
		name: 'Collection Builder Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.SYSTEM,
		contextId: 'config/collectionbuilder'
	},
	{ _id: 'config:graphql', name: 'GraphQL Management', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'config/graphql' },
	{
		_id: 'config:imageeditor',
		name: 'ImageEditor Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.SYSTEM,
		contextId: 'config/imageeditor'
	},
	{
		_id: 'config:dashboard',
		name: 'Dashboard Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.SYSTEM,
		contextId: 'config/dashboard'
	},
	{
		_id: 'config:widgetManagement',
		name: 'Widget Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.CONFIGURATION,
		contextId: 'config/widgetManagement'
	},
	{
		_id: 'config:themeManagement',
		name: 'Theme Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.CONFIGURATION,
		contextId: 'config/themeManagement'
	},
	{ _id: 'config:settings', name: 'Settings Management', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'config/settings' },
	{
		_id: 'config:accessManagement',
		name: 'Access Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.CONFIGURATION,
		contextId: 'config/accessManagement'
	},
	{
		_id: 'config:emailPreviews',
		name: 'Email Previews',
		action: PermissionAction.MANAGE,
		type: PermissionType.SYSTEM,
		contextId: 'config/emailPreviews'
	},
	{
		_id: 'config:adminArea',
		name: 'Admin Area Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.SYSTEM,
		contextId: 'config/adminArea'
	},
	// Admin permissions
	{ _id: 'admin:access', name: 'Admin Access', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'admin/access' },
	{
		_id: 'config:importexport',
		name: 'Import/Export Management',
		action: PermissionAction.MANAGE,
		type: PermissionType.CONFIGURATION,
		contextId: 'config/import-export'
	}
];
const permissionRegistry = /* @__PURE__ */ new Map();
corePermissions.forEach((permission) => {
	permissionRegistry.set(permission._id, permission);
});
function registerPermission(permission) {
	permissionRegistry.set(permission._id, permission);
	logger.trace(`Permission registered: ${permission._id}`);
}
function getAllPermissions() {
	return Array.from(permissionRegistry.values());
}
function hasPermissionWithRoles(user, permissionId, roles) {
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) {
		logger.warn('Role not found for user', { email: user.email, userRoleId: user.role, rolesAvailable: roles.map((r) => r._id) });
		return false;
	}
	if (userRole.isAdmin) {
		logger.trace('Admin user granted permission', { email: user.email, permissionId, userRole });
		return true;
	}
	const hasPermission = userRole.permissions.includes(permissionId);
	if (!hasPermission) {
		logger.warn('Permission denied for user', {
			email: user.email,
			userId: user._id,
			userRoleId: user.role,
			userRole,
			permissionId,
			userPermissions: userRole.permissions,
			rolesAvailable: roles.map((r) => ({ id: r._id, isAdmin: r.isAdmin }))
		});
	}
	logger.trace('Permission check for user', { permissionId, granted: hasPermission, email: user.email });
	return hasPermission;
}
function hasPermissionByAction(user, action, type, contextId, userRoles) {
	if (!user) {
		return false;
	}
	let roles = userRoles || [];
	if (!userRoles) {
		try {
			if (typeof globalThis !== 'undefined' && globalThis.__ROLES_CACHE__) {
				roles = globalThis.__ROLES_CACHE__;
			} else {
				logger.warn('No roles available for permission check - defaulting to deny');
				return false;
			}
		} catch (error) {
			logger.error('Failed to load roles for hasPermissionByAction:', error);
			return false;
		}
	}
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) return false;
	if (userRole.isAdmin) {
		logger.trace('Admin user granted permission for action', { email: user.email, action, type });
		return true;
	}
	const permission = Array.from(permissionRegistry.values()).find(
		(p) => p.action === action && p.type === type && (!contextId || p.contextId === contextId)
	);
	if (!permission) return false;
	return userRole.permissions.includes(permission._id);
}
const permissionConfigs = {
	collectionManagement: {
		contextId: 'config:collectionManagement',
		action: 'read',
		type: 'config',
		name: 'Collection Management',
		description: 'Access to collection management'
	},
	collectionbuilder: {
		contextId: 'config:collectionbuilder',
		action: 'read',
		type: 'config',
		name: 'Collection Builder',
		description: 'Access to collection builder'
	},
	graphql: { contextId: 'config:graphql', action: 'read', type: 'config', name: 'GraphQL', description: 'Access to GraphQL interface' },
	imageeditor: { contextId: 'config:imageeditor', action: 'read', type: 'config', name: 'Image Editor', description: 'Access to image editor' },
	dashboard: { contextId: 'config:dashboard', action: 'read', type: 'config', name: 'Dashboard', description: 'Access to dashboard' },
	widgetManagement: {
		contextId: 'config:widgetManagement',
		action: 'read',
		type: 'config',
		name: 'Widget Management',
		description: 'Access to widget management'
	},
	themeManagement: {
		contextId: 'config:themeManagement',
		action: 'read',
		type: 'config',
		name: 'Theme Management',
		description: 'Access to theme management'
	},
	settings: { contextId: 'config:settings', action: 'read', type: 'config', name: 'Settings', description: 'Access to settings' },
	// Fine-grained System Settings permissions (13 groups)
	settingsCache: {
		contextId: 'config:settings:cache',
		action: 'manage',
		type: 'config',
		name: 'Cache & Performance Settings',
		description: 'Manage cache TTLs and performance settings'
	},
	settingsDatabase: {
		contextId: 'config:settings:database',
		action: 'manage',
		type: 'config',
		name: 'Database Settings',
		description: 'Manage database and MongoDB settings'
	},
	settingsRedis: {
		contextId: 'config:settings:redis',
		action: 'manage',
		type: 'config',
		name: 'Redis Cache Settings',
		description: 'Manage Redis configuration and connection'
	},
	settingsEmail: {
		contextId: 'config:settings:email',
		action: 'manage',
		type: 'config',
		name: 'Email/SMTP Settings',
		description: 'Manage email server and SMTP configuration'
	},
	settingsSecurity: {
		contextId: 'config:settings:security',
		action: 'manage',
		type: 'config',
		name: 'Security Settings',
		description: 'Manage 2FA, session, and security settings'
	},
	settingsOAuth: {
		contextId: 'config:settings:oauth',
		action: 'manage',
		type: 'config',
		name: 'OAuth & Social Login',
		description: 'Manage Google OAuth and social login'
	},
	settingsMedia: {
		contextId: 'config:settings:media',
		action: 'manage',
		type: 'config',
		name: 'Media Storage Settings',
		description: 'Manage media folder, sizes, and formats'
	},
	settingsLanguages: {
		contextId: 'config:settings:languages',
		action: 'manage',
		type: 'config',
		name: 'Languages & Localization',
		description: 'Manage content languages and locales'
	},
	settingsIntegrations: {
		contextId: 'config:settings:integrations',
		action: 'manage',
		type: 'config',
		name: 'Third-Party Integrations',
		description: 'Manage MapBox, TikTok, Twitch integrations'
	},
	settingsSite: {
		contextId: 'config:settings:site',
		action: 'manage',
		type: 'config',
		name: 'Site Configuration',
		description: 'Manage site name, URLs, and basic config'
	},
	settingsAppearance: {
		contextId: 'config:settings:appearance',
		action: 'manage',
		type: 'config',
		name: 'Appearance Settings',
		description: 'Manage default theme and appearance'
	},
	settingsLogging: {
		contextId: 'config:settings:logging',
		action: 'manage',
		type: 'config',
		name: 'Logging Settings',
		description: 'Manage log levels, retention, and rotation'
	},
	settingsAdvanced: {
		contextId: 'config:settings:advanced',
		action: 'manage',
		type: 'config',
		name: 'Advanced Settings',
		description: 'Manage server port, roles, permissions, and demo mode'
	},
	accessManagement: {
		contextId: 'config:accessManagement',
		action: 'read',
		type: 'config',
		name: 'Access Management',
		description: 'Access to user management'
	},
	adminAccess: { contextId: 'admin:access', action: 'read', type: 'admin', name: 'Admin Access', description: 'Administrative access' },
	emailPreviews: {
		contextId: 'config:emailPreviews',
		action: 'read',
		type: 'config',
		name: 'Email Previews',
		description: 'Access to email previews'
	},
	adminAreaPermissionConfig: {
		contextId: 'config:adminArea',
		action: 'read',
		type: 'config',
		name: 'Admin Area',
		description: 'Access to admin area'
	},
	exportData: { contextId: 'api:exportData', action: 'export', type: 'api', name: 'Export Data', description: 'Export system data' },
	apiUser: { contextId: 'api:user', action: 'read', type: 'api', name: 'User API', description: 'Access to user API' },
	userCreateToken: {
		contextId: 'user.create',
		action: 'create',
		type: 'user',
		name: 'Create User Token',
		description: 'Create user registration tokens'
	},
	userManage: {
		contextId: 'user:manage',
		action: 'manage',
		type: 'user',
		name: 'User Management',
		description: 'Manage user accounts and roles'
	}
};
const permissions = getAllPermissions();
const permissions$1 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			getAllPermissions,
			hasPermissionByAction,
			hasPermissionWithRoles,
			permissionConfigs,
			permissions,
			registerPermission
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export {
	hasPermissionByAction as a,
	permissions as b,
	corePermissions as c,
	permissions$1 as d,
	getAllPermissions as g,
	hasPermissionWithRoles as h,
	permissionConfigs as p,
	registerPermission as r
};
//# sourceMappingURL=permissions.js.map
