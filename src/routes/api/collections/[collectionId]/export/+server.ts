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

import { contentManager } from '@src/content/content-manager';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

// Helper for CSV conversion
function convertToCSV(data: unknown[]): string {
	if (!data || data.length === 0) {
		return '';
	}
	const allKeys = new Set<string>();
	for (const item of data) {
		if (item && typeof item === 'object') {
			for (const key of Object.keys(item as Record<string, unknown>)) {
				allKeys.add(key);
			}
		}
	}
	const headers = Array.from(allKeys);
	const csvRows = [
		headers.map((header) => `"${header}"`).join(','),
		...data.map((item) => {
			const record = item as Record<string, unknown>;
			return headers
				.map((header) => {
					const value = record[header];
					if (value === null || value === undefined) {
						return '""';
					}
					return `"${String(value).replace(/"/g, '""')}"`;
				})
				.join(',');
		})
	];
	return csvRows.join('\n');
}

export const GET = apiHandler(async ({ params, url, locals }) => {
	const { collectionId } = params;
	const { user, dbAdapter } = locals;

	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}
	if (!dbAdapter) {
		throw new AppError('Database adapter not initialized', 500, 'DB_ERROR');
	}

	const schema = await contentManager.getCollection(collectionId);
	if (!schema) {
		throw new AppError(`Collection '${collectionId}' not found`, 404, 'NOT_FOUND');
	}

	const format = url.searchParams.get('format') || 'json';
	const limit = Number.parseInt(url.searchParams.get('limit') || '0', 10);
	const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
	const filterParam = url.searchParams.get('filter');
	const sortField = url.searchParams.get('sortField');
	const sortDirection = (url.searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';

	const queryOptions: Record<string, unknown> = {};
	if (limit > 0) {
		queryOptions.limit = Math.min(limit, 10_000);
	}
	if (offset > 0) {
		queryOptions.offset = offset;
	}
	if (sortField) {
		queryOptions.sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };
	}

	let filterQuery = {};
	if (filterParam) {
		try {
			filterQuery = JSON.parse(filterParam);
		} catch (e) {
			logger.warn('Invalid filter', e);
		}
	}

	const result = await dbAdapter.crud.findMany(`collection_${schema._id}`, filterQuery, queryOptions);
	if (!result.success) {
		throw new AppError(`Export failed: ${result.error}`, 500, 'DB_READ_ERROR');
	}

	const exportData = result.data || [];
	logger.info(`Collection ${collectionId} exported`, {
		count: exportData.length,
		format
	});

	if (format === 'csv') {
		const csvData = convertToCSV(exportData);
		return new Response(csvData, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="${collectionId}-export.csv"`
			}
		});
	}
	return json({
		success: true,
		collection: collectionId,
		data: exportData,
		metadata: {
			total: exportData.length,
			offset,
			limit,
			exportedAt: new Date().toISOString(),
			schema: {
				name: schema.name,
				label: schema.label,
				fields: schema.fields?.map((f) => {
					const field = f as any; // Cast once to avoid multiple errors
					return {
						name: field.name,
						type: field.widget,
						label: field.label,
						required: field.required
					};
				})
			}
		}
	});
});
