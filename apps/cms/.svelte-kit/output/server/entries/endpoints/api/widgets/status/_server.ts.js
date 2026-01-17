import { json, error } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
const POST = async ({ locals, request }) => {
	const start = performance.now();
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
			logger.warn(`User ${user._id} (role: ${user.role}) denied access to API /api/widgets due to insufficient role permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		}
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
		if (!isActive) {
			const contentManager = await import('../../../../../chunks/ContentManager.js').then((m) => m.contentManager);
			const allCollections = contentManager.getCollections();
			const usedInCollections = [];
			for (const [, schema] of Object.entries(allCollections)) {
				const schemaObj = schema;
				if (schemaObj.fields && Array.isArray(schemaObj.fields)) {
					if (schemaObj.fields.some((field) => field.widget === widgetName)) {
						usedInCollections.push(schemaObj.name || 'Unknown');
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
		if (isActive && widget.dependencies && widget.dependencies.length > 0) {
			const inactiveDependencies = [];
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
						error: `Cannot activate widget "${widgetName}". Required dependencies are inactive: ${inactiveDependencies.join(', ')}. Please activate the dependencies first.`
					},
					{ status: 400 }
				);
			}
		}
		if (!widget._id) {
			throw error(500, 'Widget ID not found');
		}
		logger.debug(`Updating widget "${widgetName}" in database`, {
			widgetId: widget._id,
			currentStatus: widget.isActive,
			newStatus: isActive,
			widgetData: { isActive, updatedAt: /* @__PURE__ */ new Date() }
		});
		const updateResult = await locals.dbAdapter.widgets.update(widget._id, {
			isActive
		});
		if (!updateResult.success || !updateResult.data) {
			const errorMsg = !updateResult.success && 'error' in updateResult ? updateResult.error?.message : void 0;
			logger.error('Failed to update widget in database', {
				widgetId: widget._id,
				widgetName,
				error: errorMsg
			});
			throw error(500, `Failed to update widget status: ${errorMsg || 'Unknown error'}`);
		}
		logger.debug('[/api/widgets/status] Clearing widget active cache and related collections', { tenantId });
		await cacheService.delete('widget:active:all', tenantId);
		try {
			await cacheService.clearByPattern('query:collections:*');
			await cacheService.clearByPattern('static:page:*');
			await cacheService.clearByPattern('api:widgets:*');
			await cacheService.clearByPattern('api:*:/api/admin/users*');
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
				updatedAt: /* @__PURE__ */ new Date().toISOString()
			},
			message: `Widget ${widgetName} ${isActive ? 'activated' : 'deactivated'} successfully`
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to update widget status: ${err instanceof Error ? err.message : String(err)}`;
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
export { POST };
//# sourceMappingURL=_server.ts.js.map
