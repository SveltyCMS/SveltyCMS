/**
 * @file src/routes/api/widgets/status/+server.ts
 * @description API endpoint for updating widget status (with dependency validation)
 * Database agnostic - uses dbAdapter interface
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { roles } from '@root/config/roles';
import { cacheService } from '@src/databases/CacheService';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const { user } = locals;

		// Check authentication
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(
				`User ${user._id} (role: ${user.role}, tenant: ${user.tenantId || 'global'}) denied access to API /api/widgets due to insufficient role permissions`
			);
			throw error(403, 'Insufficient permissions');
		}

		// Check database adapter availability
		if (!locals.dbAdapter?.widgets) {
			throw error(500, 'Widget database adapter not available');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;
		const { widgetName, isActive } = await request.json();

		if (!widgetName || typeof isActive !== 'boolean') {
			throw error(400, 'Missing or invalid widgetName or isActive');
		}

		// Get all widgets to find the one we're updating
		const allWidgetsResult = await locals.dbAdapter.widgets.findAll();
		if (!allWidgetsResult.success) {
			throw error(500, `Failed to fetch widgets: ${allWidgetsResult.error?.message || 'Unknown error'}`);
		}

		const allWidgets = allWidgetsResult.data || [];
		const widget = allWidgets.find((w) => w.name === widgetName);

		if (!widget) {
			throw error(
				404,
				`Widget "${widgetName}" not found. It may not have been discovered yet. Try restarting the server to trigger widget discovery.`
			);
		}

		// Can't deactivate core widgets
		if (!isActive && widget.isCore) {
			throw error(400, `Cannot deactivate core widget "${widgetName}". Core widgets are required for system operation.`);
		}

		// If deactivating, check if the widget is in use by collections
		if (!isActive) {
			const contentManager = locals.contentManager;
			if (contentManager) {
				const allSchemas = contentManager.getAllSchemas();

				// Check if widget is used in any collection
				const usedInCollections: string[] = [];
				for (const schema of allSchemas) {
					// Check if any fields use this widget
					if (schema.fields?.some((field) => field.widget === widgetName)) {
						usedInCollections.push(schema.name);
					}
				}

				if (usedInCollections.length > 0) {
					throw error(
						400,
						`Cannot deactivate widget "${widgetName}". It is currently used in collections: ${usedInCollections.join(', ')}. ` +
							`Deactivating it would corrupt data and prevent content rendering.`
					);
				}
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
				throw error(
					400,
					`Cannot activate widget "${widgetName}". Required dependencies are inactive: ${inactiveDependencies.join(', ')}. ` +
						`Please activate the dependencies first.`
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
			isActive,
			updatedAt: new Date()
		});

		if (!updateResult.success || !updateResult.data) {
			logger.error('Failed to update widget in database', {
				widgetId: widget._id,
				widgetName,
				error: updateResult.error
			});
			throw error(500, `Failed to update widget status: ${updateResult.error?.message || 'Unknown error'}`);
		}

		// Clear widget active cache for current tenant ID
		// The cache key is 'widget:active:all' and gets prefixed with tenant during storage
		logger.debug('[/api/widgets/status] Clearing widget active cache', { tenantId });
		await cacheService.delete('widget:active:all', tenantId);

		logger.info(`Widget ${widgetName} ${isActive ? 'activated' : 'deactivated'}`, {
			tenantId,
			user: user._id,
			widgetId: widget._id,
			updatedWidget: updateResult.data
		});

		return json({
			success: true,
			widgetName,
			isActive,
			tenantId
		});
	} catch (err) {
		const message = `Failed to update widget status: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, message);
	}
};
