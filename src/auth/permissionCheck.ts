/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
 *
 * This module provides a function to check user permissions based on their role
 * and the required permissions for a specific action or resource. It's designed
 * to be used in +page.server.ts files or other server-side logic where
 * fine-grained permission checks are needed.
 *
 * Features:
 * - Checks user roles against required permissions
 * - Supports context-based permissions (e.g., different permissions for different resources)
 * - Automatically grants all permissions to admin users
 * - Integrates with the existing auth system
 *
 * Usage:
 * import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';
 *
 * // In a +page.server.ts load function:
 * const permissionConfig: PermissionConfig = {
 *   contextId: 'resource/action',
 *   requiredRole: 'editor',
 *   action: 'read',
 *   contextType: 'collection'
 * };
 * const hasPermission = await checkUserPermission(user, permissionConfig);
 */

// Auth
import type { User, PermissionAction, ContextType, Role, Permission } from './types';
import { authAdapter } from '@src/databases/db';

// System Logger
import logger from '@src/utils/logger';

// Define the type for a PermissionConfig
export interface PermissionConfig {
	contextId: string;
	requiredRole: string;
	action: PermissionAction;
	contextType: ContextType | string;
}

// Check if a user has permission to perform an action on a specific resource
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<boolean> {
	// Admins have all permissions
	if (user.role === 'admin') {
		return true;
	}

	try {
		// Retrieve user roles
		const roles: Role[] = await authAdapter!.getRolesForUser(user._id);
		// Find the user's role in the retrieved roles
		const userRole = roles.find((role) => role.name === user.role);

		// If the role does not exist, return false
		if (!userRole) {
			logger.warn(`Role ${user.role} not found for user ${user._id}`);
			return false;
		}

		// Retrieve permissions for the found role
		const permissions: Permission[] = await authAdapter!.getPermissionsForRole(userRole._id);

		// Check if any of the permissions match the required configuration
		const hasPermission = permissions.some(
			(permission) =>
				permission.contextId === config.contextId &&
				permission.action === config.action &&
				permission.contextType === config.contextType &&
				permission.requiredRole === config.requiredRole
		);

		if (!hasPermission) {
			logger.info(`User ${user._id} lacks required permission for ${config.contextId}`);
		}

		return hasPermission;
	} catch (error) {
		const err = error as Error;
		logger.error(`Error checking user permission:: ${err.message}`);
		return false;
	}
}
