import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
const POST = async ({ request, locals }) => {
	const start = performance.now();
	try {
		const { user } = locals;
		if (!user) {
			return json(
				{
					success: false,
					message: 'Unauthorized',
					error: 'Authentication credentials missing'
				},
				{ status: 401 }
			);
		}
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget uninstall API due to insufficient permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		}
		const { widgetName, tenantId } = await request.json();
		if (!widgetName) {
			return json(
				{
					success: false,
					message: 'Validation Error',
					error: 'Widget name is required'
				},
				{ status: 400 }
			);
		}
		const actualTenantId = tenantId || locals.tenantId || 'default-tenant';
		logger.info(`Uninstalling widget ${widgetName} for tenant: ${actualTenantId}`);
		const uninstallResult = {
			success: true,
			data: {
				widgetName,
				tenantId: actualTenantId,
				uninstalledAt: /* @__PURE__ */ new Date().toISOString()
			},
			message: 'Widget uninstalled successfully'
		};
		const duration = performance.now() - start;
		logger.info(`Widget ${widgetName} uninstalled successfully for tenant: ${actualTenantId}`, {
			tenantId: actualTenantId,
			duration: `${duration.toFixed(2)}ms`
		});
		return json(uninstallResult);
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to uninstall widget: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
		return json(
			{
				success: false,
				message: 'Internal Server Error',
				error: message
			},
			{ status: 500 }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
