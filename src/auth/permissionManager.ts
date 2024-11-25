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

import { error } from '@sveltejs/kit';
import { getCollectionFiles } from '@src/routes/api/getCollections/getCollectionFiles';

// Permissions
import { permissions as configPermissions, setPermissions } from '@src/auth/permissions';
import { PermissionAction, PermissionType } from '@src/auth/permissionTypes';
import type { Permission as AuthPermission } from './types';
import type { PermissionConfig } from './permissionCheck';

// System Logger
import { logger } from '@utils/logger.svelte';

// Centralized and Decentralized Permissions
let decentralizedPermissions: AuthPermission[] = [];

// Function to register decentralized permissions
export function registerDecentralizedPermissions(newPermissions: AuthPermission[]): void {
	try {
		const uniquePermissions = newPermissions.filter((newPermission) => !decentralizedPermissions.some((p) => p._id === newPermission._id));
		decentralizedPermissions = [...decentralizedPermissions, ...uniquePermissions];
		logger.debug(`Registered decentralized permissions: ${JSON.stringify(uniquePermissions)}`);
	} catch (err) {
		const message = `Error in registerDecentralizedPermissions: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { newPermissions });
		throw error(500, message);
	}
}

export function registerPermission(permission: PermissionConfig): void {
	try {
		const newPermission: AuthPermission = {
			_id: permission.contextId,
			name: permission.name,
			action: permission.action,
			type: permission.contextType as PermissionType
		};
		registerDecentralizedPermissions([newPermission]);
	} catch (err) {
		const message = `Error in registerPermission: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { permission });
		throw error(500, message);
	}
}

// Converts a config permission to an auth permission type
function convertToAuthPermission(permission: PermissionConfig): AuthPermission {
	return {
		...permission,
		action: permission.action as PermissionAction
	};
}

// Retrieves a permission by name from the configuration
export async function getPermissionByName(name: string): Promise<AuthPermission | null> {
	try {
		const permission = configPermissions.find((p) => p.name === name) || null;
		if (!permission) {
			logger.warn(`Permission not found: ${name}`);
			return null;
		}
		return convertToAuthPermission(permission);
	} catch (err) {
		const message = `Error in getPermissionByName: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { name });
		throw error(500, message);
	}
}

// Retrieves all permissions from the configuration
export async function getAllPermissions(): Promise<AuthPermission[]> {
	try {
		const centralized = configPermissions.map(convertToAuthPermission);
		const decentralized = decentralizedPermissions.map(convertToAuthPermission);
		const allPermissions = [...centralized, ...decentralized];
		//logger.debug(`All aggregated permissions: ${JSON.stringify(allPermissions)}`);
		return allPermissions;
	} catch (err) {
		const message = `Error in getAllPermissions: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
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
			throw error(404, `Permission ${permissionName} not found`);
		}
		configPermissions[permissionIndex] = { ...configPermissions[permissionIndex], ...permissionData };
		logger.info(`Permission ${permissionName} updated successfully.`);
	} catch (err) {
		const message = `Error in updatePermission: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { permissionName, permissionData });
		throw error(500, message);
	}
}

// Modularized function to sync collection permissions
async function syncCollectionPermissions(collections: string[]): Promise<AuthPermission[]> {
	try {
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
		return permissions;
	} catch (err) {
		const message = `Error in syncCollectionPermissions: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { collections });
		throw error(500, message);
	}
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
	} catch (err) {
		const message = `Error in syncPermissions: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

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
