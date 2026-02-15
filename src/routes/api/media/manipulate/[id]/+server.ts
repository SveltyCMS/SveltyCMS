/**
 * @file src/routes/api/media/manipulate/[id]/+server.ts
 * @description API endpoint for manipulating media files (e.g., focal point, watermark).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MediaService } from '@src/services/MediaService.server';
import { logger } from '@utils/logger.server';

// Helper function to get MediaService instance
async function getMediaService(): Promise<MediaService> {
	const { dbAdapter } = await import('@src/databases/db');
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { user, tenantId } = locals;
	const { id } = params;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (!id) {
		return json({ success: false, error: 'Media ID not specified' }, { status: 400 });
	}

	try {
		const manipulations = await request.json();

		if (!manipulations || typeof manipulations !== 'object' || Object.keys(manipulations).length === 0) {
			return json({ success: false, error: 'Invalid manipulation data: no manipulations provided' }, { status: 400 });
		}

		const mediaService = await getMediaService();

		// Use manipulateMedia to apply Sharp transformations
		const updatedMedia = await mediaService.manipulateMedia(id, manipulations, user._id);

		return json({
			success: true,
			data: updatedMedia
		});
	} catch (err) {
		const message = `Error manipulating media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { mediaId: id, tenantId });
		return json({ success: false, error: message }, { status: 500 });
	}
};
