import { contentManager } from '../../../../../chunks/ContentManager.js';
import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals;
	try {
		const allCollections = await contentManager.getCollections();
		if (!allCollections || Object.keys(allCollections).length === 0) {
			logger.trace('No collections found', { tenantId });
			return json({
				success: true,
				data: {
					requiredWidgets: [],
					collectionsAnalyzed: 0,
					tenantId
				},
				message: 'No collections found'
			});
		}
		const requiredWidgets = [];
		const widgetSet = /* @__PURE__ */ new Set();
		for (const collection of Object.values(allCollections)) {
			if (!collection.fields) continue;
			for (const field of collection.fields) {
				if (field && typeof field === 'object') {
					let widgetType;
					if ('widget' in field && field.widget && typeof field.widget === 'object' && 'Name' in field.widget) {
						widgetType = String(field.widget.Name);
					} else if ('type' in field && field.type) {
						widgetType = String(field.type);
					}
					if (widgetType) {
						const capitalizedWidget = widgetType.charAt(0).toUpperCase() + widgetType.slice(1);
						widgetSet.add(capitalizedWidget);
					}
				}
			}
		}
		requiredWidgets.push(...Array.from(widgetSet));
		const collectionCount = Object.keys(allCollections).length;
		const duration = performance.now() - start;
		logger.trace('Analyzed collection widget dependencies', {
			tenantId,
			collectionsAnalyzed: collectionCount,
			requiredWidgets: Array.from(requiredWidgets)
		});
		return json({
			success: true,
			data: {
				requiredWidgets,
				collectionsAnalyzed: collectionCount,
				tenantId,
				performance: { duration: `${duration.toFixed(2)}ms` }
			},
			message: 'Required widgets analyzed successfully'
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to analyze collection widget dependencies: ${err instanceof Error ? err.message : String(err)}`;
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
