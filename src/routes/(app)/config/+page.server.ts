/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Access Management page authentication and authorization.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { permissionConfigs } from '@src/auth/permissionManager';
import { permissions as allPermissions } from '@root/config/permissions';

// System Logger
import { logger } from '@src/utils/logger';

export const load: PageServerLoad = async ({ cookies }) => {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.debug('No session ID found, redirecting to login');
		throw redirect(302, '/login');
	}

	try {
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn(`Invalid session for session_id: ${session_id}`);
			throw redirect(302, '/login');
		}

		logger.debug(`User session validated successfully for user: ${user._id}`);

		// Make sure to include the role in the user object
		const userRole = user.role;
		if (!userRole) {
			logger.warn(`User role is missing for user ${user.email}`);
			throw error(403, 'User role is missing');
		}

		const serializableUser = {
			_id: user._id.toString(),
			username: user.username,
			email: user.email,
			role: userRole,
			permissions: user.permissions
		};

		// const permissionConfigs: Record<string, PermissionConfig> = {
		// 	collectionbuilder: { contextId: 'config/collectionbuilder', requiredRole: 'admin', action: 'read', contextType: 'system' },
		// 	graphql: { contextId: 'config/graphql', requiredRole: 'admin', action: 'read', contextType: 'system' },
		// 	imageeditor: { contextId: 'config/imageeditor', requiredRole: 'admin', action: 'write', contextType: 'system' },
		// 	dashboard: { contextId: 'config/dashboard', requiredRole: 'admin', action: 'read', contextType: 'system' },
		// 	widgetManagement: { contextId: 'config/widgetManagement', requiredRole: 'admin', action: 'write', contextType: 'system' },
		// 	themeManagement: { contextId: 'config/themeManagement', requiredRole: 'admin', action: 'write', contextType: 'system' },
		// 	settings: { contextId: 'config/settings', requiredRole: 'admin', action: 'write', contextType: 'system' },
		// 	accessManagement: { contextId: 'config/accessManagement', requiredRole: 'admin', action: 'write', contextType: 'system' }
		// };

		const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};

		for (const key in permissionConfigs) {
			let hasPermission = false;
			const config = permissionConfigs[key];

			if (userRole.toLowerCase() === 'admin') {
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
	} catch (error) {
		logger.error('Error validating session:', error);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		throw redirect(302, '/login');
	}
};
