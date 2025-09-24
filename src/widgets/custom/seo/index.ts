/**
 * @file src/widgets/custom/seo/index.ts
 * @description SEO Widget Definition.
 *
 * An enterprise-grade SEO analysis and optimization tool embedded as a widget.
 *
 * @features
 * - **Comprehensive Validation**: Valibot schema validates the entire SEO data object, including length checks.
 * - **Structured Data**: Stores a single, clean `SeoData` object.
 * - **Configurable Features**: The `features` prop allows tailoring the UI for different needs.
 * - **Translatable**: Fully supports multilingual SEO content.
 */

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { literal, maxLength, object, optional, string, union, type Input } from 'valibot';
import type { SeoProps } from './types';

// Define a robust validation schema for the SeoData object.
const SeoValidationSchema = (field: FieldInstance) => {
	const schema = object({
		title: string([maxLength(60, 'Title should be under 60 characters.')]),
		description: string([maxLength(160, 'Description should be under 160 characters.')]),
		focusKeyword: string(),
		// Advanced
		robotsMeta: string(),
		canonicalUrl: optional(string([url('Must be a valid URL.')])),
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

	// If the field is required, ensure the core fields are not empty.
	if (field.required) {
		return pipe(
			schema,
			refine((data) => data.title.length > 0, { message: 'Title is required.' }),
			refine((data) => data.description.length > 0, { message: 'Description is required.' })
		);
	}

	return optional(schema);
};

// Create the widget definition using the factory.
const SeoWidget = createWidget<SeoProps, ReturnType<typeof validationSchema>>({
	Name: 'SEO',
	Icon: 'tabler:seo',
	Description: m.widget_seo_description(),
	inputComponentPath: '/src/widgets/custom/seo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/seo/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		features: ['social' | 'schema' | 'advanced' | 'ai'],
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
	}
});

export default SeoWidget;

// Export helper types.
export type FieldType = ReturnType<typeof SeoWidget>;
export type SeoWidgetData = Input<ReturnType<typeof validationSchema>>;
