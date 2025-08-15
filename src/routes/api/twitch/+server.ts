/**
 * @file src/routes/api/twitch/+server.ts
 * @description Server-side API endpoint for Twitch video data
 *
 * This endpoint handles Twitch API calls server-side to keep API tokens secure.
 */

import { json } from '@sveltejs/kit';
import { config, getTwitchToken } from '@src/lib/config.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Initialize configuration service
		await config.initialize();

		const videoId = url.searchParams.get('id');

		if (!videoId) {
			return json({ error: 'Video ID is required' }, { status: 400 });
		}

		const twitchToken = await getTwitchToken();
		if (!twitchToken) {
			return json({ error: 'Twitch token not configured' }, { status: 500 });
		}

		const response = await fetch(`https://api.twitch.tv/helix/videos?id=${videoId}`, {
			headers: {
				'Client-ID': 'vdsqv7peymxi12vb3pgut0lk4ca9oc',
				Authorization: `Bearer ${twitchToken}`
			}
		});

		const data = await response.json();

		if (!(data?.data?.length > 0)) {
			return json({
				videoTitle: 'Invalid URL',
				videoThumbnail: '',
				videoUrl: ''
			});
		}

		return json({
			videoTitle: data?.data[0]?.title,
			videoThumbnail: data?.data[0]?.thumbnail_url,
			videoUrl: `https://www.twitch.tv/videos/${videoId}`
		});
	} catch (error) {
		console.error('Twitch API error:', error);
		return json({ error: 'Failed to fetch Twitch video data' }, { status: 500 });
	}
};
