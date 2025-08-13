/**
 * @file src/routes/api/video/+server.ts
 * @description API endpoint for retrieving video information from various platforms.
 *
 * This module provides functionality to:
 * - Extract video information from YouTube, Vimeo, TikTok, and Twitch URLs
 * - Parse and validate video URLs
 * - Fetch video metadata (title, thumbnail, URL) from respective platforms
 *
 * Features:
 * - Support for multiple video platforms (YouTube, Vimeo, TikTok, Twitch)
 * - URL parsing and video ID extraction
 * - Error handling for invalid URLs or API failures
 * - Logging of requests and responses
 *
 * Usage:
 * POST /api/video
 * Body: FormData with 'url' field containing the video URL
 * Returns: JSON object with videoTitle, videoThumbnail, and videoUrl
 *
 * Note: Ensure that necessary API keys or tokens are configured for
 * each supported video platform.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { tiktok, twitch, vimeo, youtube, type YoutubeData } from '@widgets/custom/remoteVideo/video';

// Permission checking

// Define types for each platform's response
interface BaseVideoData {
	videoTitle: string;
	videoThumbnail: string;
	videoUrl: string;
}

interface VimeoData extends BaseVideoData {
	user_name: string;
	upload_date: string;
	duration: string;
	width: string;
	height: string;
}

type TwitchData = BaseVideoData;
type TiktokData = BaseVideoData;

type VideoData = YoutubeData | VimeoData | TwitchData | TiktokData;

// System Logs
import { logger } from '@utils/logger.svelte';

// Extracts the video ID from a YouTube URL
function getYouTubeVideoId(url: string): string | null {
	const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|u\/\w\/|watch\?.+&v=)|youtu\.be\/)([^#&?]+).*$/;
	const match = url.match(regExp);
	return match ? match[1] : null;
}

export const POST: RequestHandler = async ({ request }) => {
	logger.debug('Video info request received');

	try {
		// Authentication is handled by hooks.server.ts - user presence confirms access

		const data = await request.formData();
		const url = data.get('url');

		if (!url || typeof url !== 'string') {
			logger.warn('Invalid or missing URL in request');
			return json({ error: 'Invalid or missing URL' }, { status: 400 });
		}

		const parsedUrl = new URL(decodeURIComponent(url));
		const hostname = parsedUrl.hostname;

		let videoData: VideoData;

		// Use a lookup object to map the URL to the corresponding function
		if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
			const videoId = getYouTubeVideoId(url);
			if (!videoId) {
				throw Error('Invalid YouTube URL');
			}
			videoData = await youtube(videoId);
		} else if (hostname.includes('vimeo.com')) {
			const videoId = parsedUrl.pathname.split('/').pop();
			videoData = await vimeo(videoId);
		} else if (hostname.includes('tiktok.com')) {
			videoData = await tiktok(url);
		} else if (hostname.includes('twitch.tv')) {
			const videoId = parsedUrl.pathname.split('/').pop();
			videoData = await twitch(videoId);
		} else {
			logger.warn('Unsupported video platform', { url });
			return json({ error: 'Unsupported video platform' }, { status: 400 });
		}

		logger.info('Video data retrieved successfully', { platform: hostname });
		return json(videoData);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error processing video URL', { error: errorMessage });
		return json(
			{
				success: false,
				error: `An error occurred while processing the video URL: ${error.message}`
			},
			{ status: 500 }
		);
	}
};
