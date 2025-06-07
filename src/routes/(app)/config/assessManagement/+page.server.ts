/**
 * @file src/routes/(app)/config/assessManagement/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Simplified Auth
import { hasPermissionWithRoles, getAllPermissions } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		logger.debug('Starting load function for access management page');

		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: ${user._id}`);

		if (!user.role) {
			const message = `User role is missing for user ${user.email}`;
			logger.warn(message);
			throw error(403, message);
		}

		// Check user permission for access management using simplified system
		const hasAccessPermission = hasPermissionWithRoles(user, 'config:accessManagement', roles);

		if (!hasAccessPermission) {
			const message = `User ${user._id} does not have permission to access management`;
			logger.warn(message);
			throw error(403, message);
		}

		// Fetch roles and permissions using simplified system
		logger.debug('Fetching roles and permissions...');
		const roles = roles;
		const permissions = getAllPermissions();

		logger.debug(`Roles fetched: ${roles.length}`);
		logger.debug(`Permissions fetched: ${permissions.length}`);

		// Prepare data to return to the client
		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles,
			permissions
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
