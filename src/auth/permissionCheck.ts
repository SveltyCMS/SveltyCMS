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

import type { User, PermissionAction, ContextType, Permission } from './types';
import { authAdapter } from '@src/databases/db';
import logger from '@src/utils/logger';

export interface PermissionConfig {
	contextId: string;
	requiredRole: string;
	action: PermissionAction;
	contextType: ContextType | string;
}

export async function checkUserPermission(user: User, config: PermissionConfig): Promise<boolean> {
	// Admins have all permissions
	if (user.role === 'admin') {
		return true;
	}

	try {
		// Get the user's role
		const userRole = await authAdapter!.getRoleByName(user.role);

		// If the role does not exist, return false
		if (!userRole) {
			logger.warn(`Role ${user.role} not found for user ${user.email}`);
			return false;
		}

		// Retrieve permissions for the role
		const permissions: Permission[] = await authAdapter!.getPermissionsForRole(userRole.name);

		// Check if any of the permissions match the required configuration
		const hasPermission = permissions.some(
			(permission) =>
				permission.contextId === config.contextId &&
				permission.action === config.action &&
				permission.contextType === config.contextType &&
				userRole.name === config.requiredRole
		);

		if (!hasPermission) {
			logger.info(`User ${user.email} lacks required permission for ${config.contextId}`);
		}

		return hasPermission;
	} catch (error) {
		const err = error as Error;
		logger.error(`Error checking user permission: ${err.message}`);
		return false;
	}
}
