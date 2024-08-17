/**
 * @file <filename>
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
	name: string;
	description?: string;
	permissions: string[];
}

export const roles: Role[] = [
	{
		name: 'admin',
		description: 'Administrator with all permissions',
		permissions: ['all']
	},
	{
		name: 'developer',
		description: 'Developer with elevated permissions',
		permissions: ['create_content', 'read_content', 'update_content', 'delete_content']
	},
	{
		name: 'editor',
		description: 'Content editor',
		permissions: ['create_content', 'read_content', 'update_content']
	},
	{
		name: 'user',
		description: 'Regular user',
		permissions: ['read_content']
	}
];

export const permissions: Permission[] = [
	{
		name: 'create_content',
		action: 'create',
		contextId: 'global',
		contextType: 'collection',
		description: 'Create new content',
		requiredRole: 'user'
	},
	{
		name: 'read_content',
		action: 'read',
		contextId: 'global',
		contextType: 'collection',
		description: 'Read content',
		requiredRole: 'user'
	},
	{
		name: 'update_content',
		action: 'write',
		contextId: 'global',
		contextType: 'collection',
		description: 'Update existing content',
		requiredRole: 'editor'
	},
	{
		name: 'delete_content',
		action: 'delete',
		contextId: 'global',
		contextType: 'collection',
		description: 'Delete content',
		requiredRole: 'admin'
	},
	{
		name: 'manage_users',
		action: 'manage_roles',
		contextId: 'global',
		contextType: 'system',
		description: 'Manage users',
		requiredRole: 'admin'
	},
	{
		name: 'manage_roles',
		action: 'manage_roles',
		contextId: 'global',
		contextType: 'system',
		description: 'Manage roles',
		requiredRole: 'admin'
	},
	{
		name: 'manage_permissions',
		action: 'manage_permissions',
		contextId: 'global',
		contextType: 'system',
		description: 'Manage permissions',
		requiredRole: 'admin'
	}
];
