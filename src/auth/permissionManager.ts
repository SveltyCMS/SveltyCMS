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

import { permissions as configPermissions, PermissionAction, PermissionType } from '@root/config/permissions';
import type { Permission as AuthPermission, PermissionAction as AuthPermissionAction } from './types';

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
		if (arr1.findIndex(cur => cur._id === arr[i]._id) === -1) {
			return false;
		}
	}
	return true;
}

// Synchronizes permissions if needed
export async function syncPermissions(): Promise<void> {
	// Placeholder for sync logic. Add code if the app dynamically updates permissions.
	const configPath = path.resolve('./config/permissions.ts');
	const collections = await getCollectionFiles();
	const permissions: AuthPermission[] = [
		{
			_id: 'config:collectionbuilder',
			name: 'Access Collection Builder',
			action: PermissionAction.READ,
			type: PermissionType.CONFIGURATION,
			description: 'Allows access to the collection builder.'
		},
		{
			_id: 'config:graphql',
			name: 'Access GraphQL',
			action: PermissionAction.READ,
			type: PermissionType.CONFIGURATION,
			description: 'Allows access to GraphQL settings.'
		},
		{
			_id: 'config:imageeditor',
			name: 'Use Image Editor',
			action: PermissionAction.UPDATE,
			type: PermissionType.CONFIGURATION,
			description: 'Allows using the image editor.'
		},
		{
			_id: 'config:widgetManagement',
			name: 'Manage Widgets',
			action: PermissionAction.UPDATE,
			type: PermissionType.CONFIGURATION,
			description: 'Allows management of widgets.'
		},
		{
			_id: 'config:themeManagement',
			name: 'Manage Themes',
			action: PermissionAction.UPDATE,
			type: PermissionType.CONFIGURATION,
			description: 'Allows managing themes.'
		},
		{
			_id: 'config:settings',
			name: 'Manage Settings',
			action: PermissionAction.UPDATE,
			type: PermissionType.CONFIGURATION,
			description: 'Allows managing system settings.'
		},
		{
			_id: 'config:accessManagement',
			name: 'Manage Access',
			action: PermissionAction.UPDATE,
			type: PermissionType.CONFIGURATION,
			description: 'Allows managing user access and roles.'
		},
		{
			_id: 'config:dashboard',
			name: 'Access Dashboard',
			action: PermissionAction.READ,
			type: PermissionType.CONFIGURATION,
			description: 'Allows access to the dashboard.'
		},
		{
			_id: 'user:manage',
			name: 'Manage Users',
			action: PermissionAction.MANAGE,
			type: PermissionType.USER,
			description: 'Allows managing users.'
		}];
	collections.map(ed => {
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
	})
	if (isSame(configPermissions, permissions)) {
		return;
	}
	const content = `
/**
 * @file config/permissions.ts
 * @description Configuration prompts for the Permissions section
 */

import type { Permission } from '@src/auth/types'; // Import Permission type from the centralized types file

export enum PermissionType {
	COLLECTION = 'collection',
	USER = 'user',
	CONFIGURATION = 'configuration',
	SYSTEM = 'system'
	// Add more types as needed
}

export enum PermissionAction {
	CREATE = 'create',
	READ = 'read',
	UPDATE = 'update',
	DELETE = 'delete',
	MANAGE = 'manage'
	// Add more actions as needed
}

// List of all permissions available in the CMS

export const permissions: Permission[] = ${JSON.stringify([...permissions.values()], null, 2)};
// Function to register new permissions
export function registerPermission(newPermission: Permission): void {
	const exists = permissions.some((permission) => permission._id === newPermission._id); // Use _id for consistency
	if (!exists) {
		permissions.push(newPermission);
	}
}

// Function to register multiple permissions
export function registerPermissions(newPermissions: Permission[]): void {
	newPermissions.forEach(registerPermission);
}

`;
	try {
		await fs.writeFile(configPath, content, 'utf8');
		logger.info('Config file updated with new roles and permissions');
	} catch (error) {
		logger.error(`Failed to update config file: ${(error as Error).message}`);
		throw new Error('Failed to update config file');
	}
	logger.info('Permissions synchronized from configuration');
}
