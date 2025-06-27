/**
 * @file config/roles.ts
 * @description  Role configuration file
 */

import { getAllPermissions } from '../src/auth/permissions.js';
import type { Role } from '../src/auth/types';

const permissions = getAllPermissions();

export const roles: Role[] = [
	{
		_id: 'admin',
		name: 'Administrator',
		description: 'Administrator - Full access to all system features',
		isAdmin: true,
		permissions: permissions.map((p) => p._id), // All permissions,
		icon: 'material-symbols:verified-outline',
		color: 'gradient-primary'
	},
	{
		_id: 'developer',
		name: 'Developer',
		description: 'Developer Role - Can access some system features',
		permissions: ['system:dashboard', 'api:graphql', 'api:collections', 'api:export', 'api:systemInfo', 'collections:read', 'content:builder'],
		icon: 'material-symbols:code',
		color: 'gradient-pink'
	},
	{
		_id: 'editor',
		name: 'Editor',
		description: 'Editor Role - Collection Permissions',
		permissions: [
			'collections:read',
			'collections:update',
			'collections:create',
			'content:editor',
			'content:images',
			'system:dashboard',
			'api:systemInfo'
		],
		icon: 'material-symbols:edit',
		color: 'gradient-tertiary'
	},
	{
		_id: 'user',
		name: 'User',
		description: 'User Role - No Permissions',
		permissions: [],
		icon: 'material-symbols:person',
		color: 'gradient-secondary'
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
