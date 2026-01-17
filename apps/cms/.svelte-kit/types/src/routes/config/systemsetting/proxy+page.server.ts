// @ts-nocheck
/**
 * @file src/routes/(app)/config/systemsetting/+page.server.ts
 * @description Server-side logic for System Settings page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the System Settings page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for system settings access.
 * - Returns user data if authentication and authorization are successful.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logs
import { logger } from '@shared/utils/logger.server';

export const load = async ({ locals }: Parameters<PageServerLoad>[0]) => {
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// Log successful session validation
		logger.trace(`User authenticated successfully for user: ${user._id}`);

		// Check user permission for system settings using cached tenantRoles from locals
		const hasSystemSettingsPermission =
			isAdmin ||
			tenantRoles.some((role) =>
				role.permissions?.some((p) => {
					const [resource, action] = p.split(':');
					return resource === 'config' && action === 'settings';
				})
			);

		if (!hasSystemSettingsPermission) {
			const message = `User ${user._id} does not have permission to access system settings`;
			logger.warn(message, {
				userRole: user.role,
				isAdmin
			});
			throw error(403, 'Insufficient permissions');
		}

		// Return user data with isAdmin flag for settings filtering
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			},
			isAdmin
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
