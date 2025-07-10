/**
 * @file config/roles.ts
 * @description Role configuration file (SSR-compatible)
 */

import { getAllPermissions } from '../src/auth/permissions.js';
import type { Role } from '../src/auth/types';

// Mutable exported roles array (will be initialized once)
export let roles: Role[] = [];

// One-time initializer function
export async function initializeRoles(): Promise<void> {
	if (roles.length > 0) return; // Already initialized

	const permissions = getAllPermissions(); // ✅ Make sure it's synchronous

	roles = [
		{
			_id: 'admin',
			name: 'Administrator',
			description: 'Administrator - Full access to all system features',
			isAdmin: true,
			permissions: permissions.map((p) => p._id),
			icon: 'material-symbols:verified-outline',
			color: 'gradient-primary'
		},
		{
			_id: 'developer',
			name: 'Developer',
			description: 'Developer Role - Can access some system features',
			permissions: [
				'system:dashboard',
				'api:graphql',
				'api:collections',
				'api:export',
				'api:systemInfo',
				'api:user',
				'api:userActivity',
				'api:media',
				'collections:read',
				'content:builder'
			],
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
				'api:systemInfo',
				'api:user',
				'api:userActivity',
				'api:media'
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
			color: 'gradient-secondary',
			isDefault: true // ✅ Required for fallback logic
		}
	];
}

// Utility to register a new role dynamically
export function registerRole(newRole: Role): void {
	const exists = roles.some((role) => role._id === newRole._id);
	if (!exists) {
		roles.push(newRole);
	}
}

export function registerRoles(newRoles: Role[]): void {
	newRoles.forEach(registerRole);
}
