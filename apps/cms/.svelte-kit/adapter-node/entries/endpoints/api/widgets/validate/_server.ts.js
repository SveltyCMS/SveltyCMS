import { contentManager } from '../../../../../chunks/ContentManager.js';
import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ locals, request, url }) => {
	const start = performance.now();
	const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId || 'default';
	try {
		const activeWidgetsParam = url.searchParams.get('activeWidgets');
		const activeWidgets = activeWidgetsParam ? activeWidgetsParam.split(',') : [];
		logger.info('[API] Validation request started', { tenantId, activeWidgetsCount: activeWidgets.length });
		const allCollections = contentManager.getCollections();
		if (!allCollections || Object.keys(allCollections).length === 0) {
			return json({
				success: true,
				data: { valid: 0, invalid: 0, warnings: [], tenantId, integrityIssues: [] },
				message: 'No collections found to validate'
			});
		}
		const warnings = [];
		const integrityIssues = [];
		let validCollections = 0;
		let invalidCollections = 0;
		for (const [, collection] of Object.entries(allCollections)) {
			const coll = collection;
			if (!coll.fields) {
				validCollections++;
				continue;
			}
			let collectionValid = true;
			const missingWidgets = [];
			for (const field of coll.fields) {
				if (field && typeof field === 'object') {
					let widgetType;
					if ('widget' in field && field.widget && typeof field.widget === 'object' && 'Name' in field.widget) {
						widgetType = String(field.widget.Name);
					} else if ('type' in field && field.type) {
						widgetType = String(field.type);
					}
					if (widgetType) {
						const capitalizedWidget = widgetType.charAt(0).toUpperCase() + widgetType.slice(1);
						if (!activeWidgets.includes(capitalizedWidget)) {
							missingWidgets.push(capitalizedWidget);
							collectionValid = false;
						}
					}
				}
			}
			if (collectionValid) {
				validCollections++;
			} else {
				invalidCollections++;
				warnings.push(`Collection "${coll.name || coll._id}" requires inactive widgets: ${missingWidgets.join(', ')}`);
			}
		}
		if (activeWidgets.length > 0) {
		}
		const duration = performance.now() - start;
		logger.info('[API] Validation completed', {
			tenantId,
			stats: {
				total: Object.keys(allCollections).length,
				valid: validCollections,
				invalid: invalidCollections,
				warnings: warnings.length,
				integrityIssues: integrityIssues.length
			},
			duration: `${duration.toFixed(2)}ms`
		});
		return json({
			success: true,
			data: {
				valid: validCollections,
				invalid: invalidCollections,
				warnings,
				integrityIssues,
				total: Object.keys(allCollections).length,
				tenantId
			},
			message: 'Validation completed successfully'
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to validate collections: ${err instanceof Error ? err.message : String(err)}`;
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
