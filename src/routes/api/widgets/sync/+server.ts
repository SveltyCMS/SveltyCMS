/**
 * @file src/routes/api/widgets/sync/+server.ts
 * @description API endpoint to sync file system widgets with database
 * This ensures all widgets found in the file system are registered in the database
 */

import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { widgets } from '@stores/widgetStore.svelte.ts';
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

		// Check permission - only admins can sync widgets
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		const isAdmin = user.role === 'admin' || user.role === 'super-admin';

		if (!(hasWidgetPermission && isAdmin)) {
			logger.warn(`User ${user._id} denied access to widget sync due to insufficient permissions`);
			throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId || 'default-tenant';

		// Initialize widgets to get all from file system
		await widgets.initialize(tenantId);

		// Get all widget data from file system
		const allWidgetFunctions = widgets.widgetFunctions;
		const coreWidgetNames = widgets.coreWidgets;
		const customWidgetNames = widgets.customWidgets;

		if (!locals.dbAdapter?.widgets) {
			logger.error('Widget database adapter not available');
			throw new AppError('Widget database adapter not available', 500, 'DB_ADAPTER_UNAVAILABLE');
		}

		// Get current widgets from database
		const dbResult = await locals.dbAdapter.widgets.findAll();
		const dbWidgets: Record<string, unknown>[] = dbResult.success ? (dbResult.data as unknown as Record<string, unknown>[]) || [] : [];
		const dbWidgetNames = dbWidgets.map((w) => w.name as string);

		logger.info('Starting widget sync...', {
			tenantId,
			fileSystem: Object.keys(allWidgetFunctions).length,
			database: dbWidgets.length,
			core: coreWidgetNames.length,
			custom: customWidgetNames.length
		});

		// Sync results tracking
		const results = {
			created: [] as string[],
			updated: [] as string[],
			activated: [] as string[],
			skipped: [] as string[],
			errors: [] as { widget: string; error: string }[]
		};

		// Sync each widget from file system to database
		for (const [name, widgetFn] of Object.entries(allWidgetFunctions)) {
			try {
				const isCore = coreWidgetNames.includes(name);
				const exists = dbWidgetNames.includes(name);
				const widget = widgetFn as unknown as Record<string, unknown>;

				if (exists) {
					// Widget exists in DB - ensure it's active if it's core
					const dbWidget = dbWidgets.find((w) => w.name === name);
					if (isCore && dbWidget && !(dbWidget.isActive as boolean)) {
						await locals.dbAdapter.widgets.update(dbWidget._id as unknown as import('@databases/dbInterface').DatabaseId, { isActive: true });
						results.activated.push(name);
						logger.trace(`Activated core widget: ${name}`);
					} else {
						results.skipped.push(name);
					}
				} else {
					// Widget doesn't exist - create it
					const createResult = await locals.dbAdapter.widgets.register({
						name,
						isActive: isCore, // Core widgets are active by default
						instances: {},
						dependencies: (widget.__dependencies as string[]) || []
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
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : undefined });
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(message, 500, 'WIDGET_SYNC_FAILED');
	}
});
