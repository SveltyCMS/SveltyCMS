/**
 * @file src/auth/permissionCheck.ts
 * @description User permission checking utility for server-side routes.
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

// Clears the cache (can be called when roles update)
export function clearRolePermissionCache() {
	rolePermissionCache.clear();
}

/**
 * Checks if the user has the necessary permissions.
 */
export async function checkUserPermission(user: User, config: PermissionConfig): Promise<{ hasPermission: boolean; isRateLimited: boolean }> {
	try {
		logger.debug(
			`Checking permissions for user on \x1b[34m${config.contextId}\x1b[0m`,
			{ email: user.email }
		);

		const userRole = configRoles.find((role) => role._id === user.role);
		if (!userRole) {
			logger.warn(
				`Role not found for user`,
				{ email: user.email }
			);
			return { hasPermission: false, isRateLimited: false };
		}

		// Admins automatically have all permissions
		if (userRole.isAdmin) {
			logger.info(
				`User is an admin. Granting full access.`,
				{ email: user.email }
			);
			return { hasPermission: true, isRateLimited: false };
		}

		// Retrieve cached role permissions or fetch them
		let userPermissions = rolePermissionCache.get(user.role);
		if (!userPermissions) {
			logger.debug(`Fetching permissions for role: \x1b[34m${user.role}\x1b[0m`);
			const allPermissions = await getAllPermissions();
			userPermissions = allPermissions.filter((permission) => userRole.permissions.includes(permission._id));

			rolePermissionCache.set(user.role, userPermissions);
		}

		// Permission Check
		const hasPermission = userPermissions.some(
			(permission) =>
				permission._id === config.contextId &&
				(permission.action === config.action || permission.action === PermissionAction.MANAGE) &&
				(permission.type === config.contextType || permission.type === PermissionType.SYSTEM)
		);

		logger.info(
			`Permission ${hasPermission ? 'GRANTED' : 'DENIED'} for user on ${config.contextId}`,
			{ email: user.email }
		);

		return { hasPermission, isRateLimited: false };
	} catch (err) {
		logger.error(`Error checking user permissions: ${err instanceof Error ? err.message : String(err)}`);
		throw error(500, 'Permission check failed.');
	}
}
