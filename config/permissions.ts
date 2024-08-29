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
export const permissions: Permission[] = [
	{
		_id: 'collection:create', // Changed from id to _id to match the Permission type definition
		name: 'Create Collection',
		action: PermissionAction.CREATE,
		type: PermissionType.COLLECTION,
		description: 'Allows creating new collections.'
	},
	{
		_id: 'collection:read',
		name: 'Read Collection',
		action: PermissionAction.READ,
		type: PermissionType.COLLECTION,
		description: 'Allows reading collections.'
	},
	{
		_id: 'collection:update',
		name: 'Update Collection',
		action: PermissionAction.UPDATE,
		type: PermissionType.COLLECTION,
		description: 'Allows updating collections.'
	},
	{
		_id: 'collection:delete',
		name: 'Delete Collection',
		action: PermissionAction.DELETE,
		type: PermissionType.COLLECTION,
		description: 'Allows deleting collections.'
	},
	{
		_id: 'user:manage',
		name: 'Manage Users',
		action: PermissionAction.MANAGE,
		type: PermissionType.USER,
		description: 'Allows managing users.'
	}
	// Add more permissions as needed
];

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
