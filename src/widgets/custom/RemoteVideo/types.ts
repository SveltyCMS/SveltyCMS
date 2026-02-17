/**
 * @file src/widgets/custom/RemoteVideo/types.ts
 * @description Type definitions for the RemoteVideo widget.
 *
 * @features
 * - **Strongly Typed Data**: Defines a comprehensive `RemoteVideoData` structure for storage.
 * - **Platform Restriction**: `allowedPlatforms` property controls which video hosts are permitted.
 */

/**
 * Defines the types of video platforms supported.
 */
export type VideoPlatform = 'youtube' | 'vimeo' | 'twitch' | 'tiktok' | 'other';

/**
 * Defines the properties unique to the RemoteVideo widget, configured in the collection builder.
 */
export interface RemoteVideoProps {
	/**
	 * An array of allowed video platforms (e.g., ['youtube', 'vimeo']).
	 * If empty, all supported platforms are allowed.
	 */
	allowedPlatforms?: VideoPlatform[];
	// A placeholder for the URL input field
	placeholder?: string;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

/**
 * Defines the data structure for a stored remote video entry.
 * This object contains all fetched metadata.
 */
export interface RemoteVideoData {
	channelTitle?: string; // Uploader's channel name
	description?: string; // Video description (optional)
	duration?: string; // Video duration (e.g., 'PT3M20S' for ISO 8601, or '3:20')
	height?: number; // Thumbnail/embed height
	platform: VideoPlatform; // e.g., 'youtube'
	publishedAt?: string; // ISO 8601 date string
	thumbnailUrl: string; // URL to a high-quality thumbnail
	title: string; // Video title
	url: string; // The original URL provided by the user
	videoId: string; // The extracted video ID (e.g., YouTube's 'dQw4w9WgXcQ')
	width?: number; // Thumbnail/embed width
	// Add other metadata as needed
}
