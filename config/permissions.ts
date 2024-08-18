/**
 * @file config/permissions.ts
 * @description This file defines the data structures and initial values for roles and
 * permissions within the application. It includes TypeScript interfaces for defining
 * permissions and roles, as well as predefined roles and permissions used for access
 * control across different contexts within the system.
 *
 * @imports
 * - PermissionAction: Type imported from `../src/auth/types` representing possible
 *   actions associated with a permission (e.g., create, read, update, delete).
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

export interface Permission {
	name: string;
	action: PermissionAction;
	contextId: string;
	contextType: ContextType;
	description?: string;
	requiredRole: string;
}

export interface Role {
	_id: string; // Unique identifier for the role
	name: string;
	description?: string;
	permissions: string[];
}

export const roles: Role[] = [
	{
		_id: '1',
		name: 'admin',
		description: 'Administrator with all permissions',
		permissions: [
			'create_content',
			'read_content',
			'update_content',
			'delete_content',
			'manage_users',
			'manage_roles',
			'manage_permissions',
			'access_admin_area'
		]
	},
	{
		_id: '2',
		name: 'developer',
		description: 'Developer with elevated permissions',
		permissions: ['create_content', 'read_content', 'update_content', 'delete_content']
	},
	{
		_id: '3',
		name: 'editor',
		description: 'Content editor with permissions to create, read, and update content',
		permissions: ['create_content', 'read_content', 'update_content']
	},
	{
		_id: '4',
		name: 'user',
		description: 'Regular user with permission to read content',
		permissions: ['read_content']
	}
];

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
	}
];
