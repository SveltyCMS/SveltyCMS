// Import components needed for the GuiSchema
// import Input from '@components/system/inputs/input.svelte';
// import Toggles from '@components/system/inputs/toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import { widget_richText_description } from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widget-factory';
import { custom, type InferInput, object, optional, pipe, string } from 'valibot';
import type { RichTextProps } from './types';

// Helper to strip HTML-like tags and angle brackets from a string.
// This is intentionally aggressive and is only used for "is empty" checks,
// not for producing HTML to render.
const stripHtmlTags = (html: string): string => {
	if (!html) {
		return '';
	}

	let previous: string;
	let current = html;

	// Repeatedly remove tags like <tag ...> until no more matches remain.
	// This avoids issues where a single multi-character replacement
	// can cause previously hidden patterns to reappear.
	do {
		previous = current;
		current = current.replace(/<[^>]*>/g, '');
	} while (current !== previous);

	// Remove any remaining angle brackets to avoid partial tag fragments
	// such as "<script" surviving the stripping process.
	current = current.replace(/[<>]/g, '');

	return current;
};

// Helper to check if HTML content is effectively empty.
// NOTE: Input.svelte already sanitizes with DOMPurify before storage,
// so we don't need to remove scripts here (defense-in-depth handled upstream)
const isContentEmpty = (html: string) => {
	if (!html) {
		return true;
	}

	// Strip all HTML tags and angle brackets to check for actual text content.
	const stripped = stripHtmlTags(html).trim();

	return stripped.length === 0;
};

// The validation schema is a function to accommodate the `required` flag.
const validationSchema = (field: FieldInstance) => {
	// The base schema for the rich text data object.
	const schema = object({
		title: optional(string()), // Title can be optional.
		content: string() // HTML content.
	});

	// If the field is required, validate that content is not empty
	if (field.required) {
		return object({
			title: optional(string()),
			content: pipe(
				string(),
				custom((input) => !isContentEmpty(input as string), 'Content is required.')
			)
		});
	}

	return optional(schema);
};

// Create the widget definition using the factory.
const RichTextWidget = createWidget<RichTextProps>({
	Name: 'RichText',
	Icon: 'mdi:format-pilcrow-arrow-right',
	Description: widget_richText_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/RichText/Input.svelte',
	displayComponentPath: '/src/widgets/core/RichText/Display.svelte',

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
export type RichTextWidgetData = InferInput<ReturnType<typeof validationSchema>>;
