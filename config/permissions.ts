/**
 * @file config/permissions.ts
 * @description Configuration prompts for the Permissions section
 */

import type { Permission } from '@src/auth/types'; // Import Permission type from the centralized types file

// Used to categorize permissions based on the type of resource or area they apply to
export enum PermissionType {
	COLLECTION = 'collection', // Collection-related permissions
	USER = 'user', // User-related permissions
	CONFIGURATION = 'configuration', // Configuration-related permissions
	SYSTEM = 'system' // System-wide permissions
}

// Define the various actions that can be associated with permissions.
// These actions represent the operations that users can perform on a resource.
export enum PermissionAction {
	CREATE = 'create', // Grants the ability to create a new resource or record.
	READ = 'read', // Grants the ability to read or view a resource or record.
	UPDATE = 'update', // Grants the ability to modify or update an existing resource or record.
	DELETE = 'delete', // Grants the ability to remove or delete a resource or record.
	MANAGE = 'manage', // Grants overarching control over a resource or area, typically used for admin purposes.
	SHARE = 'share', // Grants the ability to share a resource or record with others, typically used for collaboration.
	ACCESS = 'access' // Grants basic access to a resource or area, typically used for admin purposes.
}

// List of all permissions available in the CMS
export let permissions: Permission[] = [];

// Function to register new permissions, ensuring only unique permissions are added
export function setPermissions(newPermissions: Permission[]): void {
	const uniquePermissions = newPermissions.filter(
		(newPermission) => !permissions.some((existingPermission) => existingPermission._id === newPermission._id)
	);
	permissions = [...permissions, ...uniquePermissions];
}
