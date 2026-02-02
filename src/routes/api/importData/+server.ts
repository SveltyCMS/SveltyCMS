/**
 * @file src/routes/api/importData/+server.ts
 * @description API endpoint for importing collection data
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = locals;

		// Require authentication
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { collectionName, data, mode = 'merge', duplicateStrategy = 'skip' } = body;

		// Validate required parameters
		if (!collectionName) {
			return json({ error: 'Collection name is required' }, { status: 400 });
		}

		if (!data || !Array.isArray(data)) {
			return json({ error: 'Data must be an array' }, { status: 422 });
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
					const existing = await dbAdapter.crud.findOne(collectionName, { _id: doc._id });
					if (existing.success && existing.data) {
						skipped++;
						continue;
					}
				}

				// Insert or update document (use supported CRUD methods)
				const result = doc._id
					? await dbAdapter.crud.upsert(collectionName, { _id: doc._id }, doc)
					: await dbAdapter.crud.insert(collectionName, doc);
				
				if (result.success) {
					imported++;
				} else {
					errors++;
					logger.warn(`Failed to import document`, { collection: collectionName, error: result.error });
				}
			} catch (error: any) {
				errors++;
				logger.error(`Error importing document`, { error: error.message });
			}
		}

		logger.info(`Import completed for ${collectionName}`, { imported, skipped, errors });

		return json({
			success: true,
			imported,
			skipped,
			errors,
			total: data.length
		});
	} catch (error: any) {
		logger.error('Import data error', { error: error.message });
		return json({ error: 'Failed to import data' }, { status: 500 });
	}
};
