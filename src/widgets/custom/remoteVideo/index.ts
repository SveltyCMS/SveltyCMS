/**
 * @file src/widgets/custom/remotevideo/index.ts
 * @description RemoteVideo Widget Definition.
 *
 * Implements a dynamic widget for embedding videos from various remote platforms
 * (YouTube, Vimeo, Twitch, TikTok). Stores rich video metadata and handles
 * server-side API fetching for security and performance.
 *
 * @features
 * - **Structured Metadata**: Stores a comprehensive `RemoteVideoData` object.
 * - **Dynamic Validation**: Ensures URL validity and platform compatibility.
 * - **Server-Side APIs**: Delegates metadata fetching to a server endpoint to protect API keys.
 * - **Configurable Platforms**: `allowedPlatforms` limits video sources.
 * - **GraphQL Schema**: Defines a structured GraphQL type for video data.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import { createWidget } from '@src/widgets/factory';
import { object, string, url, minLength, optional, array, pipe, literal, union, type Input as ValibotInput } from 'valibot';
import type { RemoteVideoProps, RemoteVideoData, VideoPlatform } from './types';
import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';

// Define the validation schema for the RemoteVideoData object.
const RemoteVideoDataSchema = object({
	platform: union([literal('youtube'), literal('vimeo'), literal('twitch'), literal('tiktok'), literal('other')]),
	url: string([url('Must be a valid video URL.')]),
	videoId: string([minLength(1, 'Video ID is required.')]),
	title: string([minLength(1, 'Video title is required.')]),
	thumbnailUrl: string([url('Must be a valid thumbnail URL.')]),
	channelTitle: optional(string()),
	duration: optional(string()),
	width: optional(number()),
	height: optional(number()),
	publishedAt: optional(string())
});

// The dynamic validation schema ensures the input URL matches allowed platforms and has content.
const validationSchema = (field: FieldInstance) => {
	let schema = RemoteVideoDataSchema; // Validate the entire data object.

	// If the field is required, ensure the `url` property is not empty.
	if (field.required) {
		// Use a refine to check if the 'url' inside the data object is non-empty.
		schema = pipe(
			schema,
			refine((data) => data.url.length > 0, 'Video URL is required.')
		);
	}

	// Add platform-specific validation if `allowedPlatforms` is configured.
	if (field.allowedPlatforms && field.allowedPlatforms.length > 0) {
		schema = pipe(
			schema,
			refine((data) => field.allowedPlatforms.includes(data.platform), `Only ${field.allowedPlatforms.join(', ')} videos are allowed.`)
		);
	}

	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const RemoteVideoWidget = createWidget<RemoteVideoProps, ReturnType<typeof validationSchema>>({
	Name: 'RemoteVideo',
	Icon: 'mdi:video-vintage',
	Description: m.widget_remoteVideo_description(),
	inputComponentPath: '/src/widgets/custom/remotevideo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/remotevideo/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		placeholder: 'Enter video URL (YouTube, Vimeo, Twitch, TikTok)',
		allowedPlatforms: ['youtube', 'vimeo', 'twitch', 'tiktok'],
		translated: false // Video metadata is not typically translated per-field.
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false },
		allowedPlatforms: {
			widget: Input, // A multi-select component would be better here in a real CMS.
			required: false,
			helper: "Comma-separated platforms (e.g., 'youtube,vimeo')."
		}
	},

	// Aggregations filter/sort by video title.
	aggregations: {
		filters: async ({ field, filter }) => [{ $match: { [`${field.db_fieldName}.title`]: { $regex: filter, $options: 'i' } } }],
		sorts: async ({ field, sortDirection }) => ({
			[`${field.db_fieldName}.title`]: sortDirection
		})
	},

	// Define the GraphQL schema for the RemoteVideoData object.
	GraphqlSchema: ({ label }) => ({
		typeID: label, // Using the label as the GraphQL type name.
		graphql: `
            type ${label} {
                platform: String!
                url: String!
                videoId: String!
                title: String!
                thumbnailUrl: String!
                channelTitle: String
                duration: String
                width: Int
                height: Int
                publishedAt: String
            }
        `
	})
});

export default RemoteVideoWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RemoteVideoWidget>;
export type RemoteVideoWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
