/**
 * @file src/routes/api/remoteVideo/+server.ts
 * @description Secure, server-side API endpoint for fetching remote video metadata.
 *
 * This endpoint acts as a proxy to external video APIs (YouTube, Vimeo, etc.)
 * to protect private API keys and return a unified data structure.
 *
 * @features
 * - **Unified Data Structure**: Always returns the standard `RemoteVideoData` object.
 * - **Secure**: Keeps all API keys on the server, never exposing them to the client.
 * - **Centralized Logic**: Uses the `getRemoteVideoData` helper for all platform-specific logic.
 * - **Rule Enforcement**: Validates `allowedPlatforms` on the server-side.
 *
 * @usage
 * POST /api/remoteVideo
 * Body (JSON): { url: string, allowedPlatforms?: string[] }
 * Returns: JSON object { success: boolean, data?: RemoteVideoData, error?: string }
 */
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RemoteVideoProps } from '@widgets/custom/remotevideo/types';
import { getRemoteVideoData } from '@widgets/custom/remotevideo/video';

export async function POST({ request }) {
	try {
		// Expect a JSON body instead of FormData for cleaner data handling.
		const { url, allowedPlatforms } = (await request.json()) as {
			url: string;
			allowedPlatforms?: RemoteVideoProps['allowedPlatforms'];
		};

		// Validate the incoming request body.
		if (!url || typeof url !== 'string') {
			logger.warn('API /remoteVideo: Invalid or missing URL in request body.');
			return json({ success: false, error: 'A valid URL is required.' }, { status: 400 });
		}

		// All platform-specific parsing and fetching is now handled by this single function.
		const videoData = await getRemoteVideoData(url);

		// Handle cases where the URL is invalid or the platform is unsupported.
		if (!videoData) {
			const errorMsg = 'Could not fetch video metadata. The URL may be invalid or the platform is unsupported.';
			logger.warn(`API /remoteVideo: ${errorMsg}`, { url });
			return json({ success: false, error: errorMsg }, { status: 400 });
		}

		// SECURITY: Enforce the `allowedPlatforms` rule on the server.
		if (allowedPlatforms && allowedPlatforms.length > 0 && !allowedPlatforms.includes(videoData.platform)) {
			const errorMsg = `The platform '${videoData.platform}' is not permitted for this field.`;
			logger.warn(`API /remoteVideo: Forbidden platform.`, { url, platform: videoData.platform, allowed: allowedPlatforms });
			return json({ success: false, error: errorMsg }, { status: 403 }); // 403 Forbidden
		}

		// On success, return the unified data object.
		logger.info(`API /remoteVideo: Successfully fetched metadata for ${videoData.platform} video.`, { url });
		return json({ success: true, data: videoData });
	} catch (error) {
		// Catch any unexpected errors during processing.
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('API /remoteVideo critical error:', { error: errorMessage });
		return json({ success: false, error: 'An internal server error occurred.' }, { status: 500 });
	}
}
