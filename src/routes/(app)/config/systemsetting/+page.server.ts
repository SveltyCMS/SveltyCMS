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

// Auth
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logs
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// Log successful session validation
		logger.debug(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		// Check user permission for system settings
		// First check if user is admin (explicit check)
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;

		const hasSystemSettingsPermission = isAdmin || hasPermissionWithRoles(user, 'config:settings', roles);

		if (!hasSystemSettingsPermission) {
			const message = `User ${user._id} does not have permission to access system settings`;
			logger.warn(message, {
				userRole: user.role,
				isAdmin,
				availableRoles: roles.map((r) => r._id),
				roleFound: !!userRole
			});
			throw error(403, 'Insufficient permissions');
		}

		// Return user data
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			}
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
