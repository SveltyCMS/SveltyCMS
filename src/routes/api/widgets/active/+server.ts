/**
 * @file src/routes/api/widgets/active/+server.ts
 * @description API endpoint for getting active widgets with 3-pillar architecture metadata
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { widgetStoreActions, getWidgetFunction, isWidgetCore } from '@stores/widgetStore.svelte';
import { cacheService } from '@src/databases/CacheService';

export const GET: RequestHandler = async ({ locals, url }) => {
	const start = performance.now();
	const { tenantId } = locals;

	try {
		// Support ?refresh=true to bypass cache (useful for debugging)
		const forceRefresh = url.searchParams.get('refresh') === 'true';

		if (forceRefresh) {
			logger.debug('[/api/widgets/active] Force refresh requested, clearing cache', { tenantId });
			await cacheService.delete('widget:active:all', tenantId);
		}

		// Initialize widgets if not already loaded
		await widgetStoreActions.initializeWidgets(tenantId);

		// Get active widgets from database
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter?.widgets?.getActiveWidgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}

		const result = await dbAdapter.widgets.getActiveWidgets();
		logger.debug('[/api/widgets/active] Raw result from getActiveWidgets()', {
			tenantId,
			resultType: Array.isArray(result) ? 'array' : typeof result,
			resultLength: Array.isArray(result) ? result.length : undefined
		});

		let widgetNames: string[] = [];
		if (Array.isArray(result)) {
			widgetNames = result;
		} else if (result && typeof result === 'object' && 'success' in result && result.success) {
			widgetNames = (result as { data: string[] }).data || [];
		}

		logger.debug('[/api/widgets/active] Extracted widget names', {
			tenantId,
			count: widgetNames.length,
			widgets: widgetNames
		});

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

		logger.trace('Retrieved active widgets with metadata', {
			tenantId,
			widgetCount: enrichedWidgets.length,
			widgetNames: enrichedWidgets.map((w) => w.name),
			duration: `${(performance.now() - start).toFixed(2)}ms`
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
