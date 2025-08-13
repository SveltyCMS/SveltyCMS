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

		// Get tenant information for multi-tenant widget management
		const tenantId = user.tenantId || 'default-tenant';

		// Load installed widgets for this tenant
		const installedWidgets: string[] = [];
		try {
			// TODO: Implement database query to get installed widgets for tenant
			// installedWidgets = await getInstalledWidgets(tenantId);
		} catch (error) {
			logger.warn(`Failed to load installed widgets for tenant ${tenantId}:`, error);
		}

		// Return user data and widget management context
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			},
			tenantId,
			installedWidgets,
			// Additional context for widget management
			canInstallWidgets: hasPermissionWithRoles(user, 'config:widgetInstall', roles),
			canUninstallWidgets: hasPermissionWithRoles(user, 'config:widgetUninstall', roles),
			canManageMarketplace: hasPermissionWithRoles(user, 'config:marketplace', roles)
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
