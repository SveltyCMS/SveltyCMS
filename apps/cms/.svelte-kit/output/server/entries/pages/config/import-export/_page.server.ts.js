import { redirect, error } from '@sveltejs/kit';
import { h as hasPermissionWithRoles } from '../../../../chunks/permissions.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;
		if (!user) {
			logger.warn('Unauthenticated access attempt to import/export');
			throw redirect(302, '/login');
		}
		const hasPermission = hasPermissionWithRoles(user, 'config:importexport', tenantRoles);
		if (!hasPermission && !isAdmin) {
			logger.warn(`Permission denied: user=${user._id}, role=${user.role}, missing=config:importexport`);
			throw error(403, 'Insufficient permissions');
		}
		return {
			user: {
				id: user._id.toString(),
				username: user.username || user.email,
				email: user.email,
				role: user.role,
				isAdmin
			}
		};
	} catch (err) {
		if (err instanceof Response || (err instanceof Error && 'status' in err)) {
			throw err;
		}
		logger.error(`System failure in import/export: ${err instanceof Error ? err.stack : String(err)}`);
		throw error(500, 'Internal Server Error');
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
