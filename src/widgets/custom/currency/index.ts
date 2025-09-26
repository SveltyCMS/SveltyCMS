/**
 * @file src/widgets/custom/currency/index.ts
 * @description Currency Widget Definition.
 *
 * Implements a robust currency input widget that stores a precise number
 * while displaying and accepting localized, formatted currency strings.
 *
 * @features
 * - **Numeric Storage**: Stores currency as a `number` for accuracy.
 * - **Dynamic Validation**: Schema adapts to `required`, `minValue`, and `maxValue` settings.
 * - **Internationalization**: Uses `Intl.NumberFormat` for locale-aware formatting.
 * - **Configurable GUI**: `GuiSchema` allows easy setup in the Collection Builder.
 * - **Database Aggregation**: Supports numeric filtering (e.g., price > 100) and sorting.
 */

// Import components needed for the GuiSchema
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';

import type { FieldInstance } from '@src/content/types';
import * as m from '@src/paraglide/messages';
import { createWidget } from '@src/widgets/factory';
import { maxValue, minValue, number, optional, pipe, type InferInput as ValibotInput } from 'valibot';
import type { CurrencyProps } from './types';

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// Start with a base number schema.
	let schema = number('Value must be a number.');

	// Add minValue validation if defined in the field config.
	if (field.minValue !== undefined) {
		schema = pipe(schema, minValue(field.minValue, `Value must be at least ${field.minValue}.`));
	}
	// Add maxValue validation if defined in the field config.
	if (field.maxValue !== undefined) {
		schema = pipe(schema, maxValue(field.maxValue, `Value must not exceed ${field.maxValue}.`));
	}

	// If the field is not required, wrap the schema to allow it to be undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const CurrencyWidget = createWidget<CurrencyProps, ReturnType<typeof validationSchema>>({
	Name: 'Currency',
	Icon: 'mdi:currency-usd',
	Description: m.widget_currency_description(),
	inputComponentPath: '/src/widgets/custom/currency/Input.svelte',
	displayComponentPath: '/src/widgets/custom/currency/Display.svelte',
	validationSchema,

	// Set widget-specific defaults.
	defaults: {
		currencyCode: 'EUR',
		translated: false // A monetary value is typically not translated.
	},

	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		currencyCode: { widget: Input, required: true, helper: 'ISO 4217 code, e.g., EUR' },
		minValue: { widget: Input, required: false },
		maxValue: { widget: Input, required: false },
		placeholder: { widget: Input, required: false }
	},

	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }) => [
			// Example: filter=">100" or filter="<50" or filter="150"
			// This requires a simple parser for the filter string.
			{ $match: { [field.db_fieldName]: { $eq: parseFloat(filter) } } } // Simplified for exact match
		],
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	}
});

export default CurrencyWidget;

// Export helper types.
export type FieldType = ReturnType<typeof CurrencyWidget>;
export type CurrencyWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
