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

// System Logger
import { contentManager } from '@root/src/content/content-manager';
// Auth - Use cached roles from locals instead of global config
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { error, fail, redirect } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, isAdmin, tenantId } = locals;

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

		// Initialize content-manager before accessing data
		// Pass tenantId to ensure we wait for the correct tenant's initialization
		await contentManager.initialize(tenantId);

		// Fetch the initial content structure directly from database
		// CollectionBuilder needs the current database state (not in-memory cache) to:
		// - See the most recently persisted order and parentId values
		// - Ensure consistency when saving drag-and-drop changes back to DB
		// - Work with the actual stored data, not cached/compiled schemas
		// The database stores lightweight metadata without heavy collectionDef.fields arrays
		const contentStructure = await contentManager.getContentStructureFromDatabase('flat', tenantId);

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

export const actions: Actions = {
	deleteCollections: async ({ request, locals }) => {
		const formData = await request.formData();
		const ids = JSON.parse(formData.get('ids') as string);

		if (!(ids && Array.isArray(ids))) {
			return fail(400, { message: 'Invalid IDs for deletion' });
		}

		try {
			// We need to find the paths for these IDs to delete from contentManager
			const currentStructure = await contentManager.getContentStructureFromDatabase('flat', locals.tenantId);
			const pathsToDelete = currentStructure.filter((node) => ids.includes(node._id.toString())).map((node) => node.path);

			const operations = pathsToDelete.map((path) => ({
				type: 'delete' as const,
				node: { path } as any
			}));

			await contentManager.upsertContentNodes(operations, locals.tenantId);
			return { success: true };
		} catch (err) {
			logger.error('Error deleting collections:', err);
			return fail(500, { message: 'Failed to delete collections' });
		}
	},

	saveConfig: async ({ request, locals }) => {
		const formData = await request.formData();
		const items = JSON.parse(formData.get('items') as string);

		if (!(items && Array.isArray(items))) {
			return fail(400, { message: 'Invalid items for save' });
		}

		try {
			await contentManager.upsertContentNodes(items, locals.tenantId);
			const updatedStructure = await contentManager.getContentStructureFromDatabase('flat', locals.tenantId);
			const serializedStructure = updatedStructure.map((node) => ({
				...node,
				_id: node._id.toString(),
				...(node.parentId ? { parentId: node.parentId.toString() } : {})
			}));

			return { success: true, contentStructure: serializedStructure };
		} catch (err) {
			logger.error('Error saving config:', err);
			return fail(500, { message: 'Failed to save configuration' });
		}
	},

	loadPreset: async ({ request }) => {
		const formData = await request.formData();
		const presetId = formData.get('presetId') as string;

		if (!presetId || presetId === 'blank') {
			return fail(400, { message: 'Invalid preset ID parameter' });
		}

		try {
			const { resolve } = await import('node:path');
			const { cpSync, existsSync, mkdirSync } = await import('node:fs');
			const { compile } = await import('@utils/compilation/compile');

			const presetDir = resolve(process.cwd(), 'src', 'presets', presetId);
			const targetDir = resolve(process.cwd(), 'config', 'collections');

			if (!existsSync(presetDir)) {
				return fail(404, { message: 'Preset directory not found' });
			}

			// Ensure target exists
			mkdirSync(targetDir, { recursive: true });

			// Copy files
			cpSync(presetDir, targetDir, { recursive: true, force: true });
			logger.info(`✅ Copied preset ${presetId} to config/collections`);

			// Trigger compilation to register new collections
			logger.info('🔄 Compiling new collections...');
			await compile();

			// Refresh content manager to recognize new collections
			logger.info('🔄 Refreshing content manager...');
			await contentManager.refresh();

			logger.info('✅ Preset installation complete via Collection Builder.');

			return { success: true, message: `Preset ${presetId} installed successfully` };
		} catch (err) {
			logger.error('❌ Failed to install preset:', err);
			return fail(500, { message: 'Failed to install preset' });
		}
	}
};
