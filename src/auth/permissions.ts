/**
 * @file src/auth/permissions.ts
 * @description Permission utilities and checking functions
 *
 * This file contains utility functions for permission checking and management
 * that work with the simplified authentication system.
 */

// System Logger
import { logger } from '@utils/logger.svelte';

// Auth
import type { User, Permission } from './types';
import { corePermissions } from './corePermissions';
import { roles } from '@root/config/roles';

// Permission registry for dynamic permissions
const permissionRegistry = new Map<string, Permission>();

// Initialize with core permissions
corePermissions.forEach((permission) => {
	permissionRegistry.set(permission._id, permission);
});

// Register a new permission
export function registerPermission(permission: Permission): void {
	permissionRegistry.set(permission._id, permission);
	logger.debug(`Permission registered: ${permission._id}`);
}

// Get all registered permissions
export function getAllPermissions(): Permission[] {
	return Array.from(permissionRegistry.values());
}

// Get a permission by ID
export function getPermissionById(permissionId: string): Permission | undefined {
	return permissionRegistry.get(permissionId);
}

// Check if a user has a specific permission
export function hasPermission(user: User, permissionId: string): boolean {
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) {
		logger.warn(`Role not found for user: ${user.email}`);
		return false;
	}

	// ADMIN OVERRIDE: Admins automatically have ALL permissions
	if (userRole.isAdmin) {
		logger.debug(`Admin user ${user.email} granted permission: ${permissionId}`);
		return true;
	}

	// Check if user's role has the specific permission
	const hasPermission = userRole.permissions.includes(permissionId);
	logger.debug(`Permission ${permissionId} ${hasPermission ? 'granted' : 'denied'} for user: ${user.email}`);
	return hasPermission;
}

// Check if a user has permission by action and type
export function hasPermissionByAction(user: User, action: string, type: string, contextId?: string): boolean {
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) return false;

	// ADMIN OVERRIDE: Admins automatically have ALL permissions
	if (userRole.isAdmin) {
		logger.debug(`Admin user ${user.email} granted permission for action: ${action}, type: ${type}`);
		return true;
	}

	// Find matching permission
	const permission = Array.from(permissionRegistry.values()).find(
		(p) => p.action === action && p.type === type && (!contextId || p.contextId === contextId)
	);

	if (!permission) return false;

	return userRole.permissions.includes(permission._id);
}

// Get permissions for a specific role
export function getRolePermissions(roleId: string): string[] {
	const role = roles.find((r) => r._id === roleId);
	return role?.permissions || [];
}

// Check if a role is admin
export function isAdminRole(roleId: string): boolean {
	const role = roles.find((r) => r._id === roleId);
	return role?.isAdmin === true;
}

// Get all roles
export function getAllRoles() {
	return roles;
}

// Legacy permission config compatibility - maps old config keys to new permission IDs
export function getPermissionConfig(configKey: string) {
	const configMap: Record<string, string> = {
		collectionManagement: 'config:collectionManagement',
		collectionbuilder: 'config:collectionbuilder',
		graphql: 'config:graphql',
		imageeditor: 'config:imageeditor',
		dashboard: 'config:dashboard',
		widgetManagement: 'config:widgetManagement',
		themeManagement: 'config:themeManagement',
		settings: 'config:settings',
		accessManagement: 'config:accessManagement',
		adminAccess: 'admin:access',
		emailPreviews: 'config:emailPreviews',
		adminAreaPermissionConfig: 'config:adminArea',
		exportData: 'api:exportData',
		apiUser: 'api:user',
		userCreateToken: 'user.create'
	};

	const permissionId = configMap[configKey];
	if (!permissionId) {
		logger.warn(`Unknown permission config key: ${configKey}`);
		return null;
	}

	const permission = getPermissionById(permissionId);
	if (!permission) {
		logger.warn(`Permission not found for ID: ${permissionId}`);
		return null;
	}

	return {
		contextId: permission.contextId || permissionId,
		name: permission.name,
		action: permission.action,
		contextType: permission.type,
		description: permission.description
	};
}
