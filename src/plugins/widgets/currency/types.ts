/**
 * @file src/widgets/custom/Currency/types.ts
 * @description Type definitions for the Currency widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for currency handling.
 * - **Internationalization**: Includes `currencyCode` for proper formatting.
 */

// Defines the properties unique to the Currency widget, configured in the collection builder
export interface CurrencyProps {
  currencyCode: string; // ISO 4217 code (e.g., 'USD', 'EUR')
  minValue?: number; // Minimum allowed value
  maxValue?: number; // Maximum allowed value
  step?: number; // Step value for input
  prefix?: string; // Custom prefix
  suffix?: string; // Custom suffix
  placeholder?: string; // Input placeholder
  // Index signature to satisfy WidgetProps constraint
  [key: string]: unknown;
}
