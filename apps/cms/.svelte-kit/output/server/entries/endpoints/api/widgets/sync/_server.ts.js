import { json, error } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
import { widgets } from '../../../../../chunks/widgetStore.svelte.js';
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
		const isAdmin = user.role === 'admin' || user.role === 'super-admin';
		if (!hasWidgetPermission || !isAdmin) {
			logger.warn(`User ${user._id} denied access to widget sync due to insufficient permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission or admin role'
				},
				{ status: 403 }
			);
		}
		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId || 'default-tenant';
		await widgets.initialize(tenantId);
		const allWidgetFunctions = widgets.widgetFunctions;
		const coreWidgetNames = widgets.coreWidgets;
		const customWidgetNames = widgets.customWidgets;
		if (!locals.dbAdapter?.widgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}
		const dbResult = await locals.dbAdapter.widgets.findAll();
		const dbWidgets = dbResult.success ? dbResult.data || [] : [];
		const dbWidgetNames = dbWidgets.map((w) => w.name);
		logger.info('Starting widget sync...', {
			tenantId,
			fileSystem: Object.keys(allWidgetFunctions).length,
			database: dbWidgets.length,
			core: coreWidgetNames.length,
			custom: customWidgetNames.length
		});
		const results = {
			created: [],
			updated: [],
			activated: [],
			skipped: [],
			errors: []
		};
		for (const [name, widgetFn] of Object.entries(allWidgetFunctions)) {
			try {
				const isCore = coreWidgetNames.includes(name);
				const exists = dbWidgetNames.includes(name);
				const widget = widgetFn;
				if (exists) {
					const dbWidget = dbWidgets.find((w) => w.name === name);
					if (isCore && dbWidget && !dbWidget.isActive) {
						await locals.dbAdapter.widgets.update(dbWidget._id, { isActive: true });
						results.activated.push(name);
						logger.trace(`Activated core widget: ${name}`);
					} else {
						results.skipped.push(name);
					}
				} else {
					const createResult = await locals.dbAdapter.widgets.register({
						name,
						isActive: isCore,
						// Core widgets are active by default
						instances: {},
						dependencies: widget.__dependencies || []
					});
					if (createResult.success) {
						results.created.push(name);
						logger.info(`Created widget in database: ${name} (${isCore ? 'core' : 'custom'})`);
					} else {
						results.errors.push({
							widget: name,
							error: createResult.error?.message || 'Unknown error'
						});
					}
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				results.errors.push({ widget: name, error: errorMsg });
				logger.error(`Error syncing widget ${name}:`, err);
			}
		}
		const duration = performance.now() - start;
		logger.info('Widget sync completed', {
			stats: {
				total: Object.keys(allWidgetFunctions).length,
				created: results.created.length,
				updated: results.updated.length,
				activated: results.activated.length,
				skipped: results.skipped.length,
				errors: results.errors.length
			},
			duration: `${duration.toFixed(2)}ms`,
			tenantId
		});
		return json({
			success: true,
			data: {
				results: {
					total: Object.keys(allWidgetFunctions).length,
					created: results.created.length,
					updated: results.updated.length,
					activated: results.activated.length,
					skipped: results.skipped.length,
					errors: results.errors.length
				},
				details: results,
				tenantId,
				performance: { duration: `${duration.toFixed(2)}ms` }
			},
			message: 'Widget sync completed successfully'
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to sync widgets: ${err instanceof Error ? err.message : String(err)}`;
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
