/**
 * @file src/widgets/custom/currency/types.ts
 * @description Type definitions for the Currency widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for currency handling.
 * - **Internationalization**: Includes `currencyCode` for proper formatting.
 */

// Defines the properties unique to the Currency widget, configured in the collection builder
export interface CurrencyProps {
	// The ISO 4217 currency code (e.g., 'EUR', 'USD', 'JPY') @default 'EUR'
	currencyCode?: string;

	// The minimum allowed numeric value
	minValue?: number;

	// The maximum allowed numeric value
	maxValue?: number;

	// A placeholder for the input field
	placeholder?: string;
}
