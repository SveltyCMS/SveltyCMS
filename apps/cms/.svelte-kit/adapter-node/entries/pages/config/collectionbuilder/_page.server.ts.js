import { redirect, error } from '@sveltejs/kit';
import { h as hasPermissionWithRoles } from '../../../../chunks/permissions.js';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, isAdmin } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
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
		await contentManager.initialize();
		const contentStructure = await contentManager.getContentStructureFromDatabase('nested');
		const serializedStructure = contentStructure.map((node) => ({
			...node,
			_id: node._id.toString(),
			...(node.parentId ? { parentId: node.parentId.toString() } : {})
		}));
		const { _id, ...rest } = user;
		return {
			user: {
				id: _id.toString(),
				...rest,
				isAdmin
				// Add the properly calculated admin status
			},
			contentStructure: serializedStructure
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
