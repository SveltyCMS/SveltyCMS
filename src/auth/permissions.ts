/**
 * @file src/auth/permissions.ts
 * @description Core permissions management for the auth system
 */

import type { Permission } from './types'; // Updated import path

// List of all permissions available in the CMS
export let permissions: Permission[] = [];

// Function to register new permissions, ensuring only unique permissions are added
export function setPermissions(newPermissions: Permission[]): void {
	const uniquePermissions = newPermissions.filter(
		(newPermission) => !permissions.some((existingPermission) => existingPermission._id === newPermission._id)
	);
	permissions = [...permissions, ...uniquePermissions];
}
