/**
 * @file src/widgets/custom/remotevideo/types.ts
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
	// A placeholder for the URL input field
	placeholder?: string;

	/**
	 * An array of allowed video platforms (e.g., ['youtube', 'vimeo']).
	 * If empty, all supported platforms are allowed.
	 */
	allowedPlatforms?: VideoPlatform[];

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

/**
 * Defines the data structure for a stored remote video entry.
 * This object contains all fetched metadata.
 */
export interface RemoteVideoData {
	platform: VideoPlatform; // e.g., 'youtube'
	url: string; // The original URL provided by the user
	videoId: string; // The extracted video ID (e.g., YouTube's 'dQw4w9WgXcQ')
	title: string; // Video title
	description?: string; // Video description (optional)
	thumbnailUrl: string; // URL to a high-quality thumbnail
	channelTitle?: string; // Uploader's channel name
	duration?: string; // Video duration (e.g., 'PT3M20S' for ISO 8601, or '3:20')
	width?: number; // Thumbnail/embed width
	height?: number; // Thumbnail/embed height
	publishedAt?: string; // ISO 8601 date string
	// Add other metadata as needed
}
