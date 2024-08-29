/**
 * @file config/roles.ts
 * @description Configuration prompts for the Roles section
 */

import type { Role } from '@src/auth/types'; // Import Role type from the centralized types file
import { permissions } from './permissions'; // Import the permissions list

// List of roles with their associated permissions
export const roles: Role[] = [
	{
		_id: 'admin', // Changed from id to _id to match the Role type definition
		name: 'Administrator',
		description: 'Full access to all system features',
		permissions: new Set(permissions.map((p) => p._id)) // Admin gets all permissions, using _id as the identifier
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Can create, read, and update content',
		permissions: new Set(['collection:create', 'collection:read', 'collection:update'])
	},
	{
		_id: 'user',
		name: 'User',
		description: 'Can only read content',
		permissions: new Set(['collection:read'])
	}
	// Add more roles as needed
];

// Function to register a new role
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id); // Use _id for consistency
	if (!exists) {
		roles.push(newRole);
	}
}

// Function to register multiple roles
export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}
