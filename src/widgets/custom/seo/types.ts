/**
 * @file src/widgets/custom/seo/types.ts
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
}

// Defines the complete data structure for a stored SEO entry
export interface SeoData {
	title: string;
	description: string;
	focusKeyword: string;
	// Advanced
	robotsMeta: string; // e.g., 'index, follow'
	canonicalUrl: string;
	// Social
	ogTitle: string;
	ogDescription: string;
	ogImage: string; // Should be a media ID
	twitterCard: 'summary' | 'summary_large_image';
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string; // Should be a media ID
	// Schema
	schemaMarkup: string; // Stored as a JSON string
}
