/**
 * @file src/routes/api/widgets/status/+server.ts
 * @description API endpoint for updating widget status (with dependency validation)
 * Database agnostic - uses dbAdapter interface
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

import { cacheService } from '@src/databases/CacheService';

export const POST: RequestHandler = async ({ locals, request }) => {
	const start = performance.now();
	try {
		const { user } = locals;

		// Check authentication
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
			logger.warn(`User ${user._id} (role: ${user.role}) denied access to API /api/widgets due to insufficient role permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		} // Check database adapter availability
		if (!locals.dbAdapter?.widgets) {
			throw error(500, 'Widget database adapter not available');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;
		const { widgetName, isActive } = await request.json();

		if (!widgetName || typeof isActive !== 'boolean') {
			return json(
				{
					success: false,
					message: 'Validation Error',
					error: 'Missing or invalid widgetName or isActive'
				},
				{ status: 400 }
			);
		}

		// Get all widgets to find the one we're updating
		const allWidgetsResult = await locals.dbAdapter.widgets.findAll();
		if (!allWidgetsResult.success) {
			throw error(500, `Failed to fetch widgets: ${allWidgetsResult.error?.message || 'Unknown error'}`);
		}

		const allWidgets = allWidgetsResult.data || [];
		const widget = allWidgets.find((w) => w.name === widgetName);

		if (!widget) {
			return json(
				{
					success: false,
					message: 'Not Found',
					error: `Widget "${widgetName}" not found.`
				},
				{ status: 404 }
			);
		}

		// Note: Widget interface doesn't track isCore status in database
		// Core widgets are determined by the file system location, not database property

		// If deactivating, check if the widget is in use by collections
		if (!isActive) {
			const contentManager = await import('@root/src/content/ContentManager').then((m) => m.contentManager);

			// Check if widget is used in any collection
			const allCollections = contentManager.getCollections();
			const usedInCollections: string[] = [];
			for (const [, schema] of Object.entries(allCollections)) {
				const schemaObj = schema as Record<string, unknown>;
				// Check if any fields use this widget
				if (schemaObj.fields && Array.isArray(schemaObj.fields)) {
					if (schemaObj.fields.some((field: Record<string, unknown>) => field.widget === widgetName)) {
						usedInCollections.push((schemaObj.name as string) || 'Unknown');
					}
				}
			}

			if (usedInCollections.length > 0) {
				return json(
					{
						success: false,
						message: 'Dependency Error',
						error: `Cannot deactivate widget "${widgetName}". It is currently used in collections: ${usedInCollections.join(', ')}.`
					},
					{ status: 400 }
				);
			}
		}

		// If activating, check dependencies
		if (isActive && widget.dependencies && widget.dependencies.length > 0) {
			const inactiveDependencies: string[] = [];
			for (const depName of widget.dependencies) {
				const dep = allWidgets.find((w) => w.name === depName);
				if (!dep || !dep.isActive) {
					inactiveDependencies.push(depName);
				}
			}

			if (inactiveDependencies.length > 0) {
				return json(
					{
						success: false,
						message: 'Dependency Error',
						error:
							`Cannot activate widget "${widgetName}". Required dependencies are inactive: ${inactiveDependencies.join(', ')}. ` +
							`Please activate the dependencies first.`
					},
					{ status: 400 }
				);
			}
		}

		// Update widget status in database using dbAdapter
		if (!widget._id) {
			throw error(500, 'Widget ID not found');
		}

		logger.debug(`Updating widget "${widgetName}" in database`, {
			widgetId: widget._id,
			currentStatus: widget.isActive,
			newStatus: isActive,
			widgetData: { isActive, updatedAt: new Date() }
		});

		const updateResult = await locals.dbAdapter.widgets.update(widget._id, {
			isActive
		});

		if (!updateResult.success || !updateResult.data) {
			const errorMsg = !updateResult.success && 'error' in updateResult ? (updateResult.error as { message?: string })?.message : undefined;
			logger.error('Failed to update widget in database', {
				widgetId: widget._id,
				widgetName,
				error: errorMsg
			});
			throw error(500, `Failed to update widget status: ${errorMsg || 'Unknown error'}`);
		}

		// Clear widget active cache for current tenant ID
		// The cache key is 'widget:active:all' and gets prefixed with tenant during storage
		logger.debug('[/api/widgets/status] Clearing widget active cache and related collections', { tenantId });
		await cacheService.delete('widget:active:all', tenantId);

		// Enhanced cache invalidation (moved from widgetStore)
		// Widget state changed, so ALL collection-related caches are now invalid
		try {
			await cacheService.clearByPattern('query:collections:*');
			await cacheService.clearByPattern('static:page:*'); // Page layouts depend on collections
			await cacheService.clearByPattern('api:widgets:*'); // Active/required widgets API cache
			await cacheService.clearByPattern('api:*:/api/user*'); // Admin UI may show user data
		} catch (cacheError) {
			logger.warn('[/api/widgets/status] Enhanced cache clearing failed (non-critical):', cacheError);
		}

		const duration = performance.now() - start;
		logger.info(`Widget ${widgetName} ${isActive ? 'activated' : 'deactivated'}`, {
			tenantId,
			user: user._id,
			widgetId: widget._id,
			updatedWidget: updateResult.data,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			success: true,
			data: {
				widgetName,
				isActive,
				tenantId,
				updatedAt: new Date().toISOString()
			},
			message: `Widget ${widgetName} ${isActive ? 'activated' : 'deactivated'} successfully`
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to update widget status: ${err instanceof Error ? err.message : String(err)}`;
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
