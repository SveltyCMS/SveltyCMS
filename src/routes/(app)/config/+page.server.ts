/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Access Management page authentication and authorization.
 *
 * Handles session validation, user authentication, and role-based access control for the Access Management page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for a valid session cookie.
 * - Validates the user's session using the authentication service.
 * - Checks user permissions using RBAC middleware.
 * - Returns user data if authentication and authorization are successful.
 * - Handles session expiration, invalid session cases, and insufficient permissions.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';

// System Loggger
import logger from '@src/utils/logger';

// Define actions that require rate limiting
const rateLimitedActions = ['config/imageeditor', 'config/widgetManagement'];

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

		const permissionConfigs: PermissionConfig[] = [
			{ contextId: 'config/collectionbuilder', requiredRole: 'admin', action: 'read', contextType: 'system' },
			{ contextId: 'config/graphql', requiredRole: 'developer', action: 'read', contextType: 'system' },
			{ contextId: 'config/imageeditor', requiredRole: 'editor', action: 'write', contextType: 'system' },
			{ contextId: 'config/dashboard', requiredRole: 'user', action: 'read', contextType: 'system' },
			{ contextId: 'config/widgetManagement', requiredRole: 'admin', action: 'write', contextType: 'system' },
			{ contextId: 'config/themeManagement', requiredRole: 'admin', action: 'write', contextType: 'system' },
			{ contextId: 'config/settings', requiredRole: 'admin', action: 'write', contextType: 'system' },
			{ contextId: 'config/accessManagement', requiredRole: 'admin', action: 'write', contextType: 'system' }
		];

		const permissions = {};
		for (const config of permissionConfigs) {
			const hasPermission = await checkUserPermission(user, config);
			const permissionData: { hasPermission: boolean; isRateLimited?: boolean } = { hasPermission };

			// Only check and include rate limiting for specified actions
			if (rateLimitedActions.includes(config.contextId)) {
				// Implement your rate limiting logic here
				const isRateLimited = false; // Placeholder for actual rate limit check
				permissionData.isRateLimited = isRateLimited;
			}

			permissions[config.contextId] = permissionData;
		}

		// Construct a serializable user object manually
		const serializableUser = {
			_id: user._id.toString(), // Ensures the ID is a string
			username: user.username, // Add only serializable fields here
			email: user.email
			// Include other fields you know are serializable
		};

		return {
			user: serializableUser,
			permissions
		};
	} catch (e) {
		logger.error('Error validating session:', e);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		throw redirect(302, '/login');
	}
};
