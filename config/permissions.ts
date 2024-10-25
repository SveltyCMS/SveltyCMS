/**
 * @file config/permissions.ts
 * @description Configuration prompts for the Permissions section
 */

import type { Permission } from '@src/auth/types'; // Import Permission type from the centralized types file


// List of all permissions available in the CMS
export let permissions: Permission[] = [];

// Function to register new permissions, ensuring only unique permissions are added
export function setPermissions(newPermissions: Permission[]): void {
	const uniquePermissions = newPermissions.filter(
		(newPermission) => !permissions.some((existingPermission) => existingPermission._id === newPermission._id)
	);
	permissions = [...permissions, ...uniquePermissions];
}
