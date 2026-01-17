import { json } from '@sveltejs/kit';
import { l as logger$1 } from '../../../../chunks/logger.server.js';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { logger } from '../../../../chunks/logger.js';
const cache = /* @__PURE__ */ new Map();
const CACHE_TTL = 15 * 60 * 1e3;
function extractVideoId(url) {
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
	return null;
}
async function fetchYouTubeMetadata(videoId) {
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
			duration: item.contentDetails.duration,
			// ISO 8601 duration
			width: item.snippet.thumbnails.high?.width,
			height: item.snippet.thumbnails.high?.height
		};
	} catch (error) {
		logger.error(`Failed to fetch YouTube metadata for ID ${videoId}:`, error);
		return null;
	}
}
async function fetchVimeoMetadata(videoId) {
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
			duration: item.duration,
			// Duration in seconds
			width: item.width,
			height: item.height
		};
	} catch (error) {
		logger.error(`Failed to fetch Vimeo metadata for ID ${videoId}:`, error);
		return null;
	}
}
async function fetchTwitchMetadata(videoId) {
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
			duration: item.duration,
			// e.g., "1h30m5s"
			publishedAt: item.created_at
		};
	} catch (error) {
		logger.error(`Failed to fetch Twitch metadata for ID ${videoId}:`, error);
		return null;
	}
}
async function fetchTikTokMetadata(url) {
	logger.warn('TikTok metadata fetching is experimental and relies on web scraping which can be unreliable.');
	try {
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
			videoUrl: data.author_url || url,
			// oEmbed gives author URL, use original if not available.
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
async function getRemoteVideoData(url) {
	const parsed = extractVideoId(url);
	if (!parsed) {
		return null;
	}
	const cacheKey = `${parsed.platform}-${parsed.id}`;
	const cached = cache.get(cacheKey);
	if (cached && cached._cachedAt && Date.now() - cached._cachedAt < CACHE_TTL) {
		return cached;
	}
	let metadata = null;
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
			metadata = await fetchTikTokMetadata(url);
			break;
		default:
			return null;
	}
	if (!metadata) {
		return null;
	}
	const result = {
		platform: parsed.platform,
		url: metadata.videoUrl,
		videoId: parsed.id,
		title: metadata.videoTitle,
		thumbnailUrl: metadata.videoThumbnail,
		channelTitle: metadata.channelTitle || metadata.user_name,
		// Handle different field names
		duration: metadata.duration,
		width: metadata.width,
		height: metadata.height,
		publishedAt: metadata.publishedAt,
		_cachedAt: Date.now()
		// Internal cache timestamp
	};
	cache.set(cacheKey, result);
	return result;
}
async function POST({ request }) {
	try {
		const { url, allowedPlatforms } = await request.json();
		if (!url || typeof url !== 'string') {
			logger$1.warn('API /remoteVideo: Invalid or missing URL in request body.');
			return json({ success: false, error: 'A valid URL is required.' }, { status: 400 });
		}
		const videoData = await getRemoteVideoData(url);
		if (!videoData) {
			const errorMsg = 'Could not fetch video metadata. The URL may be invalid or the platform is unsupported.';
			logger$1.warn(`API /remoteVideo: ${errorMsg}`, { url });
			return json({ success: false, error: errorMsg }, { status: 400 });
		}
		if (allowedPlatforms && allowedPlatforms.length > 0 && !allowedPlatforms.includes(videoData.platform)) {
			const errorMsg = `The platform '${videoData.platform}' is not permitted for this field.`;
			logger$1.warn(`API /remoteVideo: Forbidden platform.`, { url, platform: videoData.platform, allowed: allowedPlatforms });
			return json({ success: false, error: errorMsg }, { status: 403 });
		}
		logger$1.info(`API /remoteVideo: Successfully fetched metadata for ${videoData.platform} video.`, { url });
		return json({ success: true, data: videoData });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger$1.error('API /remoteVideo critical error:', { error: errorMessage });
		return json({ success: false, error: 'An internal server error occurred.' }, { status: 500 });
	}
}
export { POST };
//# sourceMappingURL=_server.ts.js.map
