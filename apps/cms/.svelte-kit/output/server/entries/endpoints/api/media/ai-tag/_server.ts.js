import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
async function getTagsFromAIService(imageUrl) {
	logger.info(`[MOCK] Fetching AI tags for image: ${imageUrl}`);
	const mockTags = ['landscape', 'nature', 'sky', 'mountain', 'travel', 'scenic'];
	await new Promise((resolve) => setTimeout(resolve, 1500));
	return mockTags.slice(0, Math.floor(Math.random() * (mockTags.length + 1)));
}
const POST = async ({ request }) => {
	const { mediaId } = await request.json();
	if (!mediaId) {
		throw error(400, 'mediaId is required.');
	}
	try {
		if (!dbAdapter) {
			throw error(500, 'Database adapter is not initialized.');
		}
		const mediaResult = await dbAdapter.crud.findOne('MediaItem', { _id: mediaId });
		if (!mediaResult.success || !mediaResult.data) {
			throw error(404, 'Media item not found.');
		}
		const mediaItem = mediaResult.data;
		if (!mediaItem.mimeType.startsWith('image/')) {
			throw error(400, 'AI tagging is only available for images.');
		}
		const imageUrl = mediaItem.thumbnails?.lg?.url || mediaItem.path;
		const aiTags = await getTagsFromAIService(imageUrl);
		if (!aiTags || aiTags.length === 0) {
			return json({ success: true, message: 'No new tags were generated.', data: mediaItem });
		}
		const existingTags = mediaItem.metadata.tags || [];
		const uniqueNewTags = aiTags.filter((tag) => !existingTags.includes(tag.toLowerCase()));
		if (uniqueNewTags.length === 0) {
			return json({ success: true, message: 'AI tags already exist.', data: mediaItem });
		}
		const updatedTags = [...existingTags, ...uniqueNewTags];
		const updateResult = await dbAdapter.crud.update('MediaItem', mediaItem._id, {
			metadata: {
				...mediaItem.metadata,
				tags: updatedTags
			}
		});
		if (!updateResult.success) {
			throw new Error('Failed to save new tags to the database.');
		}
		return json({
			success: true,
			message: `Successfully added ${uniqueNewTags.length} new AI-powered tags.`,
			data: updateResult.data
		});
	} catch (err) {
		logger.error(`Failed to generate AI tags for mediaId: ${mediaId}`, err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'An unexpected error occurred while generating AI tags.');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
