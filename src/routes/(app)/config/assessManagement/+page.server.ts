/**
 * @file src/routes/(app)/config/assessManagement/+page.server.ts
 * @description Server-side logic for Assess Management page authentication and authorization.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { roles as configRoles } from '@root/config/roles';
import { permissionConfigs } from '@src/auth/permissionConfigs';
import { getAllPermissions } from '@src/auth/permissionManager';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		logger.debug('Starting load function for assess management page');

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

		// Check user permission for assess management
		const assessManagementConfig = permissionConfigs.accessManagement;
		const permissionCheck = await checkUserPermission(user, assessManagementConfig);

		if (!permissionCheck.hasPermission) {
			const message = `User ${user._id} does not have permission to access assess management`;
			logger.warn(message);
			throw error(403, message);
		}

		// Fetch roles and permissions in parallel
		logger.debug('Fetching roles and permissions...');
		const [roles, permissions] = await Promise.all([Promise.resolve(configRoles), getAllPermissions()]);

		logger.debug(`Roles fetched: ${roles.length}`);
		roles.forEach((role) => logger.debug(`Role: ${JSON.stringify(role)}`));

		logger.debug(`Permissions fetched: ${permissions.length}`);
		permissions.forEach((permission) => logger.debug(`Permission: ${JSON.stringify(permission)}`));

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
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
