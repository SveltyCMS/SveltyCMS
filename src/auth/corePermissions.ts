/**
 * @file src/auth/corePermissions.ts
 * @description Core permissions configuration for the authentication system
 *
 * This file contains the core permission definitions that can be easily modified
 * without affecting the core authentication logic.
 */

import { PermissionAction, PermissionType, type Permission } from './types';

// Core permissions that are always available
export const corePermissions: Permission[] = [
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
	{ _id: 'tenant:manage', name: 'Manage Tenants', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'tenant' }, // System resource permissions (used by tokens, themes, content-structure, etc.)

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
	{ _id: 'admin:access', name: 'Admin Access', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM, contextId: 'admin/access' }
];
