/**
 * @file src/widgets/custom/colorpicker/index.ts
 * @description ColorPicker Widget Definition.
 *
 * Implements an intuitive color picker using the Three Pillars Architecture.
 * Stores a standard 6-digit hex color code as a string.
 *
 * @features
 * - **Simple Data Contract**: Stores a single, clean hex color string (e.g., '#FFFFFF').
 * - **Robust Validation**: Valibot schema ensures the value is a valid hex code.
 * - **Configurable GUI**: `GuiSchema` allows easy configuration in the Collection Builder.
 * - **Native Color Picker**: Uses the browser's native color input for a good UX.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { minLength, optional, pipe, regex, string, type InferInput as ValibotInput } from 'valibot';
import type { ColorPickerProps } from './types';

// The validation schema is a function to accommodate the `required` flag.
const validationSchema = (field: FieldInstance) => {
	// Base schema validates the hex color format.
	const hexSchema = pipe(string(), regex(/^#[0-9a-f]{6}$/i, 'Must be a valid 6-digit hex code (e.g., #FF5733).'));

	// If the field is required, ensure it's not an empty string before checking the format.
	if (field.required) {
		return pipe(string(), minLength(1, 'A color is required.'), hexSchema);
	}

	// If not required, allow an empty string or a valid hex code.
	return optional(hexSchema, '');
};

// Create the widget definition using the factory.
const ColorPickerWidget = createWidget<ColorPickerProps, ReturnType<typeof validationSchema>>({
	Name: 'ColorPicker',
	Icon: 'ic:outline-colorize',
	Description: m.widget_colorPicker_description(),
	inputComponentPath: '/src/widgets/custom/colorpicker/Input.svelte',
	displayComponentPath: '/src/widgets/custom/colorpicker/Display.svelte',
	validationSchema,

	// Set widget-specific defaults. A color is a universal value.
	defaults: {
		translated: false
	},

	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		width: { widget: Input, required: false }
	}
});

export default ColorPickerWidget;

// Export helper types.
export type FieldType = ReturnType<typeof ColorPickerWidget>;
export type ColorPickerWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
