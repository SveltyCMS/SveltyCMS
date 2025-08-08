/**
 * @file src/routes/(app)/config/collectionbuilder/+page.server.ts
 * @description Server-side logic for Collection Builder page authentication and authorization.
 *
 * #Features:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Verifies user permissions for collection builder access (`config:collectionbuilder`).
 * - Fetches initial content structure data from `contentManager`.
 * - Determines user's admin status based on roles.
 * - Redirects unauthenticated users to login.
 * - Throws 403 error for insufficient permissions.
 * - Returns user data and content structure for client-side rendering.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.debug(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		// Check user permission for collection builder
		logger.debug('Permission check details', {
			userId: user._id,
			userRole: user.role,
			availableRoles: roles.length,
			checkingPermission: 'config:collectionbuilder'
		});

		const hasCollectionBuilderPermission = hasPermissionWithRoles(user, 'config:collectionbuilder', roles);

		if (!hasCollectionBuilderPermission) {
			const userRole = roles.find((r) => r._id === user.role);
			logger.warn('Permission denied for collection builder', {
				userId: user._id,
				userRole: user.role,
				roleFound: !!userRole,
				isAdmin: userRole?.isAdmin,
				rolePermissions: userRole?.permissions?.length || 0
			});
			throw error(403, 'Insufficient permissions');
		}

		// Fetch the initial content structure
		const { contentStructure } = await contentManager.getCollectionData();

		// Determine admin status properly by checking role
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = Boolean(userRole?.isAdmin);

		// Return user data with proper admin status and the content structure
		const { _id, ...rest } = user;
		return {
			user: {
				id: _id.toString(),
				...rest,
				isAdmin // Add the properly calculated admin status
			},
			contentStructure
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
