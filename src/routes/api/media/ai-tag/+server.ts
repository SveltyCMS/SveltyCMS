/**
 * @file src/routes/api/media/ai-tag/+server.ts
 * @description API endpoint for generating AI-powered tags for images using local Ollama.
 */

import { dbAdapter } from '@src/databases/db';
import type { MediaItem } from '@src/databases/dbInterface';
import { aiService } from '@src/services/AIService';
import { getPrivateSetting } from '@src/services/settingsService';
import { getFile } from '@src/utils/media/mediaStorage.server';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { mediaId } = await request.json();

	if (!mediaId) {
		throw error(400, 'mediaId is required.');
	}

	try {
		// 0. Check if AI tagging is enabled
		const useAi = await getPrivateSetting('USE_AI_TAGGING');
		if (!useAi) {
			throw error(400, 'AI Tagging is currently disabled. Please enable it in System Settings and configure your AI API endpoint.');
		}

		// 1. Fetch the media item from the database
		if (!dbAdapter) {
			throw error(500, 'Database adapter is not initialized.');
		}
		const mediaResult = await dbAdapter.crud.findOne<MediaItem>('MediaItem', { _id: mediaId as any });
		if (!(mediaResult.success && mediaResult.data)) {
			throw error(404, 'Media item not found.');
		}
		const mediaItem = mediaResult.data;

		// 2. Ensure it's an image
		if (!mediaItem.mimeType.startsWith('image/')) {
			throw error(400, 'AI tagging is only available for images.');
		}

		// 3. Get the file buffer
		let buffer: Buffer;
		try {
			buffer = await getFile(mediaItem.path);
		} catch (err) {
			logger.error(`Failed to read file for AI tagging: ${mediaItem.path}`, err);
			throw error(500, 'Failed to read media file for analysis.');
		}

		// 4. Call the real AI tagging service
		logger.info(`Generating AI tags for media: ${mediaItem._id} (${mediaItem.filename})`);
		const aiTags = await aiService.tagImage(buffer);

		if (!aiTags || aiTags.length === 0) {
			return json({ success: true, message: 'AI model could not generate tags for this image.', data: mediaItem });
		}

		// 5. Update the media item's metadata with the new tags
		// We store AI generated tags in a separate field 'aiTags' for user review
		const existingAiTags = (mediaItem.metadata?.aiTags as string[]) || [];
		const uniqueNewTags = aiTags.filter((tag) => !existingAiTags.includes(tag.toLowerCase()));

		if (uniqueNewTags.length === 0 && existingAiTags.length > 0) {
			return json({ success: true, message: 'AI tags already exist.', data: mediaItem });
		}

		const updatedAiTags = Array.from(new Set([...existingAiTags, ...aiTags]));

		const updateResult = await dbAdapter.crud.update<MediaItem>('MediaItem', mediaItem._id, {
			metadata: {
				...mediaItem.metadata,
				aiTags: updatedAiTags
			}
		});

		if (!updateResult.success) {
			throw new Error('Failed to save new tags to the database.');
		}

		// 6. Return the updated media item
		return json({
			success: true,
			message: `Successfully generated ${aiTags.length} AI-powered tags.`,
			data: updateResult.data
		});
	} catch (err) {
		logger.error(`Failed to generate AI tags for mediaId: ${mediaId}`, err);
		if (err instanceof Error && 'status' in (err as any)) {
			throw err;
		}
		throw error(500, 'An unexpected error occurred while generating AI tags.');
	}
};
