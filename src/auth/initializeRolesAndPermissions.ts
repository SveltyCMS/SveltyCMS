/**
 * @file src/auth/initializeRolesAndPermissions.ts
 * @description Module for initializing default roles and permissions.
 *
 * This module provides functionality to:
 * - Create default roles (admin, developer, editor, user)
 * - Create default permissions
 * - Assign permissions to roles
 *
 * Features:
 * - Automated setup of initial auth structure
 * - Customizable default roles and permissions
 * - Idempotent initialization process
 *
 * Usage:
 * Called during application setup to ensure basic auth structure is in place
 */

import type { Role, Permission, PermissionAction, ContextType } from './types';
import type { authDBInterface } from './authDBInterface';

// System Logger
import logger from '@src/utils/logger';

export async function initializeDefaultRolesAndPermissions(adapter: authDBInterface): Promise<void> {
	// Default Roles
	const defaultRoles: Partial<Role>[] = [
		{ name: 'admin', description: 'Administrator with all permissions' },
		{ name: 'developer', description: 'Developer with elevated permissions' },
		{ name: 'editor', description: 'Content editor' },
		{ name: 'user', description: 'Regular user' }
	];

	// Default Permissions
	const defaultPermissions: Partial<Permission>[] = [
		{
			name: 'create_content',
			action: 'create' as PermissionAction,
			contextId: 'global',
			contextType: 'collection' as ContextType,
			description: 'Create new content',
			requiredRole: 'user'
		},
		{
			name: 'read_content',
			action: 'read' as PermissionAction,
			contextId: 'global',
			contextType: 'collection' as ContextType,
			description: 'Read content',
			requiredRole: 'user'
		},
		{
			name: 'update_content',
			action: 'write' as PermissionAction,
			contextId: 'global',
			contextType: 'collection' as ContextType,
			description: 'Update existing content',
			requiredRole: 'editor'
		},
		{
			name: 'delete_content',
			action: 'delete' as PermissionAction,
			contextId: 'global',
			contextType: 'collection' as ContextType,
			description: 'Delete content',
			requiredRole: 'admin'
		},
		{
			name: 'manage_users',
			action: 'manage_roles' as PermissionAction,
			contextId: 'global',
			contextType: 'system' as ContextType,
			description: 'Manage users',
			requiredRole: 'admin'
		},
		{
			name: 'manage_roles',
			action: 'manage_roles' as PermissionAction,
			contextId: 'global',
			contextType: 'system' as ContextType,
			description: 'Manage roles',
			requiredRole: 'admin'
		},
		{
			name: 'manage_permissions',
			action: 'manage_permissions' as PermissionAction,
			contextId: 'global',
			contextType: 'system' as ContextType,
			description: 'Manage permissions',
			requiredRole: 'admin'
		}
	];

	// Create default roles
	for (const roleData of defaultRoles) {
		const existingRole = await adapter.getRoleByName(roleData.name!);
		if (!existingRole) {
			await adapter.createRole(roleData, 'system');
			logger.debug(`Default role created: ${roleData.name}`);
		}
	}

	// Create default permissions
	for (const permissionData of defaultPermissions) {
		const existingPermission = await adapter.getPermissionByName(permissionData.name!);
		if (!existingPermission) {
			await adapter.createPermission(permissionData, 'system');
			logger.debug(`Default permission created: ${permissionData.name}`);
		}
	}

	// Assign all permissions to admin role
	const adminRole = await adapter.getRoleByName('admin');
	const allPermissions = await adapter.getAllPermissions();
	if (adminRole) {
		for (const permission of allPermissions) {
			await adapter.assignPermissionToRole(adminRole._id!, permission._id!, 'system');
		}
		logger.info('All permissions assigned to admin role');
	}

	// Assign appropriate permissions to other roles
	const developerRole = await adapter.getRoleByName('developer');
	const editorRole = await adapter.getRoleByName('editor');
	const userRole = await adapter.getRoleByName('user');

	if (developerRole) {
		const developerPermissions = allPermissions.filter((p) => p.name !== 'manage_roles' && p.name !== 'manage_permissions');
		for (const permission of developerPermissions) {
			await adapter.assignPermissionToRole(developerRole._id!, permission._id!, 'system');
		}
		logger.info('Permissions assigned to developer role');
	}

	if (editorRole) {
		const editorPermissions = allPermissions.filter((p) => ['create_content', 'read_content', 'update_content'].includes(p.name!));
		for (const permission of editorPermissions) {
			await adapter.assignPermissionToRole(editorRole._id!, permission._id!, 'system');
		}
		logger.info('Permissions assigned to editor role');
	}

	if (userRole) {
		const userPermissions = allPermissions.filter((p) => ['read_content'].includes(p.name!));
		for (const permission of userPermissions) {
			await adapter.assignPermissionToRole(userRole._id!, permission._id!, 'system');
		}
		logger.info('Permissions assigned to user role');
	}
}
