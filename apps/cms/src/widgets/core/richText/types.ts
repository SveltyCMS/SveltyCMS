/**
 * @file src/widgets/core/richtext/types.ts
 * @description Type definitions for the RichText widget.
 *
 * @features
 * - **Configurable Toolbar**: Defines a type for dynamically enabling toolbar features.
 * - **Clean Data Structure**: Specifies a clear `{ title, content }` object for storage.
 */

// A list of all available toolbar features that can be configured.
export type RichTextToolbarOption =
	| 'bold'
	| 'italic'
	| 'strike'
	| 'underline'
	| 'headings'
	| 'lists'
	| 'link'
	| 'image'
	| 'video'
	| 'table'
	| 'align'
	| 'clear';

// Defines the properties unique to the RichText widget
export interface RichTextProps {
	/**
	 * An array of toolbar features to enable for this editor instance.
	 * An empty array shows no toolbar.
	 */
	toolbar?: RichTextToolbarOption[];
}

// Defines the data structure for the RichText widget's value.
export interface RichTextData {
	title: string;
	content: string; // The sanitized HTML content from the editor.
}
