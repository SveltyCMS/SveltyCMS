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

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { roles } from '@root/config/roles';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

// System Logger
import { contentManager } from '@root/src/content/ContentManager';
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.trace(`User authenticated successfully for user: \x1b[34m${user._id}\x1b[0m`);

		// Check user permission for collection builder
		const hasReadPermission = hasPermissionWithRoles(user, 'collections:read', roles);
		const hasCreatePermission = hasPermissionWithRoles(user, 'collections:create', roles);
		const hasConfigPermission = hasPermissionWithRoles(user, 'system:config', roles);

		logger.trace('Permission check details', {
			userId: user._id,
			userRole: user.role,
			permissionsChecked: [
				{ resource: 'collections', action: 'read', hasPermission: hasReadPermission },
				{ resource: 'collections', action: 'create', hasPermission: hasCreatePermission },
				{ resource: 'system', action: 'config', hasPermission: hasConfigPermission }
			]
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

		// Initialize ContentManager before accessing data
		await contentManager.initialize();

		// Fetch the initial content structure directly from database
		// CollectionBuilder needs the current database state (not in-memory cache) to:
		// - See the most recently persisted order and parentId values
		// - Ensure consistency when saving drag-and-drop changes back to DB
		// - Work with the actual stored data, not cached/compiled schemas
		// The database stores lightweight metadata without heavy collectionDef.fields arrays
		const contentStructure = await contentManager.getContentStructureFromDatabase('nested');

		// Determine admin status properly by checking role
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = Boolean(userRole?.isAdmin);

		// Serialize ObjectIds to strings for client-side usage
		// This is crucial because MongoDB ObjectId instances cannot be serialized by SvelteKit
		const serializedStructure = contentStructure.map((node) => ({
			...node,
			_id: node._id.toString(),
			...(node.parentId ? { parentId: node.parentId.toString() } : {})
		}));

		// Return user data with proper admin status and the content structure
		const { _id, ...rest } = user;
		return {
			user: {
				id: _id.toString(),
				...rest,
				isAdmin // Add the properly calculated admin status
			},
			contentStructure: serializedStructure
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
