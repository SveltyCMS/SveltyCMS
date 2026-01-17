/**
 * @file src/widgets/custom/RemoteVideo/video.ts
 * @description Centralized utility for fetching remote video metadata from various platforms.
 *
 * This module should primarily be used on the server-side to keep API keys secure.
 *
 * @features
 * - **Platform Agnostic**: Supports YouTube, Vimeo, Twitch, and TikTok.
 * - **Type-Safe Output**: Returns a unified `RemoteVideoData` object.
 * - **Caching**: Implements a simple in-memory cache to reduce redundant API calls.
 * - **Secure**: Designed for server-side execution to protect API keys.
 */
import { getPrivateSettingSync } from '@shared/services/settingsService'; // Assuming this is server-side access to private env vars
import { logger } from '@shared/utils/logger'; // Isomorphic logger (works client and server)
import type { RemoteVideoData, VideoPlatform } from './types';

// Cached version of RemoteVideoData with internal timestamp
interface CachedRemoteVideoData extends RemoteVideoData {
	_cachedAt: number;
}

// Simple in-memory cache for API responses.
const cache = new Map<string, CachedRemoteVideoData>();
const CACHE_TTL = 15 * 60 * 1000; // Cache for 15 minutes.

interface ExternalVideoMetadata {
	videoTitle: string;
	videoThumbnail: string;
	videoUrl: string;
	channelTitle?: string;
	publishedAt?: string;
	width?: number;
	height?: number;
	duration?: string; // ISO 8601 duration
	user_name?: string; // For Vimeo
	upload_date?: string; // For Vimeo
	_cachedAt?: number; // Internal cache timestamp
}

// Extracts a video ID from a given URL
function extractVideoId(url: string): { platform: VideoPlatform; id: string } | null {
	const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
	const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
	const twitchRegex = /(?:twitch\.tv\/videos\/)(\d+)/;
	const tiktokRegex = /(?:tiktok\.com\/@(?:[a-zA-Z0-9._]+)\/video\/(\d+))/;

	let match;

	if ((match = url.match(youtubeRegex))) {
		return { platform: 'youtube', id: match[1] };
	}
	if ((match = url.match(vimeoRegex))) {
		return { platform: 'vimeo', id: match[1] };
	}
	if ((match = url.match(twitchRegex))) {
		return { platform: 'twitch', id: match[1] };
	}
	if ((match = url.match(tiktokRegex))) {
		return { platform: 'tiktok', id: match[1] };
	}

	return null; // Unknown platform or invalid URL.
}

// Fetches YouTube video metadata
async function fetchYouTubeMetadata(videoId: string): Promise<ExternalVideoMetadata | null> {
	const googleApiKey = getPrivateSettingSync('GOOGLE_API_KEY');
	if (!googleApiKey) {
		logger.error('GOOGLE_API_KEY is not set for YouTube metadata fetch.');
		return null;
	}
	const parts = 'snippet,contentDetails';
	const url = `https://www.googleapis.com/youtube/v3/videos?part=${parts}&id=${videoId}&key=${googleApiKey}`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			logger.error(`YouTube API error: ${response.status} ${response.statusText}`);
			return null;
		}
		const data = await response.json();
		const item = data.items?.[0];

		if (!item) {
			return null;
		}

		return {
			videoTitle: item.snippet.title,
			videoThumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
			videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
			channelTitle: item.snippet.channelTitle,
			publishedAt: item.snippet.publishedAt,
			duration: item.contentDetails.duration, // ISO 8601 duration
			width: item.snippet.thumbnails.high?.width,
			height: item.snippet.thumbnails.high?.height
		};
	} catch (error) {
		logger.error(`Failed to fetch YouTube metadata for ID ${videoId}:`, error);
		return null;
	}
}

// Fetches Vimeo video metadata
async function fetchVimeoMetadata(videoId: string): Promise<ExternalVideoMetadata | null> {
	const url = `https://vimeo.com/api/v2/video/${videoId}.json`;
	try {
		const response = await fetch(url);
		if (!response.ok) {
			logger.error(`Vimeo API error: ${response.status} ${response.statusText}`);
			return null;
		}
		const data = await response.json();
		const item = data?.[0];

		if (!item) {
			return null;
		}

		return {
			videoTitle: item.title,
			videoThumbnail: item.thumbnail_large,
			videoUrl: item.url,
			user_name: item.user_name,
			upload_date: item.upload_date,
			duration: item.duration, // Duration in seconds
			width: item.width,
			height: item.height
		};
	} catch (error) {
		logger.error(`Failed to fetch Vimeo metadata for ID ${videoId}:`, error);
		return null;
	}
}

// Fetches Twitch video metadata
async function fetchTwitchMetadata(videoId: string): Promise<ExternalVideoMetadata | null> {
	const twitchToken = getPrivateSettingSync('TWITCH_TOKEN');
	const twitchClientId = getPrivateSettingSync('TWITCH_CLIENT_ID');
	if (!twitchToken || !twitchClientId) {
		logger.error('TWITCH_TOKEN or TWITCH_CLIENT_ID is not set for Twitch metadata fetch.');
		return null;
	}
	const url = `https://api.twitch.tv/helix/videos?id=${videoId}`;
	try {
		const response = await fetch(url, {
			headers: {
				'Client-ID': twitchClientId,
				Authorization: `Bearer ${twitchToken}`
			}
		});
		if (!response.ok) {
			logger.error(`Twitch API error: ${response.status} ${response.statusText}`);
			return null;
		}
		const data = await response.json();
		const item = data.data?.[0];

		if (!item) {
			return null;
		}

		return {
			videoTitle: item.title,
			videoThumbnail: item.thumbnail_url,
			videoUrl: `https://www.twitch.tv/videos/${videoId}`,
			channelTitle: item.user_name,
			duration: item.duration, // e.g., "1h30m5s"
			publishedAt: item.created_at
		};
	} catch (error) {
		logger.error(`Failed to fetch Twitch metadata for ID ${videoId}:`, error);
		return null;
	}
}

/**
 * Fetches TikTok video metadata (requires scraping, which is brittle and not recommended for production).
 * A dedicated TikTok API or oEmbed endpoint would be preferred.
 */
async function fetchTikTokMetadata(url: string): Promise<ExternalVideoMetadata | null> {
	logger.warn('TikTok metadata fetching is experimental and relies on web scraping which can be unreliable.');
	try {
		// Using TikTok's oEmbed endpoint is generally more reliable than scraping.
		// Example: https://www.tiktok.com/oembed?url=https://www.tiktok.com/@scout2015/video/6718335390845095168
		const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
		const response = await fetch(oembedUrl);
		if (!response.ok) {
			logger.warn(`TikTok oEmbed API error: ${response.status} ${response.statusText}`);
			return null;
		}
		const data = await response.json();
		return {
			videoTitle: data.title || '',
			videoThumbnail: data.thumbnail_url || '',
			videoUrl: data.author_url || url, // oEmbed gives author URL, use original if not available.
			channelTitle: data.author_name || '',
			width: data.width,
			height: data.height
			// Duration and publishedAt are often not available via oEmbed for TikTok
		};
	} catch (error) {
		logger.error(`Failed to fetch TikTok metadata for URL ${url}:`, error);
		return null;
	}
}

/**
 * Fetches unified RemoteVideoData for a given video URL.
 * Designed for server-side execution.
 */
export async function getRemoteVideoData(url: string): Promise<RemoteVideoData | null> {
	const parsed = extractVideoId(url);
	if (!parsed) {
		return null;
	}

	const cacheKey = `${parsed.platform}-${parsed.id}`;
	const cached = cache.get(cacheKey);
	if (cached && cached._cachedAt && Date.now() - cached._cachedAt < CACHE_TTL) {
		return cached;
	}

	let metadata: ExternalVideoMetadata | null = null;
	switch (parsed.platform) {
		case 'youtube':
			metadata = await fetchYouTubeMetadata(parsed.id);
			break;
		case 'vimeo':
			metadata = await fetchVimeoMetadata(parsed.id);
			break;
		case 'twitch':
			metadata = await fetchTwitchMetadata(parsed.id);
			break;
		case 'tiktok':
			metadata = await fetchTikTokMetadata(url); // TikTok needs the full URL
			break;
		default:
			return null;
	}

	if (!metadata) {
		return null;
	}

	const result: CachedRemoteVideoData = {
		platform: parsed.platform,
		url: metadata.videoUrl,
		videoId: parsed.id,
		title: metadata.videoTitle,
		thumbnailUrl: metadata.videoThumbnail,
		channelTitle: metadata.channelTitle || metadata.user_name, // Handle different field names
		duration: metadata.duration,
		width: metadata.width,
		height: metadata.height,
		publishedAt: metadata.publishedAt,
		_cachedAt: Date.now() // Internal cache timestamp
	};
	cache.set(cacheKey, result);
	return result;
}

import { formatIsoDuration } from '@shared/utils/dateUtils';
export { formatIsoDuration };
