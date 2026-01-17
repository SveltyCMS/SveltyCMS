import { redirect, error } from '@sveltejs/kit';
import { p as permissionConfigs, a as hasPermissionByAction, b as permissions } from '../../../chunks/permissions.js';
import { l as logger } from '../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		logger.trace(`User session validated successfully for user: ${user._id}`);
		if (!user.role) {
			const message = `User role is missing for user ${user.email}`;
			logger.warn(message);
			throw error(403, message);
		}
		const userRole = (locals.roles || []).find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;
		const serializableUser = {
			_id: user._id.toString(),
			email: user.email,
			role: user.role,
			permissions: user.permissions
		};
		const permissions$1 = {};
		for (const key in permissionConfigs) {
			const config = permissionConfigs[key];
			if (isAdmin) {
				permissions$1[config.contextId] = { hasPermission: true, isRateLimited: false };
			} else {
				const permissionCheck = await hasPermissionByAction(user, config.action, config.type, config.contextId, locals.roles || []);
				permissions$1[config.contextId] = {
					hasPermission: permissionCheck,
					isRateLimited: false
				};
			}
		}
		return {
			user: serializableUser,
			permissions: permissions$1,
			permissionConfigs,
			allPermissions: permissions,
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
