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

import { permissions as configPermissions, PermissionAction } from '@root/config/permissions';
import type { Permission as AuthPermission, PermissionAction as AuthPermissionAction } from './types';

// System Logger
import logger from '@src/utils/logger';

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

// Synchronizes permissions if needed
export function syncPermissions(): void {
	// Placeholder for sync logic. Add code if the app dynamically updates permissions.
	logger.info('Permissions synchronized from configuration');
}
