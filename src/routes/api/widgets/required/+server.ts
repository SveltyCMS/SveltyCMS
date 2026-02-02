/**
 * @file src/routes/api/widgets/required/+server.ts
 * @description API endpoint for getting widgets required by collections
 */
import { contentManager } from '@src/content/ContentManager';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ locals }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	try {
		// Get all collections from ContentManager, scoped by tenantId
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
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : undefined });
		if (err instanceof AppError) throw err;
		throw new AppError(message, 500, 'DEPENDENCY_ANALYSIS_FAILED');
	}
});
