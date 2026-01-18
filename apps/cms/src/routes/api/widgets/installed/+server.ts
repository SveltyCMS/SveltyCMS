/**
 * @file src/routes/api/widgets/installed/+server.ts
 * @description API endpoint for managing installed widgets per tenant with 3-pillar architecture support
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@shared/utils/logger.server';
import { hasPermissionWithRoles } from '@shared/database/auth/permissions';

import { widgets, getWidgetFunction } from '@cms/stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
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
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : undefined });

		// Standardized error response
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
