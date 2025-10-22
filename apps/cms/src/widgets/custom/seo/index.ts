/**
 * @file src/widgets/custom/seo/index.tconst SeoWidget = createWidget({
	Name: 'SEO',
	Icon: 'tabler:seo',
	Description: m.widget_seo_description(),
	inputComponentPath: '/src/widgets/custom/seo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/seo/Display.svelte',
	validationSchema: SeoValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		features: ['social', 'schema', 'advanced', 'ai'],
		translated: true
	},tion SEO Widget Definition.
 *
 * An SSEO analysis and optimization tool embedded as a widget.
 *
 * @features
 * - **Comprehensive Validation**: Valibot schema validates the entire SEO data object, including length checks.
 * - **Structured Data**: Stores a single, clean `SeoData` object.
 * - **Configurable Features**: The `features` prop allows tailoring the UI for different needs.
 * - **Translatable**: Fully supports multilingual SEO content.
 */

import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { literal, maxLength, object, optional, pipe, string, union, url, type InferInput as ValibotInput } from 'valibot';

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

// Define a robust validation schema for the SeoData object.
const SeoValidationSchema = object({
	title: pipe(string(), maxLength(60, 'Title should be under 60 characters.')),
	description: pipe(string(), maxLength(160, 'Description should be under 160 characters.')),
	focusKeyword: string(),
	// Advanced
	robotsMeta: string(),
	canonicalUrl: optional(pipe(string(), url('Must be a valid URL.'))),
	// Social
	ogTitle: optional(string()),
	ogDescription: optional(string()),
	ogImage: optional(string()), // ID of a media file
	twitterCard: union([literal('summary'), literal('summary_large_image')]),
	twitterTitle: optional(string()),
	twitterDescription: optional(string()),
	twitterImage: optional(string()), // ID of a media file
	// Schema
	schemaMarkup: optional(string()) // Can add `json()` validation if needed
});

// Create the widget definition using the factory.
const SeoWidget = createWidget({
	Name: 'SEO',
	Icon: 'tabler:seo',
	Description: m.widget_seo_description(),
	inputComponentPath: '/src/widgets/custom/seo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/seo/Display.svelte',
	validationSchema: SeoValidationSchema,

	// Set widget-specific defaults.
	defaults: {
		features: ['social', 'schema', 'advanced', 'ai'],
		translated: true
	},

	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		features: {
			widget: Input, // A multi-select component would be better here.
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
