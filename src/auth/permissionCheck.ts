/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
 *
 * Provides a function to check user permissions based on their role and the required permissions for a specific action or resource.
 */

import type { User, ContextType, Permission } from './types';
import { PermissionAction } from '../../config/permissions';
import { roles as configRoles } from '@root/config/roles';
import { getAllPermissions } from './permissionManager';
// System Logger
import logger from '@utils/logger';

export interface PermissionConfig {
	contextId: string;
	name: string;
	action: PermissionAction;
	contextType: ContextType | string;
}

// Cache to store roles and permissions temporarily
const rolePermissionCache: Record<string, Permission[]> = {};

//Checks if the user has the necessary permissions based on their role and the required permission configuration.
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<{ hasPermission: boolean; isRateLimited: boolean }> {
	try {
		logger.debug(`Starting permission check for user: ${user.email}, role: ${user.role}, config: ${JSON.stringify(config)}`);

		// Retrieve the user's role from the configuration
		const userRole = configRoles.find((role) => role._id === user.role);

		if (!userRole) {
			logger.warn(`Role ${user.role} not found for user ${user.email}`);
			return { hasPermission: false, isRateLimited: false };
		}

		// Automatically grant permissions to users with the 'isAdmin' role property
		if (userRole.isAdmin) {
			logger.info(`User ${user.email} has an admin role (role: ${user.role}), automatically granting permission.`);
			return { hasPermission: true, isRateLimited: false };
		}

		// Retrieve cached role permissions or fetch them if not cached
		let userPermissions: Permission[] = rolePermissionCache[user.role];
		if (!userPermissions) {
			logger.debug(`No cached permissions found for role: ${user.role}. Fetching from in-memory configuration.`);

			// Fetch all permissions and filter by the user's role permissions
			const allPermissions = await getAllPermissions(); // In-memory permissions
			userPermissions = allPermissions.filter((permission) => userRole.permissions.includes(permission._id));

			// Cache the result
			rolePermissionCache[user.role] = userPermissions;
			logger.debug(`Permissions for role ${user.role} have been cached: ${JSON.stringify(userPermissions)}`);
		} else {
			logger.debug(`Using cached permissions for role: ${user.role}`);
		}

		// Check if the user has the required permission
		const hasPermission = userPermissions.some(
			(permission) =>
				permission._id === config.contextId &&
				(permission.action === config.action || permission.action === PermissionAction.MANAGE) &&
				(permission.type === config.contextType || permission.type === 'system')
		);

		if (!hasPermission) {
			logger.info(`User ${user.email} lacks required permission for ${config.contextId}`);
		}

		return { hasPermission, isRateLimited: false };
	} catch (error) {
		logger.error(`Error checking user permission: ${(error as Error).message}`);
		return { hasPermission: false, isRateLimited: false };
	}
}

// Loads all permissions for the specified user based on their role.
export async function loadUserPermissions(user: User): Promise<Permission[]> {
	const userRole = configRoles.find((role) => role._id === user.role);
	if (!userRole) {
		logger.warn(`Role ${user.role} not found for user ${user.email}`);
		return [];
	}

	const allPermissions = await getAllPermissions();
	return allPermissions.filter((permission) => userRole.permissions.includes(permission._id));
}
