/**
 * @file src/widgets/core/richtext/index.ts
 * @description RichText Widget Definition.
 *
 * Implements a Tiptap-based rich text editor with a highly configurable toolbar
 * and a secure, clean data contract.
 *
 * @features
 * - **Configurable Toolbar**: The `toolbar` prop determines which editing features are available.
 * - **Advanced Validation**: Valibot schema validates the title and intelligently checks if content is empty.
 * - **Secure by Design**: Designed to work with a display component that sanitizes HTML.
 * - **Translatable**: Fully supports multilingual content by default.
 */

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { check, object, optional, string, type InferInput as ValibotInput } from 'valibot';
import type { RichTextProps } from './types';

// Helper to check if HTML content is effectively empty.
const isContentEmpty = (html: string) => {
	if (!html) return true;
	const stripped = html.replace(/<[^>]+>/g, '').trim();
	return stripped.length === 0;
};

// The validation schema is a function to accommodate the `required` flag.
const validationSchema = (field: FieldInstance) => {
	// The base schema for the rich text data object.
	const schema = object({
		title: string(), // Title can be optional.
		content: string() // HTML content.
	});

	// If the field is required, use `check` to check if the content is truly empty.
	if (field.required) {
		return check(schema, (data) => !isContentEmpty(data.content), {
			message: 'Content is required.'
		});
	}

	return optional(schema);
};

// Create the widget definition using the factory.
const RichTextWidget = createWidget<RichTextProps, ReturnType<typeof validationSchema>>({
	Name: 'RichText',
	Icon: 'mdi:format-pilcrow-arrow-right',
	Description: m.widget_richText_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/richtext/Input.svelte',
	displayComponentPath: '/src/widgets/core/richtext/Display.svelte',

	// Assign the validation schema function.
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		// Provide a default full toolbar configuration.
		toolbar: ['bold', 'italic', 'headings', 'lists', 'link', 'image', 'align', 'clear'],
		translated: true
	}
});

export default RichTextWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RichTextWidget>;
export type RichTextWidgetData = Input<ReturnType<typeof validationSchema>>;
