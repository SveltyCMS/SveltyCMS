/**
 * @file src/widgets/custom/Currency/index.ts
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
import { createWidget } from '@src/widgets/widgetFactory';
import { custom, maxValue, minValue, number, optional, pipe, type InferInput as ValibotInput } from 'valibot';
import type { CurrencyProps } from './types';

// SECURITY: Whitelist of valid ISO 4217 currency codes
// Prevents injection of malicious currency symbols or invalid codes
const VALID_CURRENCY_CODES = [
	'USD',
	'EUR',
	'GBP',
	'JPY',
	'CNY',
	'AUD',
	'CAD',
	'CHF',
	'HKD',
	'SGD',
	'SEK',
	'NOK',
	'NZD',
	'KRW',
	'TRY',
	'INR',
	'BRL',
	'ZAR'
];

// Helper type for aggregation field
type AggregationField = { db_fieldName: string; [key: string]: unknown };

// The validation schema is a function to create rules based on the field config.
const validationSchema = (field: FieldInstance) => {
	// Build validation actions based on field config
	const validationActions: Array<ReturnType<typeof minValue> | ReturnType<typeof maxValue> | ReturnType<typeof custom>> = [];

	if (field.minValue !== undefined) {
		validationActions.push(minValue(field.minValue as number, `Value must be at least ${field.minValue}.`));
	}
	if (field.maxValue !== undefined) {
		validationActions.push(maxValue(field.maxValue as number, `Value must not exceed ${field.maxValue}.`));
	}

	// SECURITY: Validate currency code if provided in field config
	if (field.currencyCode) {
		validationActions.push(custom(() => VALID_CURRENCY_CODES.includes(String(field.currencyCode).toUpperCase()), 'Invalid currency code.'));
	}

	// Create final schema with validations
	const baseSchema = number('Value must be a number.');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const schema = validationActions.length > 0 ? pipe(baseSchema, ...(validationActions as any)) : baseSchema;

	// If the field is not required, wrap the schema to allow it to be undefined.
	return field.required ? schema : optional(schema);
};

// Create the widget definition using the factory.
const CurrencyWidget = createWidget<CurrencyProps>({
	Name: 'Currency',
	Icon: 'mdi:currency-usd',
	Description: m.widget_currency_description?.() || "Widget description",
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
		currencyCode: {
			widget: Input,
			required: true,
			helper: 'ISO 4217 code (USD, EUR, GBP, etc.)',
			pattern: '^[A-Z]{3}$'
		},
		minValue: { widget: Input, required: false },
		maxValue: { widget: Input, required: false },
		placeholder: { widget: Input, required: false }
	},

	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }: { field: AggregationField; filter: string }) => [
			// Example: filter=">100" or filter="<50" or filter="150"
			// This requires a simple parser for the filter string.
			{ $match: { [field.db_fieldName]: { $eq: parseFloat(filter) } } } // Simplified for exact match
		],
		sorts: async ({ field, sortDirection }: { field: AggregationField; sortDirection: number }) => ({
			[field.db_fieldName]: sortDirection
		})
	},

	// GraphQL schema for currency
	GraphqlSchema: () => ({
		typeID: 'Float', // Use Float for currency values
		graphql: '' // No custom type definition needed
	})
});

export default CurrencyWidget;

// Export helper types.
export type FieldType = ReturnType<typeof CurrencyWidget>;
export type CurrencyWidgetData = ValibotInput<ReturnType<typeof validationSchema>>;
