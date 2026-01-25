/**
 * @file src/widgets/custom/Seo/index.ts
 * @description SEO Widget Definition.
 *
 * An SEO analysis and optimization tool embedded as a widget.
 *
 * @features
 * - **Comprehensive Validation**: Valibot schema validates the entire SEO data object, including length checks.
 * - **Structured Data**: Stores a single, clean `SeoData` object.
 * - **Configurable Features**: The `features` prop allows tailoring the UI for different needs.
 * - **Translatable**: Fully supports multilingual SEO content.
 */

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widgetFactory';
import { custom, literal, maxLength, object, optional, pipe, regex, string, transform, union, url, type InferInput as ValibotInput } from 'valibot';

// Import components needed for the GuiSchema
// import Input from '@components/system/inputs/Input.svelte';
// import Toggles from '@components/system/inputs/Toggles.svelte';

// SECURITY: Escape HTML entities to prevent meta tag injection
const escapeHtml = (str: string): string => {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

// Define a robust validation schema for the SeoData object.
const SeoValidationSchema = object({
	title: pipe(string(), maxLength(60, 'Title should be under 60 characters.'), transform(escapeHtml)),
	description: pipe(string(), maxLength(160, 'Description should be under 160 characters.'), transform(escapeHtml)),
	focusKeyword: pipe(string(), transform(escapeHtml)),
	// Advanced
	robotsMeta: pipe(string(), transform(escapeHtml)),
	canonicalUrl: optional(pipe(string(), url('Must be a valid URL.'), regex(/^https?:\/\//, 'Must use HTTP or HTTPS protocol'))),
	// Social
	ogTitle: optional(string()),
	ogDescription: optional(string()),
	ogImage: optional(string()), // ID of a media file
	twitterCard: union([literal('summary'), literal('summary_large_image')]),
	twitterTitle: optional(string()),
	twitterDescription: optional(string()),
	twitterImage: optional(string()), // ID of a media file
	// Schema - SECURITY: Validate JSON structure
	schemaMarkup: optional(
		pipe(
			string(),
			custom((input) => {
				if (!input) return true;
				try {
					const parsed = JSON.parse(input as string);
					// Must be an object, not a string or array at root level
					return typeof parsed === 'object' && !Array.isArray(parsed);
				} catch {
					return false;
				}
			}, 'Must be valid JSON object')
		)
	)
});

// Create the widget definition using the factory.
const SeoWidget = createWidget({
	Name: 'SEO',
	Icon: 'tabler:seo',
	Description: m.widget_seo_description(),
	inputComponentPath: '/src/widgets/custom/Seo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Seo/Display.svelte',
	validationSchema: SeoValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		features: ['social', 'schema', 'advanced', 'ai'],
		translated: true
	},

	// Validation - defines which fields are translatable
	getTranslatablePaths: (basePath: string) => {
		// Return only fields that contribute to the global translation status
		// Exclude technical fields like robotsMeta, canonicalUrl which have defaults
		return [
			`${basePath}.title`,
			`${basePath}.description`,
			`${basePath}.focusKeyword`,
			`${basePath}.ogTitle`,
			`${basePath}.ogDescription`,
			`${basePath}.twitterTitle`,
			`${basePath}.twitterDescription`,
			`${basePath}.schemaMarkup`
		];
	},

	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		translated: { widget: 'Toggles', required: false },
		features: {
			widget: 'Input', // A multi-select component would be better here.
			required: false,
			helper: 'Comma-separated features (social, schema, advanced, ai).'
		}
	},

	// GraphQL schema for SEO (complex object, would need custom type)
	// For now, return String to serialize as JSON
	GraphqlSchema: () => ({
		typeID: 'String', // JSON string representation
		graphql: '' // No custom type definition needed
	})
});

export default SeoWidget;

// Export helper types.
export type FieldType = ReturnType<typeof SeoWidget>;
export type SeoWidgetData = ValibotInput<typeof SeoValidationSchema>;
