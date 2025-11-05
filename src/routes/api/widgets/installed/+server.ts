/**
 * @file src/routes/api/widgets/installed/+server.ts
 * @description API endpoint for managing installed widgets per tenant with 3-pillar architecture support
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

import { widgetStoreActions, customWidgets, getWidgetFunction } from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget API due to insufficient permissions`);
			throw error(403, 'Insufficient permissions');
		}
		const tenantId = url.searchParams.get('tenantId') || user.tenantId || 'default-tenant';

		// Initialize widgets to get custom widgets list
		await widgetStoreActions.initializeWidgets(tenantId);

		// Get all custom widgets from the file system (these are "installed" in the codebase)
		let installedWidgetNames: string[] = [];
		customWidgets.subscribe(($customWidgets) => {
			installedWidgetNames = $customWidgets;
		})();

		// Enrich with metadata from widget functions
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
				isCore: false // Custom widgets are never core
			};
		});

		logger.trace(`Retrieved ${installedWidgets.length} installed widgets for tenant: ${tenantId}`);

		return json(installedWidgets);
	} catch (err) {
		const message = `Failed to get installed widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
