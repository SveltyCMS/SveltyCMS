/**
 * @file src/routes/api/widgets/required/+server.ts
 * @description API endpoint for getting widgets required by collections
 */
import { contentManager } from '@src/content/ContentManager';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	try {
		// Get all collections from ContentManager, scoped by tenantId
		const allCollections = await contentManager.getCollections();

		if (!allCollections || Object.keys(allCollections).length === 0) {
			logger.trace('No collections found', { tenantId });
			return json({ requiredWidgets: [], collectionsAnalyzed: 0, tenantId });
		}

		// Extract widget types from all collection fields
		const requiredWidgets: string[] = [];
		const widgetSet = new Set<string>();

		for (const collection of Object.values(allCollections)) {
			if (!collection.fields) continue;

			for (const field of collection.fields) {
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
						// Capitalize the widget name to match the store convention
						const capitalizedWidget = widgetType.charAt(0).toUpperCase() + widgetType.slice(1);
						widgetSet.add(capitalizedWidget);
					}
				}
			}
		}

		requiredWidgets.push(...Array.from(widgetSet));

		const collectionCount = Object.keys(allCollections).length;

		logger.trace('Analyzed collection widget dependencies', {
			tenantId,
			collectionsAnalyzed: collectionCount,
			requiredWidgets: Array.from(requiredWidgets)
		});
		return json({
			requiredWidgets,
			collectionsAnalyzed: collectionCount,
			tenantId
		});
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to analyze collection widget dependencies: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, message);
	}
};
