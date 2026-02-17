/**
 * @file src/routes/api/widgets/status/+server.ts
 * @description API endpoint for updating widget status (with dependency validation)
 * Database agnostic - uses dbAdapter interface
 */

import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { cacheService } from '@src/databases/CacheService';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ locals, request }) => {
	const start = performance.now();
	try {
		const { user } = locals;

		// Check authentication
		if (!user) {
			throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} (role: ${user.role}) denied access to API /api/widgets due to insufficient role permissions`);
			throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
		} // Check database adapter availability
		if (!locals.dbAdapter?.widgets) {
			throw new AppError('Widget database adapter not available', 500, 'DB_ADAPTER_UNAVAILABLE');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;
		const { widgetName, isActive } = await request.json();

		if (!widgetName || typeof isActive !== 'boolean') {
			throw new AppError('Missing or invalid widgetName or isActive', 400, 'VALIDATION_ERROR');
		}

		// Get all widgets to find the one we're updating
		const allWidgetsResult = await locals.dbAdapter.widgets.findAll();
		if (!allWidgetsResult.success) {
			throw new AppError(`Failed to fetch widgets: ${allWidgetsResult.error?.message || 'Unknown error'}`, 500, 'FETCH_WIDGETS_FAILED');
		}

		const allWidgets = allWidgetsResult.data || [];
		const widget = allWidgets.find((w) => w.name === widgetName);

		if (!widget) {
			throw new AppError(`Widget "${widgetName}" not found.`, 404, 'WIDGET_NOT_FOUND');
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
				if (
					schemaObj.fields &&
					Array.isArray(schemaObj.fields) &&
					schemaObj.fields.some((field: Record<string, unknown>) => field.widget === widgetName)
				) {
					usedInCollections.push((schemaObj.name as string) || 'Unknown');
				}
			}

			if (usedInCollections.length > 0) {
				throw new AppError(
					`Cannot deactivate widget "${widgetName}". It is currently used in collections: ${usedInCollections.join(', ')}.`,
					400,
					'DEPENDENCY_ERROR'
				);
			}
		}

		// If activating, check dependencies
		if (isActive && widget.dependencies && widget.dependencies.length > 0) {
			const inactiveDependencies: string[] = [];
			for (const depName of widget.dependencies) {
				const dep = allWidgets.find((w) => w.name === depName);
				if (!dep?.isActive) {
					inactiveDependencies.push(depName);
				}
			}

			if (inactiveDependencies.length > 0) {
				throw new AppError(
					`Cannot activate widget "${widgetName}". Required dependencies are inactive: ${inactiveDependencies.join(', ')}. Please activate the dependencies first.`,
					400,
					'DEPENDENCY_ERROR'
				);
			}
		}

		// Update widget status in database using dbAdapter
		if (!widget._id) {
			throw new AppError('Widget ID not found', 500, 'MISSING_WIDGET_ID');
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

		if (!(updateResult.success && updateResult.data)) {
			const errorMsg = !updateResult.success && 'error' in updateResult ? (updateResult.error as { message?: string })?.message : undefined;
			logger.error('Failed to update widget in database', {
				widgetId: widget._id,
				widgetName,
				error: errorMsg
			});
			throw new AppError(`Failed to update widget status: ${errorMsg || 'Unknown error'}`, 500, 'UPDATE_FAILED');
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
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(message, 500, 'UPDATE_STATUS_FAILED');
	}
});
