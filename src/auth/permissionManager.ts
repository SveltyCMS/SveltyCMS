/**
 * @file src/auth/permissionManager.ts
 * @description Permission manager for handling file-based permissions.
 *
 * This module provides functionality to:
 * - Read permissions from the configuration file
 * - Validate permissions for users and roles
 *
 * Usage:
 * Utilized by the auth system to manage permissions in a file-based configuration.
 */

import { getCollectionFiles } from '@src/routes/api/getCollections/getCollectionFiles';

// Permissions
import { permissions as configPermissions, PermissionAction, PermissionType, setPermissions } from '@root/config/permissions';
import type { Permission as AuthPermission } from './types';
import type { PermissionConfig } from './permissionCheck';

// System Logger
import logger from '@src/utils/logger';

// Centralized and Decentralized Permissions
let decentralizedPermissions: AuthPermission[] = [];

// Function to register decentralized permissions
export function registerDecentralizedPermissions(newPermissions: AuthPermission[]): void {
	const uniquePermissions = newPermissions.filter((newPermission) => !decentralizedPermissions.some((p) => p._id === newPermission._id));
	decentralizedPermissions = [...decentralizedPermissions, ...uniquePermissions];
	logger.debug(`Registered decentralized permissions: ${JSON.stringify(uniquePermissions)}`);
}

// Converts a config permission to an auth permission type
function convertToAuthPermission(permission: any): AuthPermission {
	return {
		...permission,
		action: permission.action as PermissionAction
	};
}

// Retrieves a permission by name from the configuration
export async function getPermissionByName(name: string): Promise<AuthPermission | null> {
	const permission = configPermissions.find((p) => p.name === name) || null;
	if (!permission) {
		logger.warn(`Permission not found: ${name}`);
		return null;
	}
	return convertToAuthPermission(permission);
}

// Retrieves all permissions from the configuration
export async function getAllPermissions(): Promise<AuthPermission[]> {
	const centralized = configPermissions.map(convertToAuthPermission);
	const decentralized = decentralizedPermissions.map(convertToAuthPermission);
	const allPermissions = [...centralized, ...decentralized];
	logger.debug(`All aggregated permissions: ${JSON.stringify(allPermissions)}`);
	return allPermissions;
}

// Checks if a permission exists in the configuration
export function permissionExists(name: string): boolean {
	return configPermissions.some((p) => p.name === name);
}

// Validates if a user has a specific permission
export function validateUserPermission(userPermissions: string[], requiredPermission: string): boolean {
	return userPermissions.includes(requiredPermission);
}

// Function to update an existing permission
export async function updatePermission(permissionName: string, permissionData: AuthPermission): Promise<void> {
	try {
		const permissionIndex = configPermissions.findIndex((p) => p.name === permissionName);
		if (permissionIndex === -1) {
			throw new Error(`Permission ${permissionName} not found`);
		}
		configPermissions[permissionIndex] = { ...configPermissions[permissionIndex], ...permissionData };
		logger.info(`Permission ${permissionName} updated successfully.`);
	} catch (error) {
		logger.error(`Failed to update permission: ${(error as Error).message}`);
		throw error; // Re-throw the error to propagate it up the call stack
	}
}

// Modularized function to sync collection permissions
async function syncCollectionPermissions(collections: string[]): Promise<AuthPermission[]> {
	const permissions: AuthPermission[] = [];
	collections.forEach((collection) => {
		const baseId = collection.slice(0, collection.length - 3);
		permissions.push({
			_id: `${baseId}:create`,
			name: `Create ${baseId}`,
			action: PermissionAction.CREATE,
			type: PermissionType.COLLECTION,
			description: `Allows creating new ${baseId}`
		});
		permissions.push({
			_id: `${baseId}:read`,
			name: `Read ${baseId}`,
			action: PermissionAction.READ,
			type: PermissionType.COLLECTION,
			description: `Allows reading ${baseId}`
		});
		permissions.push({
			_id: `${baseId}:update`,
			name: `Update ${baseId}`,
			action: PermissionAction.UPDATE,
			type: PermissionType.COLLECTION,
			description: `Allows updating ${baseId}`
		});
		permissions.push({
			_id: `${baseId}:delete`,
			name: `Delete ${baseId}`,
			action: PermissionAction.DELETE,
			type: PermissionType.COLLECTION,
			description: `Allows deleting ${baseId}`
		});
	});
	//logger.debug(`Synchronized collection permissions: ${JSON.stringify(permissions)}`);
	return permissions;
}

// Synchronizes permissions if needed
export async function syncPermissions(): Promise<void> {
	try {
		const collections = await getCollectionFiles();
		const configs = Object.values(permissionConfigs).map((cur) => ({
			_id: cur.contextId,
			action: cur.action,
			name: cur.name,
			type: PermissionType.CONFIGURATION
		}));

		const collectionPermissions = await syncCollectionPermissions(collections);

		const centralizedPermissions: AuthPermission[] = [...configs, ...userManagementPermissions, ...collectionPermissions];

		const allPermissions: AuthPermission[] = [...centralizedPermissions, ...decentralizedPermissions];

		// Directly set permissions without expansion
		setPermissions(allPermissions);

		logger.info('Permissions synchronized from configuration');
	} catch (error) {
		logger.error(`Failed to synchronize permissions: ${(error as Error).message}`);
		throw error;
	}
}

export const permissionConfigs: Record<string, PermissionConfig> = {
	// Config Permissions
	collectionbuilder: {
		contextId: 'config/collectionbuilder',
		name: 'Collection Builder Management',
		action: PermissionAction.MANAGE,
		contextType: 'system'
	},
	graphql: { contextId: 'config/graphql', name: 'GraphQL Management', action: PermissionAction.MANAGE, contextType: 'system' },
	imageeditor: { contextId: 'config/imageeditor', name: 'ImageEditor Management', action: PermissionAction.MANAGE, contextType: 'system' },
	dashboard: { contextId: 'config/dashboard', name: 'Dashboard Management', action: PermissionAction.MANAGE, contextType: 'system' },
	widgetManagement: { contextId: 'config/widgetManagement', name: 'Widget Management', action: PermissionAction.MANAGE, contextType: 'system' },
	themeManagement: { contextId: 'config/themeManagement', name: 'Theme Management', action: PermissionAction.MANAGE, contextType: 'system' },
	settings: { contextId: 'config/settings', name: 'Settings Management', action: PermissionAction.MANAGE, contextType: 'system' },
	accessManagement: { contextId: 'config/accessManagement', name: 'Access Management', action: PermissionAction.MANAGE, contextType: 'system' },

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

export const userManagementPermissions = [
	{ _id: 'user:manage', name: 'Manage Users', action: PermissionAction.MANAGE, type: PermissionType.USER, description: 'Allows management of users.' }
];
