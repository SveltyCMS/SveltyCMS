/**
 * @file src/routes/api/exportData/+server.ts
 * @description API endpoint for exporting collection data
 */

import { dbAdapter } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user } = locals;

	// Require authentication (already handled by hooks but being explicit)
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	const body = await request.json();
	const { collectionName, format = 'json', filter = {}, includeMetadata = false } = body;

	// Validate required parameters
	if (!collectionName) {
		throw new AppError('Collection name is required', 400, 'MISSING_COLLECTION_NAME');
	}

	if (!dbAdapter) {
		throw new AppError('Database adapter not initialized', 500, 'DB_ADAPTER_MISSING');
	}

	// Ensure collection exists
	try {
		await dbAdapter.collection.getModel(collectionName);
	} catch (error) {
		logger.warn(`Collection model not found: ${collectionName}`, { error });
		throw new AppError('Collection not found', 404, 'COLLECTION_NOT_FOUND');
	}

	// Fetch collection data
	const result = await dbAdapter.crud.findMany(collectionName, filter);

	if (!result.success) {
		logger.error(`Failed to export collection ${collectionName}`, result.error);
		throw new AppError('Failed to fetch data for export', 500, 'EXPORT_FETCH_FAILED');
	}

	// Prepare response data
	let responseData: any = result.data;

	// Add metadata if requested
	if (includeMetadata) {
		responseData = {
			metadata: {
				collection: collectionName,
				exportedAt: new Date().toISOString(),
				count: result.data?.length || 0,
				format
			},
			data: result.data
		};
	}

	logger.info(`Exported ${result.data?.length || 0} documents from ${collectionName}`);

	return json(responseData);
});
