import { redirect, error } from '@sveltejs/kit';
import { g as getAllPermissions } from '../../../../chunks/permissions.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, tenantId } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		const userRole = (tenantRoles || []).find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;
		if (!isAdmin) {
			const message = `User ${user._id} does not have permission to access access management`;
			logger.warn(message, { tenantId });
			throw error(403, message);
		}
		logger.debug('Fetching permissions...', { tenantId });
		const permissions = getAllPermissions();
		logger.debug(`Roles available: ${tenantRoles.length}`, { tenantId });
		logger.debug(`Permissions fetched: ${permissions.length}`, { tenantId });
		return {
			user: {
				_id: user._id.toString(),
				email: user.email,
				role: user.role
			},
			roles: tenantRoles,
			// Already cached and loaded by handleAuthorization hook
			permissions
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId: locals.tenantId });
		throw error(500, message);
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
