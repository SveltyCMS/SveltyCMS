/**
 * @file src/routes/api/media/[id]/+server.ts
 * @description API endpoint to retrieve a single media item by its ID.
 */

import { dbAdapter } from '@src/databases/db';
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';

// List of collections to search for the media item
const mediaCollections = ['MediaItem', 'media_images', 'media_documents', 'media_audio', 'media_videos'];

export async function GET({ params }) {
	const { id } = params;

	if (!id) {
		throw error(400, 'Media ID is required');
	}

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}

	try {
		for (const collection of mediaCollections) {
			try {
				const result = await dbAdapter.crud.findOne(collection, { _id: id });
				if (result.success && result.data) {
					// Attach collection info for context, similar to mediagallery load
					const itemWithCollection = {
						...result.data,
						collection
					};
					return json(itemWithCollection);
				}
			} catch (collectionError) {
				// This can happen if a collection doesn't exist, which is fine.
				logger.warn(`Error searching for media ${id} in collection ${collection}:`, collectionError);
			}
		}

		// If we loop through all collections and find nothing
		logger.warn(`Media item with ID ${id} not found in any collection.`);
		throw error(404, 'Media not found');
	} catch (err) {
		const message = `Error fetching media item ${id}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		// Use the error thrown from the loop (e.g., 404) or a generic 500
		if (err.status) {
			throw err;
		}
		throw error(500, 'Internal Server Error');
	}
}
