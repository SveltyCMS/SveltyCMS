/**
 * @file src/routes/api/widgets/installed/+server.ts
 * @description API endpoint for managing installed widgets per tenant with 3-pillar architecture support
 */

import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { getWidgetFunction, widgets } from '@src/stores/widget-store.svelte.ts';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ url, locals }) => {
	const start = performance.now();
	const tenantId = url.searchParams.get('tenantId') || locals.tenantId || 'default-tenant';

	try {
		const { user } = locals;

		if (!user) {
			throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget API due to insufficient permissions`);
			throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
		}

		// Initialize widgets to get custom widgets list
		await widgets.initialize(tenantId);

		// Get all custom widgets from the file system (these are "installed" in the codebase)
		const installedWidgetNames = widgets.customWidgets;

		// Enrich with metadata from widget functions
		const installedWidgets = installedWidgetNames.map((name) => {
			const widgetFn = getWidgetFunction(name) as any;
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
		logger.error(message, {
			duration: `${duration.toFixed(2)}ms`,
			stack: err instanceof Error ? err.stack : undefined
		});
		if (err instanceof AppError) {
			throw err;
		}

		// Standardized error response
		throw new AppError(message, 500, 'GET_INSTALLED_WIDGETS_FAILED');
	}
});
