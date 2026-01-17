import { redirect, error } from '@sveltejs/kit';
import { h as hasPermissionWithRoles } from '../../../../chunks/permissions.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		logger.trace(`User authenticated successfully for user: ${user._id}`);
		const hasThemeManagementPermission = hasPermissionWithRoles(user, 'config:themeManagement', locals.roles || []);
		if (!hasThemeManagementPermission) {
			const message = `User ${user._id} does not have permission to access theme management`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions');
		}
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			}
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
