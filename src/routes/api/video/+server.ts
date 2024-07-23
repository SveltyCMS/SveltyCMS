import { json, type RequestHandler } from '@sveltejs/kit';
import { tiktok, twitch, vimeo, youtube } from '@components/widgets/remoteVideo/video';

// System Logs
import { logger } from '@src/utils/logger';

// Extracts the video ID from a YouTube URL
function getYouTubeVideoId(url: string) {
	const regExp = /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|u\/\w\/|watch\?.+&v=)([^#&?]+).*$/;
	const match = url.match(regExp);

	return match ? match[1] : null;
}

export const POST: RequestHandler = async ({ request }) => {
	logger.debug('POST function called', { request });

	try {
		const data = await request.formData();
		const res = Object.fromEntries(data);
		const url = res.url.toString();
		// Use the URL class to parse the URL
		const parsedUrl = new URL(decodeURIComponent(url));
		// Get the hostname from the URL
		const hostname = parsedUrl.hostname;

		let videoData: any;
		// Use a lookup object to map the URL to the corresponding function

		if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
			const videoId = getYouTubeVideoId(url);
			if (videoId) {
				videoData = await youtube(videoId);
			} else {
				throw new Error('Invalid YouTube URL');
			}
		} else if (hostname.includes('vimeo.com')) {
			const videoId = parsedUrl.pathname.split('/').pop();
			videoData = await vimeo(videoId);
		} else if (hostname.includes('tiktok.com')) {
			videoData = await tiktok(url);
		} else if (hostname.includes('twitch.tv')) {
			const videoId = parsedUrl.pathname.split('/').pop();
			videoData = await twitch(videoId);
		} else {
			return json({
				videoTitle: 'Invalid URL',
				videoThumbnail: '',
				videoUrl: ''
			});
		}
		logger.debug('Video data retrieved successfully', { videoData });
		return json(videoData);
	} catch (error) {
		logger.error('Error processing video URL', error);
		return json({
			videoTitle: 'An error occurred',
			videoThumbnail: '',
			videoUrl: ''
		});
	}
};
