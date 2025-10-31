/**
 * @file src/routes/api/widgets/list/+server.ts
 * @description API endpoint for listing all widgets with 3-pillar architecture metadata
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { roles } from '@root/config/roles';
import {
	widgetStoreActions,
	widgetFunctions as widgetFunctionsStore,
	coreWidgets as coreWidgetsStore,
	getWidgetDependencies
} from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	const start = performance.now();

	try {
		const { user } = locals;

		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget API due to insufficient permissions`);
			throw error(403, 'Insufficient permissions');
		}

		const tenantId = url.searchParams.get('tenantId') || user.tenantId || 'default-tenant';

		// Initialize widgets if not already loaded
		await widgetStoreActions.initializeWidgets(tenantId);

		// Get active widgets from DATABASE (not cached widget store)
		// This ensures the GUI always shows current database state
		if (!locals.dbAdapter?.widgets?.getActiveWidgets) {
			throw error(500, 'Widget database adapter not available');
		}

		const activeWidgetsResult = await locals.dbAdapter.widgets.getActiveWidgets();
		if (!activeWidgetsResult.success) {
			throw error(500, `Failed to fetch active widgets: ${activeWidgetsResult.error?.message || 'Unknown error'}`);
		}

		const activeWidgetNames = (activeWidgetsResult.data || []).map((w) => w.name);

		logger.debug('[/api/widgets/list] Active widgets from database', {
			tenantId,
			count: activeWidgetNames.length,
			widgets: activeWidgetNames
		});

		// Get all widget functions and their metadata from widget store
		let allWidgetFunctions: Record<string, unknown> = {};
		let coreWidgetNames: string[] = [];

		widgetFunctionsStore.subscribe(($widgetFunctions) => {
			allWidgetFunctions = $widgetFunctions;
		})();

		coreWidgetsStore.subscribe(($coreWidgets) => {
			coreWidgetNames = $coreWidgets;
		})();

		// Build comprehensive widget list with 3-pillar architecture metadata
		const widgetList = Object.entries(allWidgetFunctions).map(([name, widgetFn]) => {
			const isActive = activeWidgetNames.includes(name);
			const isCore = coreWidgetNames.includes(name);
			const dependencies = getWidgetDependencies(name);

			return {
				name,
				icon: widgetFn.Icon || (isCore ? 'mdi:puzzle' : 'mdi:puzzle-plus'),
				description: widgetFn.Description || '',
				isCore,
				isActive,
				dependencies,
				// 3-Pillar Architecture Components
				pillar: {
					definition: {
						name: widgetFn.Name,
						description: widgetFn.Description,
						icon: widgetFn.Icon,
						guiSchema: widgetFn.GuiSchema ? Object.keys(widgetFn.GuiSchema).length : 0,
						aggregations: !!widgetFn.aggregations
					},
					input: {
						componentPath: widgetFn.__inputComponentPath || '',
						exists: !!widgetFn.__inputComponentPath
					},
					display: {
						componentPath: widgetFn.__displayComponentPath || '',
						exists: !!widgetFn.__displayComponentPath
					}
				},
				// Widget metadata
				canDisable: !isCore && dependencies.length === 0,
				hasValidation: !!widgetFn.GuiSchema
			};
		});

		// Sort: core first, then alphabetically
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
			widgets: widgetList,
			summary: {
				total: widgetList.length,
				active: widgetList.filter((w) => w.isActive).length,
				core: widgetList.filter((w) => w.isCore).length,
				custom: widgetList.filter((w) => !w.isCore).length
			},
			tenantId,
			performance: { duration: `${duration.toFixed(2)}ms` }
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get widget list: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
		throw error(500, message);
	}
};
