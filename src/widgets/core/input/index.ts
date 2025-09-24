/**
 * @file src/widgets/core/text/index.ts
 * @description Text Widget Definition.
 *
 * Implements a versatile text input widget using the Three Pillars Architecture.
 * This widget features a dynamic validation schema that adapts to the field's configuration.
 *
 * @features
 * - **Dynamic Validation**: Schema is generated based on `required`, `minLength`, etc.
 * - **Configurable GUI**: `GuiSchema` allows easy configuration in the Collection Builder.
 * - **Translatable**: Fully supports multilingual content entry by default.
 * - **Database Aggregation**: Supports case-insensitive text search and sorting.
 */

// Import components needed for the GuiSchema
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

import { createWidget } from '@src/widgets/factory';
import { string, pipe, minLength, maxLength, optional, type Input as ValibotInput } from 'valibot';
import type { TextProps } from './types';
import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';

// The validation schema is a function that receives the field config and returns a schema.
const validationSchema = (field: FieldInstance) => {
	// Start with a base string schema and trim whitespace.
	let schema = pipe(string(), (input) => input.trim());

	// Dynamically add validation rules based on the field's configuration.
	if (field.required) {
		schema = pipe(schema, minLength(1, 'This field is required.'));
	}
	if (field.minLength) {
		schema = pipe(schema, minLength(field.minLength, `Must be at least ${field.minLength} characters.`));
	}
	if (field.maxLength) {
		schema = pipe(schema, maxLength(field.maxLength, `Must be no more than ${field.maxLength} characters.`));
	}

	// If the field is not required, wrap the schema to allow empty/optional values.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const TextWidget = createWidget<TextProps, ReturnType<typeof validationSchema>>({
	Name: 'Text',
	Icon: 'mdi:format-text',
	Description: m.widget_text_description(),
	inputComponentPath: '/src/widgets/core/text/Input.svelte',
	displayComponentPath: '/src/widgets/core/text/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		translated: true
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		placeholder: { widget: Input, required: false },
		minLength: { widget: Input, required: false },
		maxLength: { widget: Input, required: false }
	},

	// Aggregations for text search and sorting.
	aggregations: {
		filters: async ({ field, filter, contentLanguage }) => [
			{ $match: { [`${field.db_fieldName}.${contentLanguage}`]: { $regex: filter, $options: 'i' } } }
		],
		sorts: async ({ field, sortDirection, contentLanguage }) => ({
			[`${field.db_fieldName}.${contentLanguage}`]: sortDirection
		})
	}
});

export default TextWidget;

// Export helper types.
export type FieldType = ReturnType<typeof TextWidget>;
export type TextWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
