/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for the configuration page, including authentication,
 * permission checks, and optional rate limiting.
 *
 * This file serves as the server-side middleware for the configuration page. It works
 * in conjunction with the PermissionGuard component on the client-side to enforce
 * access controls and optional rate limits.
 *
 * Key responsibilities:
 * 1. Authenticate the user using the session cookie.
 * 2. Perform permission checks for various configuration sections.
 * 3. Apply rate limiting to specific actions when necessary.
 * 4. Provide permission and rate limit data to the client.
 *
 * The permission and rate limit data is passed to the client via the `permissions`
 * property in the returned object. This data is then used by the PermissionGuard
 * component to control access to different parts of the configuration page.
 *
 * Rate limiting is optional and only applied to specific actions that require it.
 *
 * @requires auth - Authentication service
 * @requires checkUserPermission - Function from permissionCheck.ts for checking user permissions
 * @requires SESSION_COOKIE_NAME - Constant for the session cookie name
 * @requires logger - Logging utility
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { checkUserPermission, type PermissionConfig } from '@src/auth/permissionCheck';
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
			{ contextId: 'config/systembuilder', requiredRole: 'editor', action: 'read', contextType: 'system' },
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

		return {
			user: {
				_id: user._id.toString(), // Convert ObjectId to string
				...user,
				_id: user._id.toString() // Ensure _id is a string
			},
			permissions
		};
	} catch (e) {
		logger.error('Error validating session:', e);
		cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		throw redirect(302, '/login');
	}
};
