/**
 * @file config/permissions.ts
 * @description This file defines the data structures and initial values for roles and
 * permissions within the application. It includes TypeScript interfaces for defining
 * permissions and roles, as well as predefined roles and permissions used for access
 * control across different contexts within the system.
 *
 * @imports
 * - PermissionAction: Type imported from `../src/auth/types` representing possible
 *   actions associated with a permission (e.g., create, read, update, delete, manage_roles, manage_permissions).
 * - ContextType: Type imported from `../src/auth/types` representing the context
 *   in which a permission applies (e.g., collection, system).
 *
 * @interfaces
 * - Permission: Interface defining the structure of a permission object, which includes
 *   properties such as name, action, contextId, contextType, description, and requiredRole.
 * - Role: Interface defining the structure of a role object, which includes properties
 *   such as name, description, and a list of permissions associated with the role.
 *
 * @constants
 * - roles: An array of predefined roles within the system, each associated with a set
 *   of permissions. Examples include 'admin', 'developer', 'editor', and 'user'.
 * - permissions: An array of predefined permissions that define what actions can be
 *   performed in specific contexts. Examples include 'create_content', 'read_content',
 *   'update_content', 'delete_content', and system management permissions like
 *   'manage_users', 'manage_roles', and 'manage_permissions'.
 */

import type { PermissionAction, ContextType } from '../src/auth/types';

/**
 * @interface Permission
 * Represents the structure of a permission object.
 */
export interface Permission {
	name: string; // Unique name of the permission
	action: PermissionAction; // Action associated with the permission (e.g., create, read)
	contextId: string; // ID of the context where this permission applies
	contextType: ContextType; // Type of context (e.g., collection, system)
	description?: string; // Optional description of the permission
	requiredRole: string; // Role required to have this permission
}

/**
 * @interface Role
 * Represents the structure of a role object.
 */
export interface Role {
	name: string; // Name of the role
	description?: string; // Optional description of the role
	permissions: string[]; // List of permission names associated with the role
}

/**
 * @constant permissions
 * Predefined permissions available in the system.
 */
export const permissions: Permission[] = [
	{
		name: 'create_content',
		action: 'create',
		contextId: 'global',
		contextType: 'collection',
		description: 'Permission to create new content',
		requiredRole: 'user'
	},
	{
		name: 'read_content',
		action: 'read',
		contextId: 'global',
		contextType: 'collection',
		description: 'Permission to read content',
		requiredRole: 'user'
	},
	{
		name: 'update_content',
		action: 'write',
		contextId: 'global',
		contextType: 'collection',
		description: 'Permission to update existing content',
		requiredRole: 'editor'
	},
	{
		name: 'delete_content',
		action: 'delete',
		contextId: 'global',
		contextType: 'collection',
		description: 'Permission to delete content',
		requiredRole: 'admin'
	},
	{
		name: 'manage_users',
		action: 'manage_roles',
		contextId: 'global',
		contextType: 'system',
		description: 'Permission to manage users in the system',
		requiredRole: 'admin'
	},
	{
		name: 'manage_roles',
		action: 'manage_roles',
		contextId: 'global',
		contextType: 'system',
		description: 'Permission to manage roles in the system',
		requiredRole: 'admin'
	},
	{
		name: 'manage_permissions',
		action: 'manage_permissions',
		contextId: 'global',
		contextType: 'system',
		description: 'Permission to manage permissions in the system',
		requiredRole: 'admin'
	},
	{
		name: 'access_admin_area',
		action: 'read',
		contextId: 'admin',
		contextType: 'system',
		description: 'Permission to access the admin area',
		requiredRole: 'admin'
	}
];

/**
 * @constant roles
 * Predefined roles within the system, each associated with a set of permissions.
 */
export const roles: Role[] = [
	{
		name: 'admin',
		description: 'Administrator with all permissions',
		permissions: permissions.map((permission) => permission.name) // Assign all permissions
	},
	{
		name: 'developer',
		description: 'Developer with elevated permissions',
		permissions: permissions
			.filter((permission) => ['create_content', 'read_content', 'update_content', 'delete_content'].includes(permission.name))
			.map((permission) => permission.name) // Assign relevant permissions
	},
	{
		name: 'editor',
		description: 'Content editor with permissions to create, read, and update content',
		permissions: permissions
			.filter((permission) => ['create_content', 'read_content', 'update_content'].includes(permission.name))
			.map((permission) => permission.name) // Assign relevant permissions
	},
	{
		name: 'user',
		description: 'Regular user with permission to read content',
		permissions: ['read_content'] // Assign only the read_content permission
	}
];
