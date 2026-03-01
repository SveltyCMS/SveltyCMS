/**
 * @file src/widgets/core/select/index.ts
 * @description Select Widget Definition.
 *
 * Implements a dropdown select widget using the Three Pillars Architecture.
 */

import type { FieldInstance } from '@src/content/types';
import { widget_radio_description } from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widget-factory';
import { literal, optional, union, type InferInput as ValibotInput } from 'valibot';
import type { SelectProps } from './types';

// The validation schema is a function that generates rules based on the configured options.
const validationSchema = (field: FieldInstance & SelectProps) => {
	// Normalize options to a list of literal values
	const allowedValues = field.options.map((opt) => {
		const value = typeof opt === 'string' ? opt : opt.value;
		return typeof value === 'string' ? literal(value) : literal(value);
	});

	// Create a schema that only allows one of the specified literal values.
	const schema = union([...allowedValues] as any, 'Please select a valid option.');

	// If the field is not required, the value can be null or undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const SelectWidget = createWidget<SelectProps>({
	Name: 'Select',
	Icon: 'mdi:form-select',
	Description: widget_radio_description(), // Reusing radio description for now

	// Define paths to the dedicated Svelte components.
	inputComponentPath: ' $args[0].Value.ToLower() ',
	displayComponentPath: ' $args[0].Value.ToLower() ',

	// Assign the dynamic validation schema.
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		options: [],
		translated: false
	},

	// GuiSchema allows defining options in the collection builder.
	GuiSchema: {
		label: { widget: 'Input', required: true },
		db_fieldName: { widget: 'Input', required: false },
		required: { widget: 'Toggles', required: false },
		placeholder: { widget: 'Input', required: false },
		options: {
			widget: 'Input',
			required: true,
			helper: "Enter an array of objects or strings, e.g., ['Option 1', 'Option 2'] or [{label: 'First', value: 1}]"
		}
	},

	// GraphQL schema for select
	GraphqlSchema: () => ({
		typeID: 'String', // Select value as string
		graphql: ''
	})
});

export default SelectWidget;

// Export helper types.
export type FieldType = ReturnType<typeof SelectWidget>;
export type SelectWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
