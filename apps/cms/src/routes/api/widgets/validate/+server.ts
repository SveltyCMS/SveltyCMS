/**
 * @file src/routes/api/widgets/validate/+server.ts
 * @description API endpoint for validating collections against current widget state
 */
import { contentManager } from '@src/content/ContentManager';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request, url }) => {
	try {
		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;

		// Get active widgets from query params (sent by client)
		const activeWidgetsParam = url.searchParams.get('activeWidgets');
		const activeWidgets = activeWidgetsParam ? activeWidgetsParam.split(',') : [];

		// Get all collections from ContentManager, scoped by tenantId
		const allCollections = contentManager.getCollections();

		if (!allCollections || Object.keys(allCollections).length === 0) {
			return json({ valid: 0, invalid: 0, warnings: [], tenantId });
		}

		const warnings: string[] = [];
		let validCollections = 0;
		let invalidCollections = 0;

		for (const [, collection] of Object.entries(allCollections)) {
			const coll = collection as Record<string, unknown>;
			if (!coll.fields) {
				validCollections++;
				continue;
			}

			let collectionValid = true;
			const missingWidgets: string[] = [];

			for (const field of coll.fields as Array<Record<string, unknown>>) {
				if (field && typeof field === 'object') {
					let widgetType: string | undefined;

					// Modern architecture: get widget name from widget.Name
					if ('widget' in field && field.widget && typeof field.widget === 'object' && 'Name' in field.widget) {
						widgetType = String(field.widget.Name);
					}
					// Legacy compatibility: fallback to type property
					else if ('type' in field && field.type) {
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
				warnings.push(`Collection "${(coll.name as string) || (coll._id as string)}" requires inactive widgets: ${missingWidgets.join(', ')}`);
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
