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
import { getPrivateSettingSync } from "@src/services/core/settings-service"; // Assuming this is server-side access to private env vars
import { logger } from "@utils/logger"; // Isomorphic logger (works client and server)
import type { RemoteVideoData, VideoPlatform } from "./types";

// Cached version of RemoteVideoData with internal timestamp
interface CachedRemoteVideoData extends RemoteVideoData {
  _cachedAt: number;
}

// Simple in-memory cache for API responses.
const cache = new Map<string, CachedRemoteVideoData>();
const CACHE_TTL = 15 * 60 * 1000; // Cache for 15 minutes.

// Extracts a video ID from a given URL
export function detectPlatform(url: string): { platform: VideoPlatform; id: string } | null {
  const youtubeRegex =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
  const twitchRegex = /(?:twitch\.tv\/videos\/)(\d+)/;
  const tiktokRegex = /(?:tiktok\.com\/@(?:[a-zA-Z0-9._]+)\/video\/(\d+))/;

  let match: RegExpMatchArray | null;

  if ((match = url.match(youtubeRegex))) {
    return { platform: "youtube", id: match[1] };
  }
  if ((match = url.match(vimeoRegex))) {
    return { platform: "vimeo", id: match[1] };
  }
  if ((match = url.match(twitchRegex))) {
    return { platform: "twitch", id: match[1] };
  }
  if ((match = url.match(tiktokRegex))) {
    return { platform: "tiktok", id: match[1] };
  }

  return null; // Unknown platform or invalid URL.
}

// Unified Metadata Normalizer
function normalizeMetadata(
  platform: VideoPlatform,
  videoId: string,
  url: string,
  raw: any,
): RemoteVideoData {
  switch (platform) {
    case "youtube":
      return {
        platform,
        url,
        videoId,
        title: raw.snippet.title,
        description: raw.snippet.description,
        thumbnailUrl: raw.snippet.thumbnails.high?.url || raw.snippet.thumbnails.default?.url || "",
        channelTitle: raw.snippet.channelTitle,
        publishedAt: raw.snippet.publishedAt,
        duration: raw.contentDetails.duration,
        width: raw.snippet.thumbnails.high?.width,
        height: raw.snippet.thumbnails.high?.height,
      };
    case "vimeo":
      return {
        platform,
        url,
        videoId,
        title: raw.title,
        description: raw.description,
        thumbnailUrl: raw.thumbnail_large,
        channelTitle: raw.user_name,
        publishedAt: raw.upload_date,
        duration: String(raw.duration),
        width: raw.width,
        height: raw.height,
      };
    case "twitch":
      return {
        platform,
        url,
        videoId,
        title: raw.title,
        description: raw.description,
        thumbnailUrl: raw.thumbnail_url?.replace("%{width}", "640").replace("%{height}", "360"),
        channelTitle: raw.user_name,
        publishedAt: raw.created_at,
        duration: raw.duration,
      };
    case "tiktok":
      return {
        platform,
        url,
        videoId,
        title: raw.title || "",
        description: "", // TikTok oEmbed doesn't provide description easily
        thumbnailUrl: raw.thumbnail_url || "",
        channelTitle: raw.author_name || "",
        width: raw.width,
        height: raw.height,
      };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Strategy Pattern for Platform Handlers
const platformHandlers: Record<VideoPlatform, (id: string, url: string) => Promise<any>> = {
  youtube: async (id) => {
    const googleApiKey = getPrivateSettingSync("GOOGLE_API_KEY");
    if (!googleApiKey) throw new Error("GOOGLE_API_KEY missing");
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${googleApiKey}`,
    );
    const data = await res.json();
    return data.items?.[0] || null;
  },
  vimeo: async (id) => {
    const res = await fetch(`https://vimeo.com/api/v2/video/${id}.json`);
    const data = await res.json();
    return data?.[0] || null;
  },
  twitch: async (id) => {
    const twitchToken = getPrivateSettingSync("TWITCH_TOKEN");
    const twitchClientId = getPrivateSettingSync("TWITCH_CLIENT_ID");
    if (!(twitchToken && twitchClientId)) throw new Error("Twitch credentials missing");
    const res = await fetch(`https://api.twitch.tv/helix/videos?id=${id}`, {
      headers: {
        "Client-ID": twitchClientId,
        Authorization: `Bearer ${twitchToken}`,
      },
    });
    const data = await res.json();
    return data.data?.[0] || null;
  },
  tiktok: async (_, url) => {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    return res.ok ? await res.json() : null;
  },
  other: async () => null,
};

/**
 * Fetches unified RemoteVideoData for a given video URL.
 * Designed for server-side execution.
 */
export async function getRemoteVideoData(url: string): Promise<RemoteVideoData | null> {
  const parsed = detectPlatform(url);
  if (!parsed) return null;

  const cacheKey = `${parsed.platform}-${parsed.id}`;
  const cached = cache.get(cacheKey);
  if (cached?._cachedAt && Date.now() - cached._cachedAt < CACHE_TTL) {
    return cached;
  }

  try {
    const handler = platformHandlers[parsed.platform];
    if (!handler) return null;

    const rawMetadata = await handler(parsed.id, url);
    if (!rawMetadata) return null;

    const result: CachedRemoteVideoData = {
      ...normalizeMetadata(parsed.platform, parsed.id, url, rawMetadata),
      _cachedAt: Date.now(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    logger.error(`Failed to fetch metadata for ${url}:`, error);
    return null;
  }
}

export { formatIsoDuration } from "@utils/date";
