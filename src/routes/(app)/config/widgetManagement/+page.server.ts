/**
 * @file src/routes/(app)/config/widgetManagement/+page.server.ts
 * @description Server-side logic for Widget Management page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the Widget Management page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for widget management access.
 * - Returns user data if authentication and authorization are successful.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m}`);

		// Check user permission for widget management
		const hasWidgetPermission = hasPermissionWithRoles(user, 'config:widgetManagement', roles);

		if (!hasWidgetPermission) {
			const message = `User \x1b[34m${user._id}\x1b[0m does not have permission to access widget management`;
			logger.warn(message);
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
