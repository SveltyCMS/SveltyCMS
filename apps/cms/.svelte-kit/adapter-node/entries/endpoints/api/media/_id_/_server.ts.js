import { d as dbAdapter } from '../../../../../chunks/db.js';
import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { M as MediaService } from '../../../../../chunks/MediaService.server.js';
const mediaCollections = ['MediaItem', 'media_images', 'media_documents', 'media_audio', 'media_videos'];
async function GET({ params }) {
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
					const itemWithCollection = {
						...result.data,
						collection
					};
					return json(itemWithCollection);
				}
			} catch (collectionError) {
				logger.warn(`Error searching for media ${id} in collection ${collection}:`, collectionError);
			}
		}
		logger.warn(`Media item with ID ${id} not found in any collection.`);
		throw error(404, 'Media not found');
	} catch (err) {
		const message = `Error fetching media item ${id}: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal Server Error');
	}
}
async function PATCH({ params, request, locals }) {
	const { id } = params;
	if (!id) throw error(400, 'Media ID is required');
	const { user, roles } = locals;
	if (!user) throw error(401, 'Unauthorized');
	const body = await request.json();
	const { metadata } = body;
	if (!metadata) throw error(400, 'Metadata is required');
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}
	const mediaService = new MediaService(dbAdapter);
	try {
		const existing = await mediaService.getMedia(id, user, roles || []);
		const newMetadata = {
			...(existing.metadata || {}),
			...metadata
		};
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
export { GET, PATCH };
//# sourceMappingURL=_server.ts.js.map
