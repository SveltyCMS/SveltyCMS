/**
 * @file src/routes/api/widgets/list/+server.ts
 * @description API endpoint for listing all widgets with 3-pillar architecture metadata
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { widgets, getWidgetDependencies } from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
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

		// Check permission
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

		// Initialize widgets if not already loaded
		await widgets.initialize(tenantId);

		// Get active widgets from DATABASE (not cached widget store)
		// This ensures the GUI always shows current database state
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

		// Build comprehensive widget list with 3-pillar architecture metadata
		const widgetList = Object.entries(widgets.widgetFunctions).map(([name, widgetFn]) => {
			const isActive = activeWidgetNames.includes(name);
			const isCore = widgets.coreWidgets.includes(name);
			const dependencies = getWidgetDependencies(name);
			const widget = widgetFn as unknown as Record<string, unknown>;

			return {
				name,
				icon: (widget.Icon as string) || (isCore ? 'mdi:puzzle' : 'mdi:puzzle-plus'),
				description: (widget.Description as string) || '',
				isCore,
				isActive,
				dependencies,
				// 3-Pillar Architecture Components
				pillar: {
					definition: {
						name: widget.Name as string,
						description: widget.Description as string,
						icon: widget.Icon as string,
						guiSchema: widget.GuiSchema ? Object.keys(widget.GuiSchema as object).length : 0,
						aggregations: !!widget.aggregations
					},
					input: {
						componentPath: (widget.__inputComponentPath as string) || '',
						exists: !!(widget.__inputComponentPath as string)
					},
					display: {
						componentPath: (widget.__displayComponentPath as string) || '',
						exists: !!(widget.__displayComponentPath as string)
					}
				},
				// Widget metadata
				canDisable: !isCore && dependencies.length === 0,
				hasValidation: !!widget.GuiSchema
			};
		}); // Sort: core first, then alphabetically
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
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : undefined });

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
