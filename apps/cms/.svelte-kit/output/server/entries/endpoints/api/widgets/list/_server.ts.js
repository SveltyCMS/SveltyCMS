import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
import { widgets, getWidgetDependencies } from '../../../../../chunks/widgetStore.svelte.js';
const GET = async ({ url, locals }) => {
	const start = performance.now();
	const tenantId = url.searchParams.get('tenantId') || 'default-tenant';
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
		if (!locals.dbAdapter?.widgets?.getActiveWidgets) {
			throw new Error('Widget database adapter not available');
		}
		const activeWidgetsResult = await locals.dbAdapter.widgets.getActiveWidgets();
		if (!activeWidgetsResult.success) {
			throw new Error(`Failed to fetch active widgets: ${activeWidgetsResult.error?.message || 'Unknown error'}`);
		}
		const activeWidgetNames = (activeWidgetsResult.data || []).map((w) => w.name);
		logger.debug('[/api/widgets/list] Active widgets from database', {
			tenantId,
			count: activeWidgetNames.length,
			widgets: activeWidgetNames
		});
		const widgetList = Object.entries(widgets.widgetFunctions).map(([name, widgetFn]) => {
			const isActive = activeWidgetNames.includes(name);
			const isCore = widgets.coreWidgets.includes(name);
			const dependencies = getWidgetDependencies(name);
			const widget = widgetFn;
			return {
				name,
				icon: widget.Icon || (isCore ? 'mdi:puzzle' : 'mdi:puzzle-plus'),
				description: widget.Description || '',
				isCore,
				isActive,
				dependencies,
				// 3-Pillar Architecture Components
				pillar: {
					definition: {
						name: widget.Name,
						description: widget.Description,
						icon: widget.Icon,
						guiSchema: widget.GuiSchema ? Object.keys(widget.GuiSchema).length : 0,
						aggregations: !!widget.aggregations
					},
					input: {
						componentPath: widget.__inputComponentPath || '',
						exists: !!widget.__inputComponentPath
					},
					display: {
						componentPath: widget.__displayComponentPath || '',
						exists: !!widget.__displayComponentPath
					}
				},
				// Widget metadata
				canDisable: !isCore && dependencies.length === 0,
				hasValidation: !!widget.GuiSchema
			};
		});
		widgetList.sort((a, b) => {
			if (a.isCore && !b.isCore) return -1;
			if (!a.isCore && b.isCore) return 1;
			return a.name.localeCompare(b.name);
		});
		const duration = performance.now() - start;
		logger.trace('Retrieved complete widget list', {
			tenantId,
			coreWidgets: widgetList.filter((w) => w.isCore).length,
			customWidgets: widgetList.filter((w) => !w.isCore).length,
			totalWidgets: widgetList.length
		});
		return json({
			success: true,
			data: {
				widgets: widgetList,
				summary: {
					total: widgetList.length,
					active: widgetList.filter((w) => w.isActive).length,
					core: widgetList.filter((w) => w.isCore).length,
					custom: widgetList.filter((w) => !w.isCore).length
				},
				tenantId,
				performance: { duration: `${duration.toFixed(2)}ms` }
			},
			message: 'Widget list retrieved successfully'
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get widget list: ${err instanceof Error ? err.message : String(err)}`;
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
