/**
 * @file src/widgets/core/MediaUpload/types.ts
 * @description Type definitions for the Media widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options and data shapes.
 * - **Extensible**: Easily supports new media types and configurations.
 */

/**
 * Defines the properties unique to the Media widget, configured in the collection builder.
 */
export interface MediaProps {
	/**
	 * Allow the user to select multiple files.
	 * @default false
	 */
	multiupload?: boolean;

	/**
	 * An array of allowed MIME types (e.g., ['image/jpeg', 'image/png', 'video/mp4']).
	 * An empty array allows all types.
	 * @default []
	 */
	allowedTypes?: string[];

	/**
	 * Placeholder text for the add media button.
	 * @default '+ Add Media'
	 */
	placeholder?: string;

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

/**
 * Represents the resolved data of a single media file, fetched from the database.
 * This is used by the Svelte components for displaying previews and metadata.
 */
export interface MediaFile {
	_id: string;
	name: string;
	type: string; // MIME Type
	size: number;
	url: string; // URL to the original file
	thumbnailUrl: string; // URL to a smaller thumbnail
}
