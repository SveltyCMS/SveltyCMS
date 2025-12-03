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

// System Logger
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles } = locals;

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.trace(`User authenticated successfully for user: ${user._id}}`);

		// Check user permission for widget management
		// Permissions are stored as strings like 'config:widgetManagement:manage'
		const hasWidgetPermission = user.permissions?.includes('config:widgetManagement:manage') || tenantRoles.some((role) => role.isAdmin);

		if (!hasWidgetPermission) {
			const message = `User ${user._id} does not have permission to access widget management`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions');
		}

		// Get tenant information for multi-tenant widget management
		// Note: tenantId is not on the user object, it's in locals
		const tenantId = locals.tenantId || 'default-tenant';

		// Load installed widgets for this tenant
		const installedWidgets: string[] = [];
		try {
			// TODO: Implement database query to get installed widgets for tenant
			// installedWidgets = await getInstalledWidgets(tenantId);
		} catch (error) {
			logger.warn(`Failed to load installed widgets for tenant ${tenantId}:`, error);
		}

		// Check additional widget permissions
		// Permissions are stored as strings in user.permissions array
		const canInstallWidgets = user.permissions?.includes('config:widgetInstall:manage') || tenantRoles.some((role) => role.isAdmin);
		const canUninstallWidgets = user.permissions?.includes('config:widgetUninstall:manage') || tenantRoles.some((role) => role.isAdmin);
		const canManageMarketplace = user.permissions?.includes('config:marketplace:manage') || tenantRoles.some((role) => role.isAdmin);

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
			canInstallWidgets,
			canUninstallWidgets,
			canManageMarketplace
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
