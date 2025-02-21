/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
 *
 * Provides functions to check user permissions based on their role and the required permissions for a specific action or resource.
 */

import { error } from '@sveltejs/kit';
import type { User, Permission } from './types';
import { PermissionAction, PermissionType } from '@src/auth/permissionTypes';
import { roles as configRoles } from '@root/config/roles';
import { getAllPermissions } from './permissionManager';
import type { PermissionConfig } from './permissionTypes';

// System Logger
import { logger } from '@utils/logger.svelte';


// Cache to store roles and permissions temporarily
const rolePermissionCache: Record<string, Permission[]> = {};

// Checks if the user has the necessary permissions based on their role and the required permission configuration.
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<{ hasPermission: boolean; isRateLimited: boolean }> {
	try {
		logger.debug('Starting permission check', { user: { email: user.email, role: user.role }, config });

		// Retrieve the user's role from the configuration
		const userRole = configRoles.find((role) => role._id === user.role);

		if (!userRole) {
			logger.warn('Role not found for user', { role: user.role, email: user.email });
			return { hasPermission: false, isRateLimited: false };
		}

		// Automatically grant permissions to users with the 'isAdmin' role property
		if (userRole.isAdmin) {
			logger.info('User has admin role, automatically granting permission', { email: user.email, role: user.role });
			return { hasPermission: true, isRateLimited: false };
		}

		// Retrieve cached role permissions or fetch them if not cached
		let userPermissions: Permission[] = rolePermissionCache[user.role];
		if (!userPermissions) {
			logger.debug('No cached permissions found for role, fetching from in-memory configuration', { role: user.role });

			// Fetch all permissions and filter by the user's role permissions
			const allPermissions = await getAllPermissions(); // In-memory permissions
			userPermissions = allPermissions.filter((permission) => userRole.permissions.includes(permission._id));

			// Cache the result
			rolePermissionCache[user.role] = userPermissions;
			logger.debug('Permissions have been cached for role', { role: user.role, permissions: userPermissions });
		} else {
			logger.debug('Using cached permissions for role', { role: user.role });
		}

		logger.debug('User permissions', { permissions: userPermissions });

		// Check if the user has the required permission
		const hasPermission = userPermissions.some(
			(permission) =>
				permission._id === config.contextId &&
				(permission.action === config.action || permission.action === PermissionAction.MANAGE) &&
				(permission.type === config.contextType || permission.type === PermissionType.SYSTEM)
		);

		if (!hasPermission) {
			logger.info('User lacks required permission', { email: user.email, contextId: config.contextId });
		} else {
			logger.info('User has required permission', { email: user.email, contextId: config.contextId });
		}

		return { hasPermission, isRateLimited: false };
	} catch (err) {
		const message = `Error in checkUserPermission: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { error: err, user: { email: user.email }, config });
		throw error(500, message);
	}
}

// Loads all permissions for the specified user based on their role.
export async function loadUserPermissions(user: User): Promise<Permission[]> {
	try {
		const userRole = configRoles.find((role) => role._id === user.role);
		if (!userRole) {
			logger.warn('Role not found for user', { role: user.role, email: user.email });
			return [];
		}

		const allPermissions = await getAllPermissions();
		return allPermissions.filter((permission) => userRole.permissions.includes(permission._id));
	} catch (err) {
		const message = `Error in loadUserPermissions: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { error: err, user: { email: user.email } });
		throw error(500, message);
	}
}
