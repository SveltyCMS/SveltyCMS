import { json, error } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { widgets, getWidgetFunction, isWidgetCore } from '../../../../../chunks/widgetStore.svelte.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { C as CacheCategory } from '../../../../../chunks/CacheCategory.js';
const GET = async ({ locals, url }) => {
	const start = performance.now();
	const { tenantId } = locals;
	try {
		const forceRefresh = url.searchParams.get('refresh') === 'true';
		if (forceRefresh) {
			logger.trace('[/api/widgets/active] Force refresh requested, clearing cache', { tenantId });
			await cacheService.delete('widget:active:all', tenantId);
		}
		const cacheKey = 'widget:active:all';
		const cachedData = await cacheService.get(cacheKey, tenantId);
		if (cachedData && !forceRefresh) {
			logger.trace('[/api/widgets/active] Serving from cache', { tenantId });
			return json({
				success: true,
				data: cachedData,
				message: 'Active widgets retrieved from cache'
			});
		}
		await widgets.initialize(tenantId);
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter?.widgets?.getActiveWidgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}
		const result = await dbAdapter.widgets.getActiveWidgets();
		logger.trace('[/api/widgets/active] Raw result from getActiveWidgets()', {
			tenantId,
			resultType: Array.isArray(result) ? 'array' : typeof result,
			resultLength: Array.isArray(result) ? result.length : void 0
		});
		let widgetNames = [];
		if (Array.isArray(result)) {
			if (typeof result[0] === 'string' || result.length === 0) {
				widgetNames = result;
			} else if (typeof result[0] === 'object' && 'name' in result[0]) {
				widgetNames = result.map((w) => w.name);
			}
		} else if (result && typeof result === 'object' && 'success' in result && result.success) {
			const data = result.data;
			if (Array.isArray(data)) {
				if (typeof data[0] === 'string' || data.length === 0) {
					widgetNames = data;
				} else if (typeof data[0] === 'object' && 'name' in data[0]) {
					widgetNames = data.map((w) => w.name);
				}
			}
		}
		const { widgetRegistryService } = await import('../../../../../chunks/WidgetRegistryService.js');
		await widgetRegistryService.initialize();
		const allWidgets = widgetRegistryService.getAllWidgets();
		const uniqueNames = new Set(widgetNames);
		for (const [name, factory] of allWidgets.entries()) {
			if (factory.__widgetType === 'core') {
				uniqueNames.add(name);
			}
		}
		widgetNames = Array.from(uniqueNames);
		logger.trace('[/api/widgets/active] Extracted widget names (including core)', {
			tenantId,
			count: widgetNames.length,
			widgets: widgetNames,
			allRegistryKeys: Array.from(allWidgets.keys()),
			inputWidgetType: allWidgets.get('Input') ? allWidgets.get('Input').__widgetType : 'NOT_FOUND'
		});
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
		logger.trace('Retrieved active widgets with metadata', {
			tenantId,
			widgetCount: enrichedWidgets.length,
			widgetNames: enrichedWidgets.map((w) => w.name),
			duration: `${duration.toFixed(2)}ms`
		});
		const responseData = {
			widgets: enrichedWidgets,
			tenantId
		};
		await cacheService.setWithCategory(cacheKey, responseData, CacheCategory.WIDGET, tenantId);
		return json({
			success: true,
			data: responseData,
			message: 'Active widgets retrieved successfully',
			performance: { duration: `${duration.toFixed(2)}ms` }
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to get active widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
