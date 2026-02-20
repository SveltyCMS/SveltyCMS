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
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import type { RemoteVideoProps } from '@widgets/custom/remote-video/types';
import { getRemoteVideoData } from '@widgets/custom/remote-video/video';

export const POST = apiHandler(async ({ request }) => {
	try {
		// Expect a JSON body instead of FormData for cleaner data handling.
		const { url, allowedPlatforms } = (await request.json()) as {
			url: string;
			allowedPlatforms?: RemoteVideoProps['allowedPlatforms'];
		};

		// Validate the incoming request body.
		if (!url || typeof url !== 'string') {
			logger.warn('API /remoteVideo: Invalid or missing URL in request body.');
			throw new AppError('A valid URL is required.', 400, 'INVALID_URL');
		}

		// All platform-specific parsing and fetching is now handled by this single function.
		const videoData = await getRemoteVideoData(url);

		// Handle cases where the URL is invalid or the platform is unsupported.
		if (!videoData) {
			const errorMsg = 'Could not fetch video metadata. The URL may be invalid or the platform is unsupported.';
			logger.warn(`API /remoteVideo: ${errorMsg}`, { url });
			throw new AppError(errorMsg, 400, 'FETCH_FAILED');
		}

		// SECURITY: Enforce the `allowedPlatforms` rule on the server.
		if (allowedPlatforms && allowedPlatforms.length > 0 && !allowedPlatforms.includes(videoData.platform)) {
			const errorMsg = `The platform '${videoData.platform}' is not permitted for this field.`;
			logger.warn('API /remoteVideo: Forbidden platform.', {
				url,
				platform: videoData.platform,
				allowed: allowedPlatforms
			});
			throw new AppError(errorMsg, 403, 'PLATFORM_FORBIDDEN');
		}

		// On success, return the unified data object.
		logger.info(`API /remoteVideo: Successfully fetched metadata for ${videoData.platform} video.`, { url });
		return json({ success: true, data: videoData });
	} catch (error) {
		// Catch any unexpected errors during processing.
		if (error instanceof AppError) {
			throw error;
		}
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('API /remoteVideo critical error:', { error: errorMessage });
		throw new AppError('An internal server error occurred.', 500, 'INTERNAL_ERROR');
	}
});
