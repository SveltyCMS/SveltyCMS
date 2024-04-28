import { json, type RequestHandler } from '@sveltejs/kit';
import { tiktok, twitch, vimeo, youtube } from '@components/widgets/remoteVideo/video';

// Extracts the video ID from a YouTube URL
function getYouTubeVideoId(url: string) {
	const regExp = /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|u\/\w\/|watch\?.+&v=)([^#&?]+).*$/;
	const match = url.match(regExp);

	return match ? match[1] : null;
}

export const POST: RequestHandler = async ({ request }) => {
	console.log('POST function called', request);

	try {
		const data = await request.formData();
		const res = Object.fromEntries(data);
		const url = res.url.toString();
		// console.log('URL:', url);

		// Use a lookup object to map the URL to the corresponding function
		const videoServices = {
			'youtube.com': youtube,
			'vimeo.com': vimeo,
			'tiktok.com': tiktok,
			'twitch.tv': twitch
		};

		// Use the URL class to parse the URL
		const parsedUrl = new URL(decodeURIComponent(url)); // Decode the URL
		// Get the hostname from the URL
		const hostname = parsedUrl.hostname;

		// Check if the hostname matches any of the video services
		if (videoServices[hostname]) {
			let videoData: any;
			if (hostname === 'youtube.com') {
				const videoId = getYouTubeVideoId(url);
				if (videoId) {
					videoData = await videoServices[hostname](videoId);
				} else {
					throw new Error('Invalid YouTube URL');
				}
			} else {
				videoData = await videoServices[hostname](url);
				console.log('Video Data:', videoData);
			}
			return json(videoData);
			// console.log('json:', json);
		} else {
			return json({
				videoTitle: 'Invalid URL',
				videoThumbnail: '',
				videoUrl: ''
			});
		}
	} catch (error) {
		console.error('Error:', error);
		return json({
			videoTitle: 'An error occurred',
			videoThumbnail: '',
			videoUrl: ''
		});
	}
};
