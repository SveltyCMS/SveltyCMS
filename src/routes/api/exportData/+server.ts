/**
 * @file src/routes/api/exportData/+server.ts
 * @description API endpoint for exporting collection data
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user, roles } = locals;

		// Require authentication
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { collectionName, format = 'json', filter = {}, includeMetadata = false } = body;

		// Validate required parameters
		if (!collectionName) {
			return json({ error: 'Collection name is required' }, { status: 400 });
		}

		// Ensure collection exists (MongoDB throws if missing)
		try {
			await dbAdapter.collection.getModel(collectionName);
		} catch (error) {
			logger.warn(`Collection model not found: ${collectionName}`, { error });
			return json({ error: 'Collection not found' }, { status: 404 });
		}

		// Fetch collection data
		const result = await dbAdapter.crud.findMany(collectionName, filter);

		if (!result.success) {
			logger.error(`Failed to export collection ${collectionName}`, result.error);
			return json({ error: 'Collection not found or access denied' }, { status: 404 });
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
	} catch (error: any) {
		logger.error('Export data error', { error: error.message });
		return json({ error: 'Failed to export data' }, { status: 500 });
	}
};
