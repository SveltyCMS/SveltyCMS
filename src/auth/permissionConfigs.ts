/**
 * @file src/auth/permissionConfigs.ts
 * @description Permission configurations for the system
 *
 * Contains all predefined permission configurations used throughout the system
 */

import type { PermissionConfig } from './permissionTypes';
import { PermissionAction, PermissionType } from './permissionTypes';

export const permissionConfigs: Record<string, PermissionConfig> = {
	// Config Permissions
	collectionManagement: {
		contextId: 'config/collectionManagement',
		name: 'Collection Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	collectionbuilder: {
		contextId: 'config/collectionbuilder',
		name: 'Collection Builder Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	graphql: {
		contextId: 'config/graphql',
		name: 'GraphQL Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	imageeditor: {
		contextId: 'config/imageeditor',
		name: 'ImageEditor Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	dashboard: {
		contextId: 'config/dashboard',
		name: 'Dashboard Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	widgetManagement: {
		contextId: 'config/widgetManagement',
		name: 'Widget Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	themeManagement: {
		contextId: 'config/themeManagement',
		name: 'Theme Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	settings: {
		contextId: 'config/settings',
		name: 'Settings Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	accessManagement: {
		contextId: 'config/accessManagement',
		name: 'Access Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	adminAccess: {
		contextId: 'admin/access',
		name: 'Admin Access',
		action: 'manage',
		contextType: 'system'
	},
	emailPreviews: {
		contextId: 'config/emailPreviews',
		name: 'Email Previews',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},

	// User Permissions
	adminAreaPermissionConfig: {
		contextId: 'config/adminArea',
		name: 'Admin Area Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	// Exporting API Data
	exportData: {
		contextId: 'api/exportData',
		name: 'Export Api Data',
		action: PermissionAction.EXECUTE,
		contextType: PermissionType.SYSTEM
	}
} as const;
