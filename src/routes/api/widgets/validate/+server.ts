/**
 * @file src/routes/api/widgets/validate/+server.ts
 * @description API endpoint for validating collections and widget integrity
 */
import { contentManager } from '@src/content/content-manager';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';

// Helper to calculate file processing hash (Placeholder for future implementation)
// async function calculateWidgetHash(widgetName: string): Promise<string | null> { ... }

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ locals, request, url }) => {
	const start = performance.now();
	const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId || 'default';

	try {
		// Get active widgets from query params (sent by client)
		const activeWidgetsParam = url.searchParams.get('activeWidgets');
		const activeWidgets = activeWidgetsParam ? activeWidgetsParam.split(',') : [];

		logger.info('[API] Validation request started', {
			tenantId,
			activeWidgetsCount: activeWidgets.length
		});

		// Get all collections from ContentManager, scoped by tenantId
		const allCollections = contentManager.getCollections();

		if (!allCollections || Object.keys(allCollections).length === 0) {
			return json({
				success: true,
				data: {
					valid: 0,
					invalid: 0,
					warnings: [],
					tenantId,
					integrityIssues: []
				},
				message: 'No collections found to validate'
			});
		}

		const warnings: string[] = [];
		const integrityIssues: string[] = [];
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

			for (const field of coll.fields as Record<string, unknown>[]) {
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

		// Security: Integrity Check (Placeholder for now)
		// We would loop through active widgets and verify their signatures
		if (activeWidgets.length > 0) {
			// Example integrity check logic
			// for (const widget of activeWidgets) {
			// 	const hash = await calculateWidgetHash(widget);
			// 	if (!hash) integrityIssues.push(`Integrity check failed for ${widget}`);
			// }
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
		logger.error(message, {
			duration: `${duration.toFixed(2)}ms`,
			stack: err instanceof Error ? err.stack : undefined
		});
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(message, 500, 'VALIDATION_FAILED');
	}
});
