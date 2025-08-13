/**
 * @file src/routes/api/collections/widgets/validate/+server.ts
 * @description API endpoint for validating collections against current widget state
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@src/content/ContentManager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request, url }) => {
	try {
		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;

		// Get active widgets from query params (sent by client)
		const activeWidgetsParam = url.searchParams.get('activeWidgets');
		const activeWidgets = activeWidgetsParam ? activeWidgetsParam.split(',') : [];

		// Get all collections from ContentManager, scoped by tenantId
		const { collections: allCollections } = await contentManager.getCollectionData(tenantId);

		if (!allCollections || Object.keys(allCollections).length === 0) {
			return json({ valid: 0, invalid: 0, warnings: [], tenantId });
		}

		const warnings: string[] = [];
		let validCollections = 0;
		let invalidCollections = 0;

		for (const [, collection] of Object.entries(allCollections)) {
			if (!collection.fields) {
				validCollections++;
				continue;
			}

			let collectionValid = true;
			const missingWidgets: string[] = [];

			for (const field of collection.fields) {
				if (field && typeof field === 'object' && 'type' in field && field.type) {
					const widgetType = String(field.type);
					const capitalizedWidget = widgetType.charAt(0).toUpperCase() + widgetType.slice(1);

					if (!activeWidgets.includes(capitalizedWidget)) {
						missingWidgets.push(capitalizedWidget);
						collectionValid = false;
					}
				}
			}

			if (collectionValid) {
				validCollections++;
			} else {
				invalidCollections++;
				warnings.push(`Collection "${collection.name || collection._id}" requires inactive widgets: ${missingWidgets.join(', ')}`);
			}
		}

		logger.debug('Validated collections against widgets', {
			tenantId,
			total: Object.keys(allCollections).length,
			valid: validCollections,
			invalid: invalidCollections,
			warnings: warnings.length
		});

		return json({
			valid: validCollections,
			invalid: invalidCollections,
			warnings,
			total: Object.keys(allCollections).length,
			tenantId
		});
	} catch (err) {
		const message = `Failed to validate collections against widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, message);
	}
};
