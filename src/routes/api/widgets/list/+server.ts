/**
 * @file src/routes/api/widgets/list/+server.ts
 * @description API endpoint for listing all widgets with 3-pillar architecture metadata
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';
import {
	widgetStoreActions,
	widgetFunctions as widgetFunctionsStore,
	activeWidgets as activeWidgetsStore,
	coreWidgets as coreWidgetsStore,
	getWidgetDependencies,
	type WidgetFunction
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

		// Get all widget functions and their metadata
		let allWidgetFunctions: Record<string, unknown> = {};
		let activeWidgetNames: string[] = [];
		let coreWidgetNames: string[] = [];

		widgetFunctionsStore.subscribe(($widgetFunctions) => {
			allWidgetFunctions = $widgetFunctions;
		})();

		activeWidgetsStore.subscribe(($activeWidgets) => {
			activeWidgetNames = $activeWidgets;
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

		logger.debug('Retrieved complete widget list', {
			tenantId,
			total: widgetList.length,
			active: widgetList.filter((w) => w.isActive).length,
			core: widgetList.filter((w) => w.isCore).length,
			custom: widgetList.filter((w) => !w.isCore).length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			widgets: widgetList,
			summary: {
				total: widgetList.length,
				active: widgetList.filter((w) => w.isActive).length,
				core: widgetList.filter((w) => w.isCore).length,
				custom: widgetList.filter((w) => !w.isCore).length
			},
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get widget list: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
		throw error(500, message);
	}
};
