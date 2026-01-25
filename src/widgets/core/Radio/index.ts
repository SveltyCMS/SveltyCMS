/**
 * @file src/widgets/core/Radio/index.ts
 * @description Radio Widget Definition.
 *
 * Implements a radio button group for selecting a single option from a list.
 *
 * @features
 * - **Dynamic Options**: Configurable with a list of `label`/`value` pairs.
 * - **Strict Validation**: Valibot schema ensures the selected value is one of the allowed options.
 * - **Accessible**: The `Input.svelte` component uses `fieldset` and `legend` for accessibility.
 * - **Clean Data Storage**: Stores only the primitive value of the selected option.
 */

// Import components needed for the GuiSchema
// import Input from '@components/system/inputs/Input.svelte';
// import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widgetFactory';
import { literal, optional, union, type InferInput as ValibotInput } from 'valibot';
import type { RadioProps, RadioOption } from './types';

// The validation schema is a function that generates rules based on the configured options.
const validationSchema = (field: FieldInstance & RadioProps) => {
	// Extract the allowed values from the field's options array.
	const allowedValues = (field.options as RadioOption[] | undefined)?.map((opt) => literal(opt.value)) || [];

	// Create a schema that only allows one of the specified literal values.
	// This provides powerful, automatic validation.
	const schema = union([...allowedValues], 'Please select a valid option.');

	// If the field is not required, the value can be null or undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const RadioWidget = createWidget<RadioProps>({
	Name: 'Radio',
	Icon: 'mdi:radiobox-marked',
	Description: m.widget_radio_description(),

	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Radio/Input.svelte',
	displayComponentPath: '/src/widgets/core/Radio/Display.svelte',

	// Assign the dynamic validation schema.
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		options: [],
		translated: false, // A single selection is not typically translated.
		legend: ''
	},

	// GuiSchema allows a simple text area for defining options in the collection builder.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		legend: { widget: 'Input', required: false, helper: 'Legend text for the radio group' },
		options: {
			widget: 'Input', // Using a simple textarea for JSON/JS array input
			required: true,
			helper: "Enter an array of objects, e.g., [{label: 'First', value: 1}, {label: 'Second', value: 2}]"
		}
	},

	// GraphQL schema for radio
	GraphqlSchema: () => ({
		typeID: 'String', // Radio value as string
		graphql: '' // No custom type definition needed
	})
});

export default RadioWidget;

// Export helper types.
export type FieldType = ReturnType<typeof RadioWidget>;
export type RadioWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
