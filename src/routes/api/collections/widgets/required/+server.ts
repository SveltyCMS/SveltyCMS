/**
 * @file src/routes/api/collections/widgets/required/+server.ts
 * @description API endpoint for getting widgets required by collections
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@src/content/ContentManager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	try {
		// Get all collections from ContentManager, scoped by tenantId
		const { collections: allCollections } = await contentManager.getCollectionData(tenantId);

		if (!allCollections || Object.keys(allCollections).length === 0) {
			logger.debug('No collections found', { tenantId });
			return json({ requiredWidgets: [], collectionsAnalyzed: 0, tenantId });
		}

		// Extract widget types from all collection fields
		const requiredWidgets: string[] = [];
		const widgetSet = new Set<string>();

		for (const collection of Object.values(allCollections)) {
			if (!collection.fields) continue;

			for (const field of collection.fields) {
				if (field && typeof field === 'object' && 'type' in field && field.type) {
					const widgetType = String(field.type);
					// Capitalize the widget name to match the store convention
					const capitalizedWidget = widgetType.charAt(0).toUpperCase() + widgetType.slice(1);
					widgetSet.add(capitalizedWidget);
				}
			}
		}

		requiredWidgets.push(...Array.from(widgetSet));

		const duration = performance.now() - start;
		logger.debug('Analyzed collection widget dependencies', {
			tenantId,
			collectionsCount: Object.keys(allCollections).length,
			requiredWidgets: requiredWidgets.length,
			widgets: requiredWidgets,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			requiredWidgets,
			collectionsAnalyzed: Object.keys(allCollections).length,
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
