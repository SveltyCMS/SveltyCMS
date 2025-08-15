/**
 * @file src/routes/api/youtube/+server.ts
 * @description Server-side API endpoint for YouTube video data
 *
 * This endpoint handles YouTube API calls server-side to keep API keys secure.
 */

import { json } from '@sveltejs/kit';
import { config, getGoogleApiKey } from '@src/lib/config.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Initialize configuration service
		await config.initialize();

		const videoId = url.searchParams.get('id');

		if (!videoId) {
			return json({ error: 'Video ID is required' }, { status: 400 });
		}

		const apiKey = await getGoogleApiKey();
		if (!apiKey) {
			return json({ error: 'YouTube API key not configured' }, { status: 500 });
		}

		// Fetch video snippet data
		const snippetResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
		const snippetData = await snippetResponse.json();

		// Fetch video content details (for duration)
		const durationResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${apiKey}`);
		const durationData = await durationResponse.json();

		if (!(snippetData?.items?.length > 0 || durationData?.items?.length > 0)) {
			return json({
				videoTitle: 'Invalid URL',
				videoThumbnail: '',
				videoUrl: '',
				channelTitle: '',
				publishedAt: '',
				width: '',
				height: '',
				duration: ''
			});
		}

		const videoTitle = snippetData?.items[0]?.snippet?.title ?? '';
		const videoThumbnail = snippetData?.items[0]?.snippet?.thumbnails?.high?.url ?? '';
		const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const channelTitle = snippetData?.items[0]?.snippet?.channelTitle ?? '';
		const publishedAt = snippetData?.items[0]?.snippet?.publishedAt ?? '';

		// Convert ISO 8601 duration format to readable time
		const time = durationData?.items[0]?.contentDetails?.duration ?? '';
		function convertDuration(duration: string) {
			const dayTime = duration.split('T');
			const dayDuration = dayTime[0].replace('P', '');
			let dayList = dayDuration.split('D');
			let day: number;
			if (dayList.length === 2) {
				day = parseInt(dayList[0], 10) * 60 * 60 * 24;
				dayList = dayList[1];
			} else {
				day = 0;
				dayList = dayList[0];
			}
			let hourList = dayTime[1].split('H');
			let hour: number;
			if (hourList.length === 2) {
				hour = parseInt(hourList[0], 10) * 60 * 60;
				hourList = hourList[1];
			} else {
				hour = 0;
				hourList = hourList[0];
			}
			let minuteList = hourList.split('M');
			let minute: number;
			if (minuteList.length === 2) {
				minute = parseInt(minuteList[0], 10) * 60;
				minuteList = minuteList[1];
			} else {
				minute = 0;
				minuteList = minuteList[0];
			}
			const secondList = minuteList.split('S');
			let second: number;
			if (secondList.length === 2) {
				second = parseInt(secondList[0], 10);
			} else {
				second = 0;
			}
			return new Date((day + hour + minute + second) * 1000).toISOString().substr(11, 8);
		}

		const duration = convertDuration(time);
		const width = snippetData?.items[0]?.snippet?.thumbnails?.high?.width ?? '';
		const height = snippetData?.items[0]?.snippet?.thumbnails?.high?.height ?? '';

		return json({
			videoTitle,
			videoThumbnail,
			videoUrl,
			channelTitle,
			publishedAt,
			width,
			height,
			duration
		});
	} catch (error) {
		console.error('YouTube API error:', error);
		return json({ error: 'Failed to fetch YouTube video data' }, { status: 500 });
	}
};
