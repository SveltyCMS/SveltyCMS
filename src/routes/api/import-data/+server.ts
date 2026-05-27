/**
 * @file src/routes/api/importData/+server.ts
 * @description API endpoint for importing collection data
 */

import { dbAdapter } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user } = locals;

	// Require authentication
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database adapter not initialized', 500, 'DB_ADAPTER_MISSING');
	}

	const body = await request.json();
	const { collectionName, data, mode = 'merge', duplicateStrategy = 'skip' } = body;

	// Validate required parameters
	if (!collectionName) {
		throw new AppError('Collection name is required', 400, 'MISSING_COLLECTION_NAME');
	}

	if (!(data && Array.isArray(data))) {
		throw new AppError('Data must be an array', 422, 'INVALID_DATA_FORMAT');
	}

	let imported = 0;
	let skipped = 0;
	let errors = 0;

	// Handle replace mode
	if (mode === 'replace') {
		// Delete all existing documents
		const deleteResult = await dbAdapter.crud.deleteMany(collectionName, {});
		if (!deleteResult.success) {
			logger.warn(`Failed to clear collection ${collectionName} for replace mode`);
		}
	}

	// Import each document
	for (const doc of data) {
		try {
			// Check for duplicates if strategy is skip
			if (duplicateStrategy === 'skip' && doc._id) {
				const existing = await dbAdapter.crud.findOne(collectionName, {
					_id: doc._id
				});
				if (existing.success && existing.data) {
					skipped++;
					continue;
				}
			}

			// Insert or update document (use supported CRUD methods)
			const result = doc._id ? await dbAdapter.crud.upsert(collectionName, { _id: doc._id }, doc) : await dbAdapter.crud.insert(collectionName, doc);

			if (result.success) {
				imported++;
			} else {
				errors++;
				logger.warn('Failed to import document', {
					collection: collectionName,
					error: result.error
				});
			}
		} catch (error: any) {
			errors++;
			logger.error('Error importing document', { error: error.message });
		}
	}

	logger.info(`Import completed for ${collectionName}`, {
		imported,
		skipped,
		errors
	});

	return json({
		success: true,
		imported,
		skipped,
		errors,
		total: data.length
	});
});
