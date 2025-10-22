/**
 * @file src/routes/api/widgets/sync/+server.ts
 * @description API endpoint to sync file system widgets with database
 * This ensures all widgets found in the file system are registered in the database
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { roles } from '@root/config/roles';
import {
	widgetStoreActions,
	widgetFunctions as widgetFunctionsStore,
	coreWidgets as coreWidgetsStore,
	customWidgets as customWidgetsStore,
	type WidgetFunction
} from '@stores/widgetStore.svelte';

export const POST: RequestHandler = async ({ locals, request }) => {
	const start = performance.now();

	try {
		const { user } = locals;

		// Check authentication
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission - only admins can sync widgets
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		const isAdmin = user.role === 'admin' || user.role === 'super-admin';

		if (!hasWidgetPermission || !isAdmin) {
			logger.warn(`User ${user._id} denied access to widget sync due to insufficient permissions`);
			throw error(403, 'Insufficient permissions - admin access required');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId || user.tenantId;

		// Initialize widgets to get all from file system
		await widgetStoreActions.initializeWidgets(tenantId);

		// Get all widget functions from file system
		let allWidgetFunctions: Record<string, WidgetFunction> = {};
		let coreWidgetNames: string[] = [];
		let customWidgetNames: string[] = [];

		widgetFunctionsStore.subscribe(($widgetFunctions) => {
			allWidgetFunctions = $widgetFunctions;
		})();

		coreWidgetsStore.subscribe(($coreWidgets) => {
			coreWidgetNames = $coreWidgets;
		})();

		customWidgetsStore.subscribe(($customWidgets) => {
			customWidgetNames = $customWidgets;
		})();

		if (!locals.dbAdapter?.widgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}

		// Get current widgets from database
		const dbResult = await locals.dbAdapter.widgets.getAll();
		const dbWidgets = dbResult.success ? dbResult.data || [] : [];
		const dbWidgetNames = dbWidgets.map((w) => w.name);

		logger.info('Starting widget sync...', {
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

				if (exists) {
					// Widget exists in DB - ensure it's active if it's core
					const dbWidget = dbWidgets.find((w) => w.name === name);
					if (isCore && dbWidget && !dbWidget.isActive) {
						await locals.dbAdapter.widgets.activateWidget(name);
						results.activated.push(name);
						logger.trace(`Activated core widget: ${name}`);
					} else {
						results.skipped.push(name);
					}
				} else {
					// Widget doesn't exist - create it
					const createResult = await locals.dbAdapter.widgets.create({
						name,
						description: widgetFn.Description || `${name} widget`,
						icon: widgetFn.Icon || (isCore ? 'mdi:puzzle' : 'mdi:puzzle-plus'),
						isCore,
						isActive: isCore, // Core widgets are active by default
						version: '1.0.0',
						dependencies: widgetFn.__dependencies || [],
						createdAt: new Date(),
						updatedAt: new Date()
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
			...results,
			duration: `${duration.toFixed(2)}ms`,
			tenantId
		});

		return json({
			success: true,
			message: 'Widget sync completed',
			results: {
				total: Object.keys(allWidgetFunctions).length,
				created: results.created.length,
				updated: results.updated.length,
				activated: results.activated.length,
				skipped: results.skipped.length,
				errors: results.errors.length
			},
			details: results,
			duration: `${duration.toFixed(2)}ms`,
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to sync widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, message);
	}
};
