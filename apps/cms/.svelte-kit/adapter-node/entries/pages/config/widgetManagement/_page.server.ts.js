import { redirect, error } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles } = locals;
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}
		logger.trace(`User authenticated successfully for user: ${user._id}}`);
		const hasWidgetPermission = user.permissions?.includes('config:widgetManagement:manage') || tenantRoles.some((role) => role.isAdmin);
		if (!hasWidgetPermission) {
			const message = `User ${user._id} does not have permission to access widget management`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions');
		}
		const tenantId = locals.tenantId || 'default-tenant';
		const installedWidgets = [];
		try {
		} catch (error2) {
			logger.warn(`Failed to load installed widgets for tenant ${tenantId}:`, error2);
		}
		const canInstallWidgets = user.permissions?.includes('config:widgetInstall:manage') || tenantRoles.some((role) => role.isAdmin);
		const canUninstallWidgets = user.permissions?.includes('config:widgetUninstall:manage') || tenantRoles.some((role) => role.isAdmin);
		const canManageMarketplace = user.permissions?.includes('config:marketplace:manage') || tenantRoles.some((role) => role.isAdmin);
		const { _id, ...rest } = user;
		return {
			user: {
				_id: _id.toString(),
				...rest
			},
			tenantId,
			installedWidgets,
			// Additional context for widget management
			canInstallWidgets,
			canUninstallWidgets,
			canManageMarketplace
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
