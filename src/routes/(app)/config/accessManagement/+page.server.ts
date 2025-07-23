/**
 * @file src/routes/(app)/config/accessManagement/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth - Ensure these imports point to optimized, efficient functions
import { hasPermissionWithRoles, getAllPermissions } from '@src/auth/permissions';
import { initializeRoles, roles } from '@root/config/roles'; // Assuming `roles` is a pre-loaded, static array

// System Logger - Ensure logger is optimized for performance in production (e.g., disabled debug logs)
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Initialize roles once if they are not already loaded in memory.
		// If `roles` is a static, pre-initialized array, this `await` might be redundant or could be optimized.
		// For a CMS, roles might be dynamic and fetched from a DB, so ensure `initializeRoles` handles caching.
		await initializeRoles();

		logger.debug('Starting load function for access management page');

		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: ${user._id}`); // Use template literals for cleaner logging
		// Removed color codes from logs; they might not render correctly in all environments
		// and can be distracting. Use your logger's formatting options if needed.

		if (!user.role) {
			const message = `User role is missing for user ${user.email}`;
			logger.warn(message);
			throw error(403, message);
		}

		// Check user permission
		const hasAccessPermission = hasPermissionWithRoles(user, 'config:accessManagement', roles);

		if (!hasAccessPermission) {
			const message = `User ${user._id} does not have permission to access management`;
			logger.warn(message);
			throw error(403, message);
		}

		// Fetch roles and permissions. `roles` is directly imported, implying it's already available.
		logger.debug('Fetching roles and permissions...');
		const allRoles = roles; // Directly use the imported `roles`
		const permissions = getAllPermissions();

		logger.debug(`Roles fetched: ${allRoles.length}`);
		logger.debug(`Permissions fetched: ${permissions.length}`);

		// Return only necessary user data to the client to minimize payload
		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles: allRoles,
			permissions
		};
	} catch (err) {
		// Differentiate between intentional redirects/errors and unexpected server errors
		if (err && typeof err === 'object' && 'status' in err) {
			// This is likely a redirect or an error we've already thrown (e.g., 403, 302)
			throw err;
		}
		const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message); // Generic 500 for unhandled server errors
	}
};
