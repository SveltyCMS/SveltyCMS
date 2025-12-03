/**
 * @file src/widgets/custom/Number/index.ts
 * @description Number Widget Definition.
 *
 * Implements a robust number input widget that stores a precise number.
 *
 * @features
 * - **Numeric Storage**: Stores data as a `number` for accuracy and calculations.
 * - **Dynamic Validation**: Schema adapts to `required`, `min`, and `max` settings.
 * - **Native Number Input**: Uses `<input type="number">` for optimal UX and accessibility.
 * - **Database Aggregation**: Supports numeric filtering (e.g., value > 100) and sorting.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/widgetFactory';
import { maxValue, minValue, number, optional, pipe, type InferInput as ValibotInput } from 'valibot';
import type { NumberProps } from './types';

// Helper type for aggregation field parameter
type AggregationField = { db_fieldName: string; [key: string]: unknown };

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// Build validation actions based on field config
	const validationActions: Array<ReturnType<typeof minValue> | ReturnType<typeof maxValue>> = [];

	if (field.min !== undefined) {
		validationActions.push(minValue(field.min as number, `Value must be at least ${field.min}.`));
	}
	if (field.max !== undefined) {
		validationActions.push(maxValue(field.max as number, `Value must not exceed ${field.max}.`));
	}

	// Create final schema with validations
	const baseSchema = number('Value must be a number.');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const schema = validationActions.length > 0 ? pipe(baseSchema, ...(validationActions as any)) : baseSchema;

	// If the field is not required, wrap the schema to allow it to be undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const NumberWidget = createWidget<NumberProps>({
	Name: 'Number',
	Icon: 'mdi:numeric',
	Description: m.widget_number_description(),
	inputComponentPath: '/src/widgets/custom/Number/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Number/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		step: 1,
		translated: false // A number is a universal value.
	},

	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		min: { widget: Input, required: false, helper: 'Minimum allowed value.' },
		max: { widget: Input, required: false, helper: 'Maximum allowed value.' },
		step: { widget: Input, required: false, helper: 'Stepping interval.' },
		placeholder: { widget: Input, required: false }
	},

	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
			// Example: filter=">100" or filter="<50" or filter="150"
			{ $match: { [field.db_fieldName]: { $eq: parseFloat(filter) } } }
		],
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[field.db_fieldName]: sortDirection
		})
	},

	// GraphQL schema for number
	GraphqlSchema: () => ({
		typeID: 'Float', // Use Float for numeric values
		graphql: '' // No custom type definition needed
	})
});

export default NumberWidget;

// Export helper types.
export type FieldType = ReturnType<typeof NumberWidget>;
export type NumberWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
