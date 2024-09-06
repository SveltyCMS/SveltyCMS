/**
 * @file src/auth/permissionManager.ts
 * @description Permission manager for handling file-based permissions.
 *
 * This module provides functionality to:
 * - Read permissions from the configuration file
 * - Validate permissions for users and roles
 *
 * Usage:
 * Utilized by the auth system to manage permissions in a file-based configuration
 */

import fs from 'fs/promises';
import path from 'path';

import { permissions as configPermissions, PermissionAction, PermissionType, setPermissions } from '@root/config/permissions';
import type { Permission as AuthPermission, PermissionAction as AuthPermissionAction } from './types';
import type { PermissionConfig } from './permissionCheck';

// System Logger
import logger from '@src/utils/logger';
import { getCollectionFiles } from '@src/routes/api/getCollections/getCollectionFiles';

// Converts a PermissionAction to AuthPermissionAction
function convertPermissionAction(action: PermissionAction): AuthPermissionAction {
	switch (action) {
		case PermissionAction.CREATE:
			return 'create';
		case PermissionAction.READ:
			return 'read';
		case PermissionAction.UPDATE:
			return 'write';
		case PermissionAction.DELETE:
			return 'delete';
		case PermissionAction.MANAGE:
			return 'manage_roles'; // Adjust if necessary
		default:
			logger.error(`Unsupported action type: ${action}`);
			throw new Error(`Unsupported action: ${action}`);
	}
}

// Converts a config permission to an auth permission type
function convertToAuthPermission(permission: any): AuthPermission {
	return {
		...permission,
		action: convertPermissionAction(permission.action)
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
	return configPermissions.map((permission) => convertToAuthPermission(permission));
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

function isSame(arr: AuthPermission[], arr1: AuthPermission[]) {
	if (arr.length !== arr1.length) {
		return false;
	}
	for (let i = 0; i < arr.length; i++) {
		if (arr1.findIndex((cur) => cur._id === arr[i]._id && cur.name === arr[i].name && cur.action === arr[i].action && cur.type === arr[i].type) === -1) {
			return false;
		}
	}
	return true;
}

export const permissionConfigs: Record<string, PermissionConfig> = {
	collectionbuilder: { contextId: 'config/collectionbuilder', name: 'Collection Builder Management', action: PermissionAction.MANAGE, contextType: 'system' },
	graphql: { contextId: 'config/graphql', name: 'GraphQL Management', action: PermissionAction.MANAGE, contextType: 'system' },
	imageeditor: { contextId: 'config/imageeditor', name: 'ImageEditor Management', action: PermissionAction.MANAGE, contextType: 'system' },
	dashboard: { contextId: 'config/dashboard', name: 'Dashboard Management', action: PermissionAction.MANAGE, contextType: 'system' },
	widgetManagement: { contextId: 'config/widgetManagement', name: 'Widget Management', action: PermissionAction.MANAGE, contextType: 'system' },
	themeManagement: { contextId: 'config/themeManagement', name: 'Theme Management', action: PermissionAction.MANAGE, contextType: 'system' },
	settings: { contextId: 'config/settings', name: 'Settings Management', action: PermissionAction.MANAGE, contextType: 'system' },
	accessManagement: { contextId: 'config/accessManagement', name: 'Access Management', action: PermissionAction.MANAGE, contextType: 'system' }
} as const;

export const userManagementPermissions = [
	{ _id: 'user:manage', name: 'Manage Users', action: PermissionAction.MANAGE, type: PermissionType.USER, description: 'Allows management of users.' }
];

// Synchronizes permissions if needed
export async function syncPermissions(): Promise<void> {
	// Placeholder for sync logic. Add code if the app dynamically updates permissions.
	const configPath = path.resolve('./config/permissions.ts');
	const collections = await getCollectionFiles();
	const configs = Object.values(permissionConfigs).map(cur => ({
		_id: cur.contextId,
		action: cur.action,
		name: cur.name,
		type: PermissionType.CONFIGURATION,
	}));
	const permissions: AuthPermission[] = [
		...configs,
		...userManagementPermissions,
	];
	collections.map((ed) => {
		const cur = ed.slice(0, ed.length - 3);
		permissions.push({
			_id: `${cur}:create`,
			name: `Create ${cur}`,
			action: PermissionAction.CREATE,
			type: PermissionType.COLLECTION,
			description: `Allows creating new ${cur}`
		});
		permissions.push({
			_id: `${cur}:read`,
			name: `Read ${cur}`,
			action: PermissionAction.READ,
			type: PermissionType.COLLECTION,
			description: `Allows reading ${cur}`
		});
		permissions.push({
			_id: `${cur}:update`,
			name: `Update ${cur}`,
			action: PermissionAction.UPDATE,
			type: PermissionType.COLLECTION,
			description: `Allows updating ${cur}`
		});
		permissions.push({
			_id: `${cur}:delete`,
			name: `Delete ${cur}`,
			action: PermissionAction.DELETE,
			type: PermissionType.COLLECTION,
			description: `Allows deleting ${cur}`
		});
	});

	setPermissions(permissions);

	logger.info('Permissions synchronized from configuration');
}
