import { json, type RequestHandler } from '@sveltejs/kit';
import getVideoId from 'get-video-id';
import { tiktok, twitch, vimeo, youtube } from '$src/components/widgets/remoteVideo/video';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.formData();
	const res = Object.fromEntries(data);
	const url = res.url.toString();
	const { id, service } = getVideoId(url);

	if (service === 'youtube') {
		const data = await youtube(id || '');
		return json({
			videoTitle: data?.videoTitle,
			videoThumbnail: data?.videoThumbnail,
			videoUrl: data?.videoUrl,
			user_name: data?.channelTitle,
			upload_date: data?.publishedAt,
			duration: data?.duration,
			width: data?.width,
			height: data?.height
		});
	} else if (service === 'vimeo') {
		const data = await vimeo(id || '');
		return json({
			videoTitle: data?.videoTitle,
			videoThumbnail: data?.videoThumbnail,
			videoUrl: data?.videoUrl,
			user_name: data?.user_name,
			upload_date: data?.upload_date,
			duration: data?.duration,
			width: data?.width,
			height: data?.height
		});
	} else if (service === 'tiktok') {
		const data = await tiktok(url);
		return json({
			videoTitle: data?.videoTitle,
			videoThumbnail: data?.videoThumbnail,
			videoUrl: data?.videoUrl
		});
	} else if (url.includes('twitch.tv')) {
		const id = url.split('/').pop();
		const data = await twitch(id || '');
		return json({
			videoTitle: data?.videoTitle,
			videoThumbnail: data?.videoThumbnail,
			videoUrl: data?.videoUrl
		});
	} else {
		return json({
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: ''
		});
	}
};
