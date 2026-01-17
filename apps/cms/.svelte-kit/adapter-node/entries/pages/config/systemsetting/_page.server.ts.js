import { redirect, error } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		logger.trace(`User authenticated successfully for user: ${user._id}`);
		const hasSystemSettingsPermission =
			isAdmin ||
			tenantRoles.some((role) =>
				role.permissions?.some((p) => {
					const [resource, action] = p.split(':');
					return resource === 'config' && action === 'settings';
				})
			);
		if (!hasSystemSettingsPermission) {
			const message = `User ${user._id} does not have permission to access system settings`;
			logger.warn(message, {
				userRole: user.role,
				isAdmin
			});
			throw error(403, 'Insufficient permissions');
		}
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			},
			isAdmin
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
