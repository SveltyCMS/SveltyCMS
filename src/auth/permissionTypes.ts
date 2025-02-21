/**
 * @file: src/auth/permissionTypes.ts
 * @description: Type definitions and utility functions for the permissions system.
 *
 * This module defines types, interfaces, and helper functions for:
 * - Permission types and actions
 */

// Enum representing permission types
export enum PermissionType {
	COLLECTION = 'collection', // Collection-related permissions
	USER = 'user', // User-related permissions
	CONFIGURATION = 'configuration', // Configuration-related permissions
	SYSTEM = 'system' // System-wide permissions
}

// Enum representing permission actions
export enum PermissionAction {
	CREATE = 'create', // Grants the ability to create a new resource or record.
	READ = 'read', // Grants the ability to read or view a resource or record.
	UPDATE = 'update', // Grants the ability to modify or update an existing resource or record.
	DELETE = 'delete', // Grants the ability to remove or delete a resource or record.
	MANAGE = 'manage', // Grants overarching control over a resource or area, typically used for admin purposes.
	SHARE = 'share', // Grants the ability to share a resource or record with others, typically used for collaboration.
	ACCESS = 'access', // Grants basic access to a resource or area, typically used for admin purposes.
	EXECUTE = 'execute' // Grants the ability to execute a command or function, typically used for admin purposes.
}

export interface PermissionConfig {
	contextId: string; // Unique identifier for the context in which the permission is used
	name: string; // Display name of the permission
	action: PermissionAction; // Action associated with the permission (e.g., create, read, update, delete)
	contextType: ContextType | string; 	// Type of context, e.g., "system", "collection"
	requiredRole?: string; // Role required to use this permission, e.g., "admin", "user"
	description?: string; // Optional description for the permission
}
