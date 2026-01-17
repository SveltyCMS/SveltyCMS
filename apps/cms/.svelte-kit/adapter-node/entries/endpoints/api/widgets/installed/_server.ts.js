import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
import { widgets, getWidgetFunction } from '../../../../../chunks/widgetStore.svelte.js';
const GET = async ({ url, locals }) => {
	const start = performance.now();
	const tenantId = url.searchParams.get('tenantId') || locals.tenantId || 'default-tenant';
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
			logger.warn(`User ${user._id} denied access to widget API due to insufficient permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		}
		await widgets.initialize(tenantId);
		const installedWidgetNames = widgets.customWidgets;
		const installedWidgets = installedWidgetNames.map((name) => {
			const widgetFn = getWidgetFunction(name);
			return {
				name,
				icon: widgetFn?.Icon || 'mdi:puzzle-plus',
				description: widgetFn?.Description || '',
				// 3-Pillar Architecture metadata
				inputComponentPath: widgetFn?.__inputComponentPath || '',
				displayComponentPath: widgetFn?.__displayComponentPath || '',
				dependencies: widgetFn?.__dependencies || [],
				isCore: false
				// Custom widgets are never core
			};
		});
		const duration = performance.now() - start;
		logger.trace(`Retrieved ${installedWidgets.length} installed widgets for tenant: ${tenantId}`, {
			tenantId,
			count: installedWidgets.length
		});
		return json({
			success: true,
			data: {
				widgets: installedWidgets,
				total: installedWidgets.length,
				tenantId,
				performance: { duration: `${duration.toFixed(2)}ms` }
			},
			message: 'Installed widgets retrieved successfully'
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get installed widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : void 0 });
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
