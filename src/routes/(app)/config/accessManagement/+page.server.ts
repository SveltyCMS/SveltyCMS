/**
 * @file src/routes/(app)/config/accessManagement/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth - Ensure these imports point to optimized, efficient functions
import { hasPermissionWithRoles, getAllPermissions } from '@src/auth/permissions';

// System Logger - Ensure logger is optimized for performance in production (e.g., disabled debug logs)
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, tenantId } = locals; // Use tenant-specific roles from locals

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: ${user._id}`, { tenantId });

		if (!user.role) {
			const message = `User role is missing for user ${user.email}`;
			logger.warn(message, { tenantId });
			throw error(403, message);
		} // Check user permission using tenant-specific roles

		const hasAccessPermission = hasPermissionWithRoles(user, 'config:accessManagement', tenantRoles);

		if (!hasAccessPermission) {
			const message = `User ${user._id} does not have permission to access management`;
			logger.warn(message, { tenantId });
			throw error(403, message);
		} // Fetch permissions. Roles are already available from locals.

		logger.debug('Fetching permissions...', { tenantId });
		const permissions = getAllPermissions();

		logger.debug(`Roles fetched: ${tenantRoles.length}`, { tenantId });
		logger.debug(`Permissions fetched: ${permissions.length}`, { tenantId }); // Return only necessary user data to the client to minimize payload

		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles: tenantRoles, // Pass the tenant-specific roles to the page
			permissions
		};
	} catch (err) {
		// Differentiate between intentional redirects/errors and unexpected server errors
		if (err && typeof err === 'object' && 'status' in err) {
			// This is likely a redirect or an error we've already thrown (e.g., 403, 302)
			throw err;
		}
		const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId: locals.tenantId });
		throw error(500, message); // Generic 500 for unhandled server errors
	}
};
