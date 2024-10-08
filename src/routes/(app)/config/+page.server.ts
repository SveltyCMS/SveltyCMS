/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Access Management page authentication and authorization.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { checkUserPermission } from '@src/auth/permissionCheck';
import { permissionConfigs } from '@src/auth/permissionManager';
import { permissions as allPermissions } from '@root/config/permissions';

// System Logger
import { logger } from '@utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User session validated successfully for user: ${user._id}`);

		if (!user.role) {
			const message = `User role is missing for user ${user.email}`;
			logger.warn(message);
			throw error(403, message);
		}

		const serializableUser = {
			_id: user._id.toString(),
			username: user.username,
			email: user.email,
			role: user.role,
			permissions: user.permissions
		};

		const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};

		for (const key in permissionConfigs) {
			let hasPermission = false;
			const config = permissionConfigs[key];

			if (user.role.toLowerCase() === 'admin') {
				hasPermission = true; // Admins should always have permission
			} else {
				// Check user permission for non-admin roles
				const permissionCheck = await checkUserPermission(serializableUser, config);
				hasPermission = permissionCheck.hasPermission;
			}

			permissions[config.contextId] = { hasPermission };
		}

		return {
			user: serializableUser,
			permissions,
			permissionConfigs,
			allPermissions
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
