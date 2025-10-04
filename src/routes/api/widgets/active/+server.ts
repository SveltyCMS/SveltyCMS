/**
 * @file src/routes/api/widgets/active/+server.ts
 * @description API endpoint for getting active widgets with 3-pillar architecture metadata
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { widgetStoreActions, getWidgetFunction, isWidgetCore } from '@stores/widgetStore.svelte';

export const GET: RequestHandler = async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals;

	try {
		// Initialize widgets if not already loaded
		await widgetStoreActions.initializeWidgets(tenantId);

		// Get active widgets from database
		if (!locals.dbAdapter?.widgets?.getActiveWidgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}

		const result = await locals.dbAdapter.widgets.getActiveWidgets();

		let widgetNames: string[] = [];
		if (Array.isArray(result)) {
			widgetNames = result;
		} else if (result && typeof result === 'object' && 'success' in result && result.success) {
			widgetNames = (result as { data: string[] }).data || [];
		}

		// Enrich widget data with metadata from widget functions (3-pillar architecture)
		const enrichedWidgets = widgetNames.map((name) => {
			const widgetFn = getWidgetFunction(name);
			return {
				name,
				isCore: isWidgetCore(name),
				icon: widgetFn?.Icon || 'mdi:puzzle',
				description: widgetFn?.Description || '',
				// 3-Pillar Architecture metadata
				inputComponentPath: widgetFn?.__inputComponentPath || '',
				displayComponentPath: widgetFn?.__displayComponentPath || '',
				dependencies: widgetFn?.__dependencies || []
			};
		});

		const duration = performance.now() - start;
		logger.debug('Retrieved active widgets with metadata', {
			tenantId,
			count: enrichedWidgets.length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			widgets: enrichedWidgets,
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get active widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
		throw error(500, message);
	}
};
