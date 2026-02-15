/**
 * @file src/routes/api/media/[id]/+server.ts
 * @description API endpoint to retrieve a single media item by its ID.
 *
 * @param {string} id - The ID of the media item to retrieve.
 * @returns {Promise<Response>} - The media item as a JSON response.
 *
 * Features:
 * - Retrieves a single media item by its ID.
 * - Searches for the media item in multiple collections.
 * - Returns the media item as a JSON response.
 * - Logs errors and returns appropriate error responses.
 */

import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { MediaService } from '@src/services/MediaService.server';

async function getDbAdapter() {
	const { dbAdapter } = await import('@src/databases/db');
	return dbAdapter;
}

export async function GET({ params, locals }) {
	const { id } = params;

	const { user, roles } = locals;

	if (!id) {
		throw error(400, 'Media ID is required');
	}

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const dbAdapter = await getDbAdapter();

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');

		throw error(500, 'Internal Server Error');
	}

	const mediaService = new MediaService(dbAdapter);

	try {
		// Use mediaService.getMedia to enforce ownership/admin access control

		const media = await mediaService.getMedia(id, user, roles || []);

		return json(media);
	} catch (err) {
		const message = `Error fetching media item ${id}: ${err instanceof Error ? err.message : String(err)}`;

		logger.error(message);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		throw error(500, 'Internal Server Error');
	}
}

export async function PATCH({ params, request, locals }) {
	const { id } = params;

	if (!id) throw error(400, 'Media ID is required');

	const { user, roles } = locals;

	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();

	const { metadata } = body;

	if (!metadata) throw error(400, 'Metadata is required');

	const dbAdapter = await getDbAdapter();

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');

		throw error(500, 'Internal Server Error');
	}

	const mediaService = new MediaService(dbAdapter);

	try {
		// 1. Get existing media to check access and merge metadata
		const existing = await mediaService.getMedia(id, user, roles || []);

		// 2. Merge metadata
		const newMetadata = {
			...(existing.metadata || {}),
			...metadata
		};

		// 3. Update
		await mediaService.updateMedia(id, { metadata: newMetadata });

		return json({ success: true, data: { ...existing, metadata: newMetadata } });
	} catch (err) {
		logger.error(`Error updating media ${id}:`, err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal Server Error');
	}
}
