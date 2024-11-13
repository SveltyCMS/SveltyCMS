/**
 * @file config/roles.ts
 * @description Roles with Permission configuration
 *
 */

import type { Role } from '../src/auth/types';
import { permissions } from '../src/auth/permissions';

export const roles: Role[] = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Administrator - Full access to all system features',
		isAdmin: true,
		permissions: permissions.map((p) => p._id), // All permissions
		icon: 'material-symbols:verified-outline', // Icon for the admin role
		color: 'gradient-primary' // Color for the admin role
	},
	{
		_id: 'developer',
		name: 'Developer',
		description: 'Developer Role - No Permissions',
		permissions: [], // No permissions
		icon: 'material-symbols:code', // Icon for developer role
		color: 'gradient-pink' // Color for the developer role
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Editor Role - No Permissions',
		permissions: [], // No permissions
		icon: 'material-symbols:edit', // Icon for editor role
		color: 'gradient-tertiary' // Color for the editor role
	},
	{
		_id: 'user',
		name: 'User',
		description: 'User Role - No Permissions',
		permissions: [], // No permissions
		icon: 'material-symbols:person', // Icon for user role
		color: 'gradient-secondary' // Color for the user role
	}
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
