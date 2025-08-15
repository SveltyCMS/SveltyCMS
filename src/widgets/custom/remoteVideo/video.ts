/**
@file src/widgets/custom/remoteVideo/video.ts
@description - RemoteVideo widget video file.
*/

// Removed direct access to private settings - now using server-side API endpoints

const cache = new Map();

interface YoutubeData {
	videoTitle: string;
	videoThumbnail: string;
	videoUrl: string;
	channelTitle: string;
	publishedAt: string;
	width: string;
	height: string;
	duration: string;
}

export async function youtube(id: string): Promise<YoutubeData> {
	if (cache.has(id)) {
		return cache.get(id)!;
	}

	const response = await fetch(`/api/youtube?id=${id}`);
	const data = await response.json();

	if (data.error) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: '',
			channelTitle: '',
			publishedAt: '',
			width: '',
			height: '',
			duration: ''
		};
	}

	// Server endpoint returns processed data directly
	const result = {
		videoTitle: data.videoTitle,
		videoThumbnail: data.videoThumbnail,
		videoUrl: data.videoUrl,
		channelTitle: data.channelTitle,
		publishedAt: data.publishedAt,
		width: data.width,
		height: data.height,
		duration: data.duration
	};
	cache.set(id, result);
	return result;
}

export async function vimeo(id: string) {
	const vimeoApi = 'https://vimeo.com/api/v2/video/{video_id}.json';

	const response = await fetch(vimeoApi.replace('{video_id}', id));

	if (!response.ok) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: '',
			user_name: '',
			upload_date: '',
			duration: '',
			width: '',
			height: ''
		};
	}
	const data = await response.json();

	return {
		videoTitle: data[0].title,
		videoThumbnail: data[0].thumbnail_large,
		videoUrl: data[0].url,
		user_name: data[0].user_name,
		upload_date: data[0].upload_date,
		duration: data[0].duration,
		width: data[0].width,
		height: data[0].height
	};
}

export async function twitch(id: string) {
	const response = await fetch(`/api/twitch?id=${id}`);
	const data = await response.json();

	if (data.error) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: ''
		};
	}

	return {
		videoTitle: data.videoTitle,
		videoThumbnail: data.videoThumbnail,
		videoUrl: data.videoUrl
	};
}

export async function tiktok(url: string) {
	const response = await fetch(url);
	const data = await response.text();

	if (response.status === 404) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: ''
		};
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(data, 'text/html');

	const titleElement = doc.querySelector('title');
	const videoTitle = titleElement ? titleElement.textContent : '';

	const thumbnailElement = doc.querySelector('.tiktok-j6dmhd-ImgPoster');
	const videoThumbnail = thumbnailElement ? thumbnailElement.getAttribute('src') : '';

	return {
		videoTitle: videoTitle,
		videoThumbnail: videoThumbnail,
		videoUrl: url
	};
}

export async function getTokensProvided() {
	const response = await fetch('/api/getTokensProvided');
	const data = await response.json();

	if (data.error) {
		return {
			tokensProvided: {
				google: false,
				twitch: false
			}
		};
	}

	return data;
}
