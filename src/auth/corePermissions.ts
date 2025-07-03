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

	// Collection permissions
	{ _id: 'collections:create', name: 'Create Collections', action: PermissionAction.CREATE, type: PermissionType.COLLECTION },
	{ _id: 'collections:read', name: 'Read Collections', action: PermissionAction.READ, type: PermissionType.COLLECTION },
	{ _id: 'collections:update', name: 'Update Collections', action: PermissionAction.UPDATE, type: PermissionType.COLLECTION },
	{ _id: 'collections:delete', name: 'Delete Collections', action: PermissionAction.DELETE, type: PermissionType.COLLECTION },

	// Content permissions
	{ _id: 'content:editor', name: 'Content Editor', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	{ _id: 'content:builder', name: 'Content Builder', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },
	{ _id: 'content:images', name: 'Image Management', action: PermissionAction.MANAGE, type: PermissionType.SYSTEM },

	// User management permissions
	{ _id: 'user:manage', name: 'Manage Users', action: PermissionAction.MANAGE, type: PermissionType.USER },
	{ _id: 'user:create', name: 'Create Users', action: PermissionAction.CREATE, type: PermissionType.USER },
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
