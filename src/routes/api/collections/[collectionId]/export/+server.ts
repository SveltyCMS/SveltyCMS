/**
 * @file src/routes/api/collections/[collectionId]/export/+server.ts
 * @description API endpoint for exporting data from a specific collection
 *
 * Features:
 * - Export specific collection data
 * - Multiple format support (JSON, CSV)
 * - Filter and pagination options
 * - Permission-based access control
 *
 * Usage:
 * GET /api/collections/{collectionId}/export?format=json&limit=100&offset=0
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Database adapter
import { dbAdapter } from '@src/databases/db';

// Content Management
import { contentManager } from '@src/content/ContentManager';

// Permissions
import { hasCollectionPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const startTime = performance.now();
	const { collectionId } = params;

	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		// Get collection schema
		const { collections } = await contentManager.getCollectionData();
		const schema = collections[collectionId];

		if (!schema) {
			throw error(404, `Collection '${collectionId}' not found`);
		}

		// Check permissions
		if (!hasCollectionPermission(locals.user, 'read', schema)) {
			logger.warn('Collection export permission denied', {
				userId: locals.user._id,
				collectionId,
				userRole: locals.user.role
			});
			throw error(403, 'Forbidden: Insufficient permissions to export this collection');
		}

		// Parse query parameters
		const format = url.searchParams.get('format') || 'json';
		const limit = parseInt(url.searchParams.get('limit') || '0');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const filter = url.searchParams.get('filter');
		const sortField = url.searchParams.get('sortField');
		const sortDirection = (url.searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';

		// Build query options
		const queryOptions: any = {};

		if (limit > 0) {
			queryOptions.limit = Math.min(limit, 10000); // Cap at 10k for safety
		}

		if (offset > 0) {
			queryOptions.offset = offset;
		}

		if (sortField) {
			queryOptions.sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };
		}

		// Build filter
		let filterQuery = {};
		if (filter) {
			try {
				// Simple filter parsing - in production you might want more sophisticated filtering
				filterQuery = JSON.parse(filter);
			} catch (err) {
				logger.warn('Invalid filter format', { filter, error: err.message });
			}
		}

		// Fetch data from collection
		logger.debug(`Exporting collection ${collectionId}`, {
			userId: locals.user._id,
			format,
			limit,
			offset,
			filter: filterQuery
		});

		const result = await dbAdapter.crud.findMany(`collection_${schema._id}`, filterQuery, queryOptions);

		if (!result.success) {
			throw error(500, `Failed to export collection data: ${result.error}`);
		}

		const exportData = result.data || [];
		const duration = performance.now() - startTime;

		logger.info(`Collection ${collectionId} exported successfully`, {
			userId: locals.user._id,
			recordCount: exportData.length,
			duration: `${duration.toFixed(2)}ms`,
			format
		});

		// Return data based on format
		if (format === 'csv') {
			const csvData = convertToCSV(exportData, schema);
			return new Response(csvData, {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="${collectionId}-export.csv"`
				}
			});
		} else {
			// Default to JSON
			return json({
				success: true,
				collection: collectionId,
				data: exportData,
				metadata: {
					total: exportData.length,
					offset: offset,
					limit: limit,
					exportedAt: new Date().toISOString(),
					schema: {
						name: schema.name,
						label: schema.label,
						fields: schema.fields?.map((f) => ({
							name: f.name,
							type: f.widget,
							label: f.label,
							required: f.required
						}))
					}
				}
			});
		}
	} catch (err) {
		const duration = performance.now() - startTime;
		logger.error(`Collection export failed for ${collectionId}`, {
			userId: locals.user?._id,
			error: err.message,
			duration: `${duration.toFixed(2)}ms`
		});

		if (err.status && err.body) {
			throw err;
		}

		throw error(500, `Export failed: ${err.message}`);
	}
};

/**
 * Convert array of objects to CSV format
 */
function convertToCSV(data: any[], schema: any): string {
	if (!data || data.length === 0) {
		return '';
	}

	// Get all unique keys from the data
	const allKeys = new Set<string>();
	data.forEach((item) => {
		Object.keys(item).forEach((key) => allKeys.add(key));
	});

	const headers = Array.from(allKeys);

	// Create CSV content
	const csvRows = [
		// Header row
		headers.map((header) => `"${header}"`).join(','),
		// Data rows
		...data.map((item) =>
			headers
				.map((header) => {
					const value = item[header];
					if (value === null || value === undefined) {
						return '""';
					}
					// Escape quotes and wrap in quotes
					const stringValue = String(value).replace(/"/g, '""');
					return `"${stringValue}"`;
				})
				.join(',')
		)
	];

	return csvRows.join('\n');
}
