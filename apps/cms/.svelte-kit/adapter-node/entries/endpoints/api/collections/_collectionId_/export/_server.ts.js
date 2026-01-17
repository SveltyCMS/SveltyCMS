import { error, json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../../../chunks/db.js';
import { contentManager } from '../../../../../../chunks/ContentManager.js';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const GET = async ({ params, url, locals }) => {
	const startTime = performance.now();
	const { collectionId } = params;
	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}
		const schema = await contentManager.getCollection(collectionId);
		if (!schema) {
			throw error(404, `Collection '${collectionId}' not found`);
		}
		const format = url.searchParams.get('format') || 'json';
		const limit = parseInt(url.searchParams.get('limit') || '0');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const filter = url.searchParams.get('filter');
		const sortField = url.searchParams.get('sortField');
		const sortDirection = url.searchParams.get('sortDirection') || 'desc';
		const queryOptions = {};
		if (limit > 0) {
			queryOptions.limit = Math.min(limit, 1e4);
		}
		if (offset > 0) {
			queryOptions.offset = offset;
		}
		if (sortField) {
			queryOptions.sort = { [sortField]: sortDirection === 'asc' ? 1 : -1 };
		}
		let filterQuery = {};
		if (filter) {
			try {
				filterQuery = JSON.parse(filter);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				logger.warn('Invalid filter format', { filter, error: errorMsg });
			}
		}
		logger.trace(`Exporting collection ${collectionId}`, {
			userId: locals.user._id,
			format,
			limit,
			offset,
			filter: filterQuery
		});
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}
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
		if (format === 'csv') {
			const csvData = convertToCSV(exportData);
			return new Response(csvData, {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="${collectionId}-export.csv"`
				}
			});
		} else {
			return json({
				success: true,
				collection: collectionId,
				data: exportData,
				metadata: {
					total: exportData.length,
					offset,
					limit,
					exportedAt: /* @__PURE__ */ new Date().toISOString(),
					schema: {
						name: schema.name,
						label: schema.label,
						fields: schema.fields?.map((f) => {
							const field = f;
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
		}
	} catch (err) {
		const duration = performance.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		logger.error(`Collection export failed for ${collectionId}`, {
			userId: locals.user?._id,
			error: errorMsg,
			duration: `${duration.toFixed(2)}ms`
		});
		if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
			throw err;
		}
		throw error(500, `Export failed: ${errorMsg}`);
	}
};
function convertToCSV(data) {
	if (!data || data.length === 0) {
		return '';
	}
	const allKeys = /* @__PURE__ */ new Set();
	data.forEach((item) => {
		if (item && typeof item === 'object') {
			Object.keys(item).forEach((key) => allKeys.add(key));
		}
	});
	const headers = Array.from(allKeys);
	const csvRows = [
		// Header row
		headers.map((header) => `"${header}"`).join(','),
		// Data rows
		...data.map((item) => {
			const record = item;
			return headers
				.map((header) => {
					const value = record[header];
					if (value === null || value === void 0) {
						return '""';
					}
					const stringValue = String(value).replace(/"/g, '""');
					return `"${stringValue}"`;
				})
				.join(',');
		})
	];
	return csvRows.join('\n');
}
export { GET };
//# sourceMappingURL=_server.ts.js.map
