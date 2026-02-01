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

// Auth - Use cached roles from locals instead of global config
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

// System Logger
import { contentManager } from '@root/src/content/ContentManager';
import { logger } from '@utils/logger.server';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, isAdmin } = locals;

		// User authentication already done by handleAuthorization hook
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// Check user permission for collection builder using cached roles from locals
		const hasCollectionBuilderPermission = hasPermissionWithRoles(user, 'config:collectionbuilder', tenantRoles);

		if (!hasCollectionBuilderPermission) {
			const userRole = tenantRoles.find((r) => r._id === user.role);
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
		const contentStructure = await contentManager.getContentStructureFromDatabase('flat');

		// Use isAdmin from locals (already computed by handleAuthorization hook)
		// No need to re-calculate from roles

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

export const actions = {
	deleteCollections: async ({ request }) => {
		const formData = await request.formData();
		const ids = JSON.parse(formData.get('ids') as string);

		if (!ids || !Array.isArray(ids)) {
			throw error(400, 'Invalid IDs for deletion');
		}

		try {
			// We need to find the paths for these IDs to delete from contentManager
			const currentStructure = await contentManager.getContentStructureFromDatabase('flat');
			const pathsToDelete = currentStructure.filter((node) => ids.includes(node._id.toString())).map((node) => node.path);

			const operations = pathsToDelete.map((path) => ({
				type: 'delete' as const,
				node: { path } as any
			}));

			await contentManager.upsertContentNodes(operations);
			return { success: true };
		} catch (err) {
			logger.error('Error deleting collections:', err);
			return { success: false, error: 'Failed to delete collections' };
		}
	},

	saveConfig: async ({ request }) => {
		const formData = await request.formData();
		const items = JSON.parse(formData.get('items') as string);

		if (!items || !Array.isArray(items)) {
			throw error(400, 'Invalid items for save');
		}

		try {
			await contentManager.upsertContentNodes(items);
			const updatedStructure = await contentManager.getContentStructureFromDatabase('flat');
			const serializedStructure = updatedStructure.map((node) => ({
				...node,
				_id: node._id.toString(),
				...(node.parentId ? { parentId: node.parentId.toString() } : {})
			}));

			return { success: true, contentStructure: serializedStructure };
		} catch (err) {
			logger.error('Error saving config:', err);
			return { success: false, error: 'Failed to save configuration' };
		}
	}
};
