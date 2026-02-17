/**
 * @file src/widgets/custom/Seo/types.ts
 * @description Type definitions for the SEO widget.
 *
 * @features
 * - **Strongly Typed**: Defines a comprehensive `SeoData` structure and configuration options.
 * - **Configurable Features**: Allows enabling/disabling features like AI suggestions or social previews.
 */

// A list of all available features that can be configured.
export type SeoFeature = 'social' | 'schema' | 'advanced' | 'ai';

// Defines the properties unique to the SEO widget, configured in the collection builder
export interface SeoProps {
	/**
	 * An array of advanced features to enable.
	 * @default ['social', 'schema', 'advanced']
	 */
	features?: SeoFeature[];

	// Index signature to satisfy WidgetProps constraint
	[key: string]: unknown;
}

// Defines the complete data structure for a stored SEO entry
export interface SeoData {
	canonicalUrl: string;
	description: string;
	focusKeyword: string;
	ogDescription: string;
	ogImage: string; // Should be a media ID
	// Social
	ogTitle: string;
	// Advanced
	robotsMeta: string; // e.g., 'index, follow'
	// Schema
	schemaMarkup: string; // Stored as a JSON string
	title: string;
	twitterCard: 'summary' | 'summary_large_image';
	twitterDescription: string;
	twitterImage: string; // Should be a media ID
	twitterTitle: string;
}
