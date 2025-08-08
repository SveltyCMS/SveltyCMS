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
import type { User, Permission, Role } from './types';
import { corePermissions } from './corePermissions';

export interface PermissionConfig {
	contextId: string;
	name: string;
	action: string;
	contextType: string;
	description: string;
}

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

// Check if a user has a specific permission (with roles parameter to avoid circular dependency)
export function hasPermissionWithRoles(user: User, permissionId: string, roles: Role[]): boolean {
	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) {
		logger.warn('Role not found for user', { email: user.email });
		return false;
	}

	// ADMIN OVERRIDE: Admins automatically have ALL permissions
	if (userRole.isAdmin) {
		logger.debug('Admin user granted permission', { email: user.email, permissionId });
		return true;
	}

	// Check if user's role has the specific permission
	const hasPermission = userRole.permissions.includes(permissionId);
	logger.debug('Permission check for user', { permissionId, granted: hasPermission, email: user.email });
	return hasPermission;
}

// Check if a user has permission by action and type
export function hasPermissionByAction(user: User, action: string, type: string, contextId?: string, userRoles?: Role[]): boolean {
	let roles: Role[] = userRoles || []; // If no roles provided, try to get them from a global location
	if (!userRoles) {
		try {
			// Try to access roles from a different location
			if (typeof globalThis !== 'undefined' && (globalThis as unknown as { __ROLES_CACHE__?: Role[] }).__ROLES_CACHE__) {
				roles = (globalThis as unknown as { __ROLES_CACHE__: Role[] }).__ROLES_CACHE__;
			} else {
				// Last resort - empty array
				logger.warn('No roles available for permission check - defaulting to deny');
				return false;
			}
		} catch (error: unknown) {
			logger.error('Failed to load roles for hasPermissionByAction:', error);
			return false;
		}
	}

	const userRole = roles.find((role) => role._id === user.role);
	if (!userRole) return false;

	// ADMIN OVERRIDE: Admins automatically have ALL permissions
	if (userRole.isAdmin) {
		logger.debug('Admin user granted permission for action', { email: user.email, action, type });
		return true;
	}

	// Find matching permission
	const permission = Array.from(permissionRegistry.values()).find(
		(p) => p.action === action && p.type === type && (!contextId || p.contextId === contextId)
	);

	if (!permission) return false;

	return userRole.permissions.includes(permission._id);
}

// Get permissions for a specific role (with roles parameter)
export function getRolePermissionsWithRoles(roleId: string, roles: Role[]): string[] {
	const role = roles.find((r) => r._id === roleId);
	return role?.permissions || [];
}

// Check if a role is admin (with roles parameter)
export function isAdminRoleWithRoles(roleId: string, roles: Role[]): boolean {
	const role = roles.find((r) => r._id === roleId);
	return role?.isAdmin === true;
}

// Legacy permission config compatibility - maps old config keys to new permission IDs
export function getPermissionConfig(configKey: string): PermissionConfig | null {
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
		logger.warn('Unknown permission config key', { configKey });
		return null;
	}

	const permission = getPermissionById(permissionId);
	if (!permission) {
		logger.warn('Permission not found for ID', { permissionId });
		return null;
	}

	return {
		contextId: permission.contextId || permissionId,
		name: permission.name,
		action: permission.action,
		contextType: permission.type || '',
		description: permission.description
	};
}

// Validate user permission from locals.permissions array
export function validateUserPermission(userPermissions: string[] | undefined, requiredPermission: string): boolean {
	if (!userPermissions) {
		logger.warn('No user permissions provided for validation', { requiredPermission });
		return false;
	}

	const hasPermission = userPermissions.includes(requiredPermission);
	logger.debug('User permission validation', { requiredPermission, granted: hasPermission });
	return hasPermission;
}

// Legacy config map for compatibility
export const permissionConfigs: Record<string, { contextId: string; action: string; type: string; name: string; description: string }> = {
	collectionManagement: {
		contextId: 'config:collectionManagement',
		action: 'read',
		type: 'config',
		name: 'Collection Management',
		description: 'Access to collection management'
	},
	collectionbuilder: {
		contextId: 'config:collectionbuilder',
		action: 'read',
		type: 'config',
		name: 'Collection Builder',
		description: 'Access to collection builder'
	},
	graphql: { contextId: 'config:graphql', action: 'read', type: 'config', name: 'GraphQL', description: 'Access to GraphQL interface' },
	imageeditor: { contextId: 'config:imageeditor', action: 'read', type: 'config', name: 'Image Editor', description: 'Access to image editor' },
	dashboard: { contextId: 'config:dashboard', action: 'read', type: 'config', name: 'Dashboard', description: 'Access to dashboard' },
	widgetManagement: {
		contextId: 'config:widgetManagement',
		action: 'read',
		type: 'config',
		name: 'Widget Management',
		description: 'Access to widget management'
	},
	themeManagement: {
		contextId: 'config:themeManagement',
		action: 'read',
		type: 'config',
		name: 'Theme Management',
		description: 'Access to theme management'
	},
	settings: { contextId: 'config:settings', action: 'read', type: 'config', name: 'Settings', description: 'Access to settings' },
	accessManagement: {
		contextId: 'config:accessManagement',
		action: 'read',
		type: 'config',
		name: 'Access Management',
		description: 'Access to user management'
	},
	adminAccess: { contextId: 'admin:access', action: 'read', type: 'admin', name: 'Admin Access', description: 'Administrative access' },
	emailPreviews: {
		contextId: 'config:emailPreviews',
		action: 'read',
		type: 'config',
		name: 'Email Previews',
		description: 'Access to email previews'
	},
	adminAreaPermissionConfig: {
		contextId: 'config:adminArea',
		action: 'read',
		type: 'config',
		name: 'Admin Area',
		description: 'Access to admin area'
	},
	exportData: { contextId: 'api:exportData', action: 'export', type: 'api', name: 'Export Data', description: 'Export system data' },
	apiUser: { contextId: 'api:user', action: 'read', type: 'api', name: 'User API', description: 'Access to user API' },
	userCreateToken: {
		contextId: 'user.create',
		action: 'create',
		type: 'user',
		name: 'Create User Token',
		description: 'Create user registration tokens'
	},
	userManage: {
		contextId: 'user:manage',
		action: 'manage',
		type: 'user',
		name: 'User Management',
		description: 'Manage user accounts and roles'
	}
};

// Export permissions array for compatibility
export const permissions = getAllPermissions();

// Convenience functions for common operations
export function checkPermissions(user: User, permissionIds: string[], roles: Role[]): boolean {
	return permissionIds.every((permissionId) => hasPermissionWithRoles(user, permissionId, roles));
}

export function getUserRole(user: User, roles: Role[]): Role | undefined {
	return roles.find((role) => role._id === user.role);
}

export function getUserRoles(user: User, roles: Role[]): Role[] {
	const userRole = getUserRole(user, roles);
	return userRole ? [userRole] : [];
}
