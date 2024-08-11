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

	// Fetch all roles and permissions after creation
	const allRoles = await adapter.getAllRoles();
	const allPermissions = await adapter.getAllPermissions();

	logger.debug(`All roles: ${JSON.stringify(allRoles)}`);
	logger.debug(`All permissions: ${JSON.stringify(allPermissions)}`);

	// Assign permissions to roles
	const rolePermissions = {
		admin: allPermissions.map((p) => p._id!),
		developer: allPermissions.filter((p) => p.name !== 'manage_roles' && p.name !== 'manage_permissions').map((p) => p._id!),
		editor: allPermissions.filter((p) => ['create_content', 'read_content', 'update_content'].includes(p.name!)).map((p) => p._id!),
		user: allPermissions.filter((p) => ['read_content'].includes(p.name!)).map((p) => p._id!)
	};

	for (const role of allRoles) {
		const permissions = rolePermissions[role.name as keyof typeof rolePermissions] || [];
		for (const permissionId of permissions) {
			await adapter.assignPermissionToRole(role._id!, permissionId, 'system');
			logger.debug(`Assigned permission ${permissionId} to role ${role.name}`);
		}
		logger.info(`Permissions assigned to ${role.name} role`);
	}

	// Verify permissions assignment
	for (const role of allRoles) {
		const roleWithPermissions = await adapter.getRoleByName(role.name);
		if (roleWithPermissions && roleWithPermissions.permissions) {
			logger.info(`${role.name} role has ${roleWithPermissions.permissions.length} permissions: ${JSON.stringify(roleWithPermissions.permissions)}`);
		} else {
			logger.warn(`${role.name} role has no permissions or couldn't be retrieved`);
		}
	}
}
