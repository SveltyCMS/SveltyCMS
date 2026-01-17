/**
 * @file src/routes/api/media/ai-tag/+server.ts
 * @description API endpoint for generating AI-powered tags for images.
 */

import { json, error } from '@sveltejs/kit';
import { logger } from '@shared/utils/logger.server';
import type { RequestHandler } from './$types';
import type { MediaItem } from '@shared/database/dbInterface';
import { dbAdapter } from '@shared/database/db';

// Mock function for AI service - REPLACE WITH ACTUAL API CALL
async function getTagsFromAIService(imageUrl: string): Promise<string[]> {
	logger.info(`[MOCK] Fetching AI tags for image: ${imageUrl}`);
	// In a real implementation, you would call a service like Google Cloud Vision API here.
	// Example:
	// const vision = require('@google-cloud/vision');
	// const client = new vision.ImageAnnotatorClient();
	// const [result] = await client.labelDetection(imageUrl);
	// const labels = result.labelAnnotations.map(label => label.description);
	// return labels;

	// Returning mock data for demonstration
	const mockTags = ['landscape', 'nature', 'sky', 'mountain', 'travel', 'scenic'];
	await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate network delay
	return mockTags.slice(0, Math.floor(Math.random() * (mockTags.length + 1)));
}

export const POST: RequestHandler = async ({ request }) => {
	const { mediaId } = await request.json();

	if (!mediaId) {
		throw error(400, 'mediaId is required.');
	}

	try {
		// 1. Fetch the media item from the database
		if (!dbAdapter) {
			throw error(500, 'Database adapter is not initialized.');
		}
		const mediaResult = await dbAdapter.crud.findOne<MediaItem>('MediaItem', { _id: mediaId as any });
		if (!mediaResult.success || !mediaResult.data) {
			throw error(404, 'Media item not found.');
		}
		const mediaItem = mediaResult.data;

		// 2. Ensure it's an image
		if (!mediaItem.mimeType.startsWith('image/')) {
			throw error(400, 'AI tagging is only available for images.');
		}

		// 3. Call the AI tagging service (mocked for now)
		// We use the direct public URL of the original image
		const imageUrl = mediaItem.thumbnails?.lg?.url || mediaItem.path;
		const aiTags = await getTagsFromAIService(imageUrl);

		if (!aiTags || aiTags.length === 0) {
			return json({ success: true, message: 'No new tags were generated.', data: mediaItem });
		}

		// 4. Update the media item's metadata with the new tags
		const existingTags = (mediaItem.metadata.tags as string[]) || [];
		const uniqueNewTags = aiTags.filter((tag) => !existingTags.includes(tag.toLowerCase()));

		if (uniqueNewTags.length === 0) {
			return json({ success: true, message: 'AI tags already exist.', data: mediaItem });
		}

		const updatedTags = [...existingTags, ...uniqueNewTags];

		const updateResult = await dbAdapter.crud.update<MediaItem>('MediaItem', mediaItem._id, {
			metadata: {
				...mediaItem.metadata,
				tags: updatedTags
			}
		});

		if (!updateResult.success) {
			throw new Error('Failed to save new tags to the database.');
		}

		// 5. Return the updated media item
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
